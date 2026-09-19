import json
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional
import numpy as np
from ..network import CityNetwork
from ..junction import Junction


class SignalPlanSpec:
    PLANS = [
        {"a": 0, "b": 0, "ns": 40.0, "ew": 30.0, "label": "NS 40 / EW 30 (Moderate NS)"},
        {"a": 0, "b": 1, "ns": 50.0, "ew": 20.0, "label": "NS 50 / EW 20 (Strong NS)"},
        {"a": 1, "b": 0, "ns": 30.0, "ew": 40.0, "label": "EW 40 / NS 30 (Moderate EW)"},
        {"a": 1, "b": 1, "ns": 20.0, "ew": 50.0, "label": "EW 50 / NS 20 (Strong EW)"},
    ]

    @staticmethod
    def get_plan(a: int, b: int) -> Dict[str, Any]:
        idx = (a << 1) | b
        return SignalPlanSpec.PLANS[idx]


class QUBOBuilder:
    def __init__(
        self,
        network: CityNetwork,
        weights_config_path: Optional[str] = None,
        weight_mode: str = "NORMAL",
    ):
        self.network = network
        if weights_config_path is None:
            weights_config_path = str(Path(__file__).resolve().parent.parent.parent / "config" / "qubo_weights.json")
        with open(weights_config_path, "r", encoding="utf-8") as f:
            self.weights_data = json.load(f)

        self.weight_mode = weight_mode
        self.weights = dict(self.weights_data["modes"].get(weight_mode, self.weights_data["modes"]["NORMAL"]))
        self.junction_ids = sorted(list(self.network.junctions.keys()))
        self.num_junctions = len(self.junction_ids)
        self.num_qubits = self.num_junctions * 2  # 2 bits per junction: 4 -> 8 (256 states), 6 -> 12, 8 -> 16

        # Active ambulance target corridor (if any)
        self.ambulance_corridor: List[Tuple[str, str]] = []  # (junction_id, desired_axis)

    def set_weight_mode(self, mode: str):
        if mode in self.weights_data["modes"]:
            self.weight_mode = mode
            self.weights = dict(self.weights_data["modes"][mode])

    def set_custom_weight(self, key: str, value: float):
        self.weights[key] = value

    def set_ambulance_corridor(self, corridor: List[Tuple[str, str]]):
        self.ambulance_corridor = corridor

    def clear_ambulance_corridor(self):
        self.ambulance_corridor = []

    def compute_local_cost_table(
        self,
        junction: Junction,
        approaches: Dict[str, Any],
        link_vehicles: Dict[str, List[Any]],
        current_plan_bits: Tuple[int, int],
    ) -> List[float]:
        """
        Evaluates queueing, delay, fuel, and CO2 forecast for the 4 candidate plans:
        0: (0,0) NS 40 / EW 30
        1: (0,1) NS 50 / EW 20
        2: (1,0) EW 40 / NS 30
        3: (1,1) EW 50 / NS 20
        """
        costs = []
        q_ns = junction.queues["N"] + junction.queues["S"]
        q_ew = junction.queues["E"] + junction.queues["W"]

        w1 = self.weights.get("w1_waiting", 1.0)
        w2 = self.weights.get("w2_queue", 1.2)
        w3 = self.weights.get("w3_spillback", 2.5)
        w4 = self.weights.get("w4_fuel", 0.8)
        w5 = self.weights.get("w5_co2", 0.8)
        w6 = self.weights.get("w6_emergency_delay", 5.0)
        w7 = self.weights.get("w7_signal_change_penalty", 0.6)

        # Emergency preemption check for this junction
        emergency_axis = None
        for j_id, axis in self.ambulance_corridor:
            if j_id == junction.id:
                emergency_axis = axis
                break

        for plan in SignalPlanSpec.PLANS:
            a, b = plan["a"], plan["b"]
            ns_green = plan["ns"]
            ew_green = plan["ew"]

            # Forecast residual queue and wait after green allocation
            # Green gives capacity ~0.5 veh/s per lane
            served_ns = min(q_ns, int(ns_green * 0.45))
            served_ew = min(q_ew, int(ew_green * 0.45))
            residual_ns = max(0, q_ns - served_ns)
            residual_ew = max(0, q_ew - served_ew)
            est_wait = (residual_ns * (ew_green + 10.0) + residual_ew * (ns_green + 10.0)) / max(1, q_ns + q_ew)
            est_queue = residual_ns + residual_ew

            # Spillback risk
            spillback_cost = 0.0
            for arm, arm_q in junction.queues.items():
                link = approaches.get(arm)
                if link and arm_q > (link.length_m / 6.0) * 0.7:
                    spillback_cost += 10.0

            # Fuel & CO2 estimated from idling of residual queues
            est_idle_fuel = (residual_ns + residual_ew) * 0.38 * 30.0 / 1000.0  # liters
            est_co2 = est_idle_fuel * 2.31

            # Hamming signal-change penalty against current plan
            hamming = abs(a - current_plan_bits[0]) + abs(b - current_plan_bits[1])
            change_penalty = w7 * hamming

            # Emergency corridor penalty
            emerg_penalty = 0.0
            if emergency_axis:
                chosen_axis = "EW" if a == 1 else "NS"
                if chosen_axis != emergency_axis:
                    emerg_penalty = w6 * 50.0  # Heavy penalty for opposing ambulance axis
                else:
                    emerg_penalty = -w6 * (20.0 + 10.0 * b)  # Reward strong bias along ambulance axis

            plan_cost = (
                w1 * est_wait
                + w2 * est_queue
                + w3 * spillback_cost
                + w4 * est_idle_fuel
                + w5 * est_co2
                + change_penalty
                + emerg_penalty
            )
            costs.append(float(plan_cost))

        return costs

    def build_qubo(
        self,
        junctions: Dict[str, Junction],
        link_vehicles: Dict[str, List[Any]],
        current_plans: Optional[Dict[str, Tuple[int, int]]] = None,
    ) -> Tuple[np.ndarray, float, Dict[str, Any]]:
        """
        Builds upper-triangular QUBO matrix Q of size (N, N) where N = 2 * num_junctions.
        Returns: (Q, constant_offset, explanation_metadata)
        """
        n = self.num_qubits
        Q = np.zeros((n, n), dtype=np.float64)
        constant_offset = 0.0
        meta_explanation: Dict[str, Any] = {
            "local_coefficients": {},
            "couplings": [],
            "weight_mode": self.weight_mode,
        }

        if current_plans is None:
            current_plans = {j_id: (0, 0) for j_id in self.junction_ids}

        # 1. Local Junction Costs (4 numbers -> 3 coefficients + 1 offset)
        for i, j_id in enumerate(self.junction_ids):
            junction = junctions[j_id]
            approaches = self.network.get_approaches(j_id)
            c_bits = current_plans.get(j_id, (0, 0))

            costs = self.compute_local_cost_table(junction, approaches, link_vehicles, c_bits)
            C00, C01, C10, C11 = costs[0], costs[1], costs[2], costs[3]

            c0 = C00
            qa = C10 - C00
            qb = C01 - C00
            qab = C11 - C10 - C01 + C00

            idx_a = 2 * i
            idx_b = 2 * i + 1

            constant_offset += c0
            Q[idx_a, idx_a] += qa
            Q[idx_b, idx_b] += qb
            Q[idx_a, idx_b] += qab

            meta_explanation["local_coefficients"][j_id] = {
                "costs": [round(c, 2) for c in costs],
                "raw_costs": list(costs),
                "qa": round(qa, 3),
                "qb": round(qb, 3),
                "qab": round(qab, 3),
                "offset": round(c0, 3),
            }

        # 2. Inter-Junction Couplings
        # For each physical link between junction i and j
        progression_reward = self.weights.get("progression_reward", 1.5)
        spillback_penalty = self.weights.get("spillback_penalty", 3.0)

        for u, v, data in self.network.graph.edges(data=True):
            if u in self.junction_ids and v in self.junction_ids:
                i = self.junction_ids.index(u)
                j = self.junction_ids.index(v)
                if i >= j:
                    continue  # Undirected pair consideration

                link = data.get("link")
                if not link or link.is_closed:
                    continue

                idx_ai = 2 * i
                idx_aj = 2 * j

                # Determine orientation: East-West vs North-South connection
                u_pos = (self.network.junctions[u]["world_x"], self.network.junctions[u]["world_y"])
                v_pos = (self.network.junctions[v]["world_x"], self.network.junctions[v]["world_y"])
                is_horizontal = abs(u_pos[0] - v_pos[0]) > abs(u_pos[1] - v_pos[1])

                link_vehs = len(link_vehicles.get(link.id, []))
                is_heavy = link_vehs > 5

                if is_horizontal:
                    # EW link: If both are EW (a_i=1, a_j=1), reward platoon progression
                    if is_heavy:
                        # -R * a_i * a_j
                        Q[idx_ai, idx_aj] -= progression_reward
                        meta_explanation["couplings"].append({
                            "type": "progression_ew",
                            "j1": u, "j2": v,
                            "val": -progression_reward,
                        })
                    # Downstream spillback penalty
                    v_q = junctions[v].queues["W"] if u_pos[0] < v_pos[0] else junctions[v].queues["E"]
                    if v_q > 10:
                        # Feeding heavy EW into congested downstream
                        pen = spillback_penalty * 0.5
                        Q[idx_ai, idx_ai] += pen
                        meta_explanation["couplings"].append({
                            "type": "downstream_spillback_ew",
                            "j1": u, "j2": v,
                            "val": pen,
                        })
                else:
                    # NS link: If both are NS (a_i=0, a_j=0), reward progression
                    # In binary, (1 - a_i)(1 - a_j) = 1 - a_i - a_j + a_i * a_j
                    if is_heavy:
                        constant_offset -= progression_reward
                        Q[idx_ai, idx_ai] += progression_reward
                        Q[idx_aj, idx_aj] += progression_reward
                        Q[idx_ai, idx_aj] -= progression_reward
                        meta_explanation["couplings"].append({
                            "type": "progression_ns",
                            "j1": u, "j2": v,
                            "val": -progression_reward,
                        })

        return Q, constant_offset, meta_explanation

    def evaluate_direct_cost(self, meta: Dict[str, Any], bitstring: List[int]) -> float:
        cost = 0.0
        for i, j_id in enumerate(self.junction_ids):
            a_i = bitstring[2 * i]
            b_i = bitstring[2 * i + 1]
            plan_idx = (a_i << 1) | b_i
            cost += meta["local_coefficients"][j_id]["raw_costs"][plan_idx]

        for c in meta["couplings"]:
            u = c["j1"]
            v = c["j2"]
            i = self.junction_ids.index(u)
            j = self.junction_ids.index(v)
            a_i = bitstring[2 * i]
            a_j = bitstring[2 * j]
            val = c["val"]
            if c["type"] == "progression_ew":
                if a_i == 1 and a_j == 1:
                    cost += val
            elif c["type"] == "progression_ns":
                if a_i == 0 and a_j == 0:
                    cost += val
            elif c["type"] == "downstream_spillback_ew":
                if a_i == 1:
                    cost += val

        return float(cost)

    def evaluate_qubo_energy(self, Q: np.ndarray, offset: float, bitstring: List[int]) -> float:
        x = np.array(bitstring, dtype=np.float64)
        return float(x.T @ Q @ x + offset)
