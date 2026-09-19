import json
from pathlib import Path
from typing import Dict, Any, Tuple, List, Optional
import numpy as np

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"

class QuboBuilder:
    def __init__(self, junctions_order: List[str], weights: Optional[Dict[str, float]] = None):
        self.junctions = list(junctions_order)
        self.num_junctions = len(self.junctions)
        self.num_qubits = self.num_junctions * 2  # 2 qubits per junction: a_i, b_i

        with open(CONFIG_DIR / "weights.json", "r", encoding="utf-8") as f:
            all_weights = json.load(f)["modes"]
        self.weights = weights or all_weights["normal"]

    def bit_indices(self, junction_idx: int) -> Tuple[int, int]:
        """Returns qubit index for (a_i, b_i)."""
        return 2 * junction_idx, 2 * junction_idx + 1

    def build_qubo(
        self,
        junction_states: Dict[str, Any],
        road_network: Any,
        emergency_priority: Optional[Dict[str, str]] = None,
        weather_mode: str = "clear"
    ) -> Tuple[np.ndarray, float, Dict[str, Any]]:
        """
        Builds the upper-triangular QUBO matrix Q (size n x n) such that:
        Cost(x) = x^T Q x + c_const.
        x in {0, 1}^n where for junction i:
          x[2*i] = a_i (0: NS priority, 1: EW priority)
          x[2*i+1] = b_i (0: Moderate bias, 1: Strong bias)
        """
        n = self.num_qubits
        Q = np.zeros((n, n), dtype=np.float64)
        c_const = 0.0

        w_wait = self.weights.get("waiting", 1.0)
        w_queue = self.weights.get("queue", 1.5)
        w_cong = self.weights.get("congestion", 2.0)
        w_fuel = self.weights.get("fuel", 0.5)
        w_co2 = self.weights.get("co2", 0.5)
        w_emg = self.weights.get("emergency", 10.0)
        w_change = self.weights.get("change_penalty", 1.2)

        why_terms = {}

        # 1. Local costs for each junction
        for idx, j_id in enumerate(self.junctions):
            j_state = junction_states[j_id]
            ia, ib = self.bit_indices(idx)

            q_n = j_state.queues.get("N", 0)
            q_s = j_state.queues.get("S", 0)
            q_e = j_state.queues.get("E", 0)
            q_w = j_state.queues.get("W", 0)

            q_ns = q_n + q_s
            q_ew = q_e + q_w

            # 4 discrete plans:
            # (0,0): NS 40s / EW 30s
            # (0,1): NS 50s / EW 20s
            # (1,0): EW 40s / NS 30s
            # (1,1): EW 50s / NS 20s
            cost_00 = (q_ns * 30.0 + q_ew * 40.0) * w_wait + (q_ns + q_ew) * w_queue
            cost_01 = (q_ns * 20.0 + q_ew * 50.0) * w_wait + (q_ns * 0.8 + q_ew * 1.3) * w_queue
            cost_10 = (q_ew * 30.0 + q_ns * 40.0) * w_wait + (q_ew + q_ns) * w_queue
            cost_11 = (q_ew * 20.0 + q_ns * 50.0) * w_wait + (q_ew * 0.8 + q_ns * 1.3) * w_queue

            # Fuel and emissions heuristic
            cost_00 += (q_ns * 0.05 + q_ew * 0.07) * (w_fuel + w_co2)
            cost_01 += (q_ns * 0.03 + q_ew * 0.09) * (w_fuel + w_co2)
            cost_10 += (q_ew * 0.05 + q_ns * 0.07) * (w_fuel + w_co2)
            cost_11 += (q_ew * 0.03 + q_ns * 0.09) * (w_fuel + w_co2)

            # Signal change penalty: Hamming distance against current plan
            curr_plan = j_state.current_plan_id
            curr_a = 1 if curr_plan in (2, 3) else 0
            curr_b = 1 if curr_plan in (1, 3) else 0

            # Exact mapping: "Four numbers become three coefficients"
            c0 = cost_00
            ca = cost_10 - cost_00
            cb = cost_01 - cost_00
            cab = cost_11 - cost_10 - cost_01 + cost_00

            # Add change penalty: w_change * (|a - curr_a| + |b - curr_b|)
            # |x - x0| = x0 + (1 - 2*x0)*x
            c0 += w_change * (curr_a + curr_b)
            ca += w_change * (1.0 - 2.0 * curr_a)
            cb += w_change * (1.0 - 2.0 * curr_b)

            # Emergency corridor priority
            if emergency_priority and j_id in emergency_priority:
                target_axis = emergency_priority[j_id]
                if target_axis == "NS":
                    # Heavy penalty on a=1 (EW)
                    ca += w_emg * 100.0
                    cb -= w_emg * 20.0  # Encourage strong bias for NS
                elif target_axis == "EW":
                    # Heavy reward on a=1 (EW) -> negative linear coefficient
                    ca -= w_emg * 100.0
                    cb -= w_emg * 20.0  # Encourage strong bias for EW

            c_const += c0
            Q[ia, ia] += ca
            Q[ib, ib] += cb
            Q[ia, ib] += cab

            why_terms[j_id] = {
                "costs": [round(cost_00, 1), round(cost_01, 1), round(cost_10, 1), round(cost_11, 1)],
                "q_ns": q_ns,
                "q_ew": q_ew,
                "curr_plan": curr_plan
            }

        # 2. Quadratic coupling between neighbouring junctions (Platoon progression & spillback)
        graph = road_network.graph
        for u_idx, u_id in enumerate(self.junctions):
            for v_idx, v_id in enumerate(self.junctions):
                if u_idx >= v_idx:
                    continue
                if graph.has_edge(u_id, v_id):
                    edge_data = graph[u_id][v_id]
                    num_veh = edge_data.get("current_vehicles", 0)
                    cap = edge_data.get("capacity", 30)

                    # Determine primary axis between u and v
                    ju = junction_states[u_id]
                    jv = junction_states[v_id]
                    is_ew_link = abs(jv.x - ju.x) > abs(jv.y - ju.y)

                    ia_u, _ = self.bit_indices(u_idx)
                    ia_v, _ = self.bit_indices(v_idx)

                    # Platoon progression reward: If link has high traffic, reward both having same axis green
                    if num_veh > 8:
                        coupling_weight = w_cong * (num_veh / cap) * 5.0
                        if is_ew_link:
                            # Reward both choosing EW (a_u=1 and a_v=1)
                            # Penalty for mismatch: (1 - a_u) or (1 - a_v)
                            # We add: coupling_weight * (a_u - a_v)^2 = coupling_weight * (a_u + a_v - 2*a_u*a_v)
                            Q[ia_u, ia_u] += coupling_weight
                            Q[ia_v, ia_v] += coupling_weight
                            Q[ia_u, ia_v] -= 2.0 * coupling_weight
                        else:
                            # NS link: reward both choosing NS (a_u=0 and a_v=0)
                            Q[ia_u, ia_u] += coupling_weight
                            Q[ia_v, ia_v] += coupling_weight
                            Q[ia_u, ia_v] -= 2.0 * coupling_weight

                    # Spillback penalty: if downstream v is near capacity on u's feed, penalize u sending green
                    if num_veh > 0.8 * cap:
                        spill_penalty = w_cong * 20.0
                        if is_ew_link:
                            # penalize u green EW (a_u = 1)
                            Q[ia_u, ia_u] += spill_penalty
                        else:
                            # penalize u green NS (a_u = 0) -> add penalty if 1-a_u=1 => const + penalty, - penalty*a_u
                            c_const += spill_penalty
                            Q[ia_u, ia_u] -= spill_penalty

        return Q, c_const, why_terms

    def direct_cost(self, bitstring: str, Q: np.ndarray, c_const: float) -> float:
        """Evaluate direct QUBO cost: x^T Q x + c_const."""
        x = np.array([int(b) for b in bitstring], dtype=np.float64)
        return float(x.T @ Q @ x + c_const)
