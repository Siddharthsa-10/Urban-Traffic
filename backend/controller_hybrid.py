import time
from typing import Dict, Any, List, Optional, Tuple
from .qubo_builder import QuboBuilder
from .qaoa_solver import QaoaSolver
from .classical_solvers import BruteForceSolver, SimulatedAnnealingSolver
from .safety_validator import SafetyValidator
from .controller_rule import RuleBasedController
from .controller_fixed import FixedTimeController

class HybridQuantumController:
    """
    Hybrid Quantum-Classical Signal Controller.
    Every 30s epoch:
    1. Reads sensors -> builds 12/16-qubit QUBO matrix.
    2. Runs QAOA (Aer) + Brute Force Exact + Simulated Annealing.
    3. Validates proposed plans through classical SafetyValidator.
    4. Handles fail-safe fallback chain if quantum fails or is killed.
    """
    def __init__(self, junctions_order: List[str], depth_p: int = 1, shots: int = 1024):
        self.junctions_order = list(junctions_order)
        self.num_junctions = len(self.junctions_order)
        self.num_qubits = self.num_junctions * 2

        self.qubo_builder = QuboBuilder(self.junctions_order)
        self.qaoa_solver = QaoaSolver(num_qubits=self.num_qubits, depth_p=depth_p, shots=shots)
        self.brute_force = BruteForceSolver(num_qubits=self.num_qubits)
        self.annealer = SimulatedAnnealingSolver(num_qubits=self.num_qubits, steps=1500)

        self.safety_validator = SafetyValidator()
        self.rule_fallback = RuleBasedController()
        self.fixed_fallback = FixedTimeController()

        # Fallback chain state
        self.is_quantum_killed = False
        self.active_fallback_level = "QAOA (Quantum)"  # "QAOA (Quantum)", "Classical Exact", "Rule-Based", "Fixed-Time"
        self.last_solve_data: Optional[Dict[str, Any]] = None
        self.solve_count = 0

    def set_quantum_killed(self, killed: bool):
        self.is_quantum_killed = killed
        if killed:
            self.active_fallback_level = "Classical Exact"
        else:
            self.active_fallback_level = "QAOA (Quantum)"

    def solve_epoch(
        self,
        junction_states: Dict[str, Any],
        road_network: Any,
        emergency_priority: Optional[Dict[str, str]] = None,
        weather_mode: str = "clear"
    ) -> Tuple[Dict[str, int], Dict[str, Any]]:
        self.solve_count += 1
        t_start = time.perf_counter()

        # 1. Build QUBO
        Q, c_const, why_terms = self.qubo_builder.build_qubo(
            junction_states, road_network, emergency_priority, weather_mode
        )

        # 2. Run Classical Exact (Brute Force) for ground truth & benchmarking
        bf_res = self.brute_force.solve(Q, c_const)
        opt_cost = bf_res["best_cost"]
        opt_bitstring = bf_res["best_bitstring"]

        # 3. Run Simulated Annealing baseline
        sa_res = self.annealer.solve(Q, c_const)

        # 4. Run QAOA (or skip if quantum service killed)
        if not self.is_quantum_killed:
            qaoa_res = self.qaoa_solver.solve(
                Q, c_const,
                optimum_cost=opt_cost,
                optimum_bitstring=opt_bitstring,
                max_iter=6
            )
            candidate_bitstring = qaoa_res["best_bitstring"]
            used_method = "QAOA (Quantum)"
        else:
            # Fallback drill: quantum disabled
            candidate_bitstring = bf_res["best_bitstring"]
            used_method = "Classical Exact"
            qaoa_res = {
                "method": "QAOA (Disabled/Killed)",
                "p": 1,
                "num_qubits": self.num_qubits,
                "circuit_depth": 0,
                "gate_counts": {},
                "shots": 0,
                "best_bitstring": candidate_bitstring,
                "best_cost": opt_cost,
                "approximation_ratio": 1.0,
                "optimum_probability": 0.0,
                "wall_clock_ms": 0.0,
                "optimizer_iterations": 0,
                "optimizer_trace": [],
                "histogram": []
            }

        # 5. Parse proposed plans per junction from candidate bitstring
        decisions: Dict[str, int] = {}
        safety_reports = {}
        all_passed = True

        for idx, j_id in enumerate(self.junctions_order):
            ia = 2 * idx
            ib = 2 * idx + 1
            if ia < len(candidate_bitstring) and ib < len(candidate_bitstring):
                a_val = int(candidate_bitstring[ia])
                b_val = int(candidate_bitstring[ib])
                plan_id = (a_val << 1) | b_val
            else:
                plan_id = 0

            # 6. Safety validation
            is_valid, violations = self.safety_validator.validate_plan(
                j_id, plan_id, junction_states[j_id]
            )

            if not is_valid:
                all_passed = False
                repaired_plan = self.safety_validator.repair_plan(plan_id, violations)
                decisions[j_id] = repaired_plan
                safety_reports[j_id] = {
                    "passed": False,
                    "violations": violations,
                    "repaired_plan": repaired_plan
                }
            else:
                decisions[j_id] = plan_id
                safety_reports[j_id] = {
                    "passed": True,
                    "violations": [],
                    "repaired_plan": plan_id
                }

        # Fallback level badge logic
        if not self.is_quantum_killed:
            self.active_fallback_level = "QAOA (Quantum)" if all_passed else "QAOA (Safety Repaired)"
        else:
            self.active_fallback_level = "Classical Exact"

        total_epoch_ms = (time.perf_counter() - t_start) * 1000.0

        # Construct comprehensive solve payload for the UI Solver Drawer
        solve_payload = {
            "epoch": self.solve_count,
            "fallback_level": self.active_fallback_level,
            "is_quantum_killed": self.is_quantum_killed,
            "used_method": used_method,
            "qubo_matrix": Q.round(2).tolist(),
            "c_const": round(c_const, 2),
            "qaoa": qaoa_res,
            "brute_force": {
                "best_cost": bf_res["best_cost"],
                "best_bitstring": bf_res["best_bitstring"],
                "wall_clock_ms": bf_res["wall_clock_ms"]
            },
            "simulated_annealing": {
                "best_cost": sa_res["best_cost"],
                "best_bitstring": sa_res["best_bitstring"],
                "wall_clock_ms": sa_res["wall_clock_ms"]
            },
            "why_terms": why_terms,
            "safety_reports": safety_reports,
            "decisions": decisions,
            "total_solve_time_ms": round(total_epoch_ms, 1)
        }

        self.last_solve_data = solve_payload
        return decisions, solve_payload
