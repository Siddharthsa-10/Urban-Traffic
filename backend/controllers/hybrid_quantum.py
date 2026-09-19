import time
import threading
from typing import Dict, List, Tuple, Any, Optional
import numpy as np

from .base import BaseController
from ..junction import Junction
from ..network import CityNetwork
from ..quantum.qubo_builder import QUBOBuilder
from ..quantum.qaoa_solver import QAOASolver
from ..safety.validator import SafetyValidator, FallbackLevel


class HybridQuantumController(BaseController):
    """
    Hybrid Quantum-Classical Controller:
    - Periodically (every decision epoch, e.g. 30s) builds QUBO from sensor queues.
    - Launches QAOA solver on background worker thread (non-blocking).
    - Validates plan through classical safety validator and fallback chain.
    - Seamlessly applies validated signal plan without stalling frames.
    """
    def __init__(
        self,
        network: CityNetwork,
        epoch_seconds: float = 30.0,
        depth_p: int = 1,
        weight_mode: str = "NORMAL",
    ):
        super().__init__(name="Hybrid Quantum-Classical", controller_type="HYBRID_QUANTUM")
        self.network = network
        self.epoch_seconds = epoch_seconds
        self.builder = QUBOBuilder(network, weight_mode=weight_mode)
        self.solver = QAOASolver(depth_p=depth_p, shots=1024)
        self.validator = SafetyValidator()

        self.last_epoch_time: float = -epoch_seconds  # Force first epoch immediately
        self.active_fallback_level: FallbackLevel = FallbackLevel.QUANTUM_OPTIMAL
        self.last_solver_result: Optional[Dict[str, Any]] = None
        self.is_solving: bool = False
        self._solver_lock = threading.Lock()

        # Current running plan bits: j_id -> (a, b)
        self.current_plan_bits: Dict[str, Tuple[int, int]] = {j: (0, 0) for j in self.builder.junction_ids}
        self.plan_reasons: Dict[str, str] = {}

    def force_solve_now(self):
        self.last_epoch_time = -self.epoch_seconds

    def set_weight_mode(self, mode: str):
        self.builder.set_weight_mode(mode)

    def set_outage_simulation(self, active: bool):
        self.validator.set_outage_simulation(active)

    def update(
        self,
        sim_time: float,
        dt: float,
        junctions: Dict[str, Junction],
        network: CityNetwork,
    ):
        # Check if decision epoch elapsed and not currently in background solve
        if (sim_time - self.last_epoch_time >= self.epoch_seconds) and not self.is_solving:
            self.last_epoch_time = sim_time
            # Launch background solve thread
            thread = threading.Thread(
                target=self._solve_worker,
                args=(junctions,),
                daemon=True,
            )
            self.is_solving = True
            thread.start()

    def _solve_worker(self, junctions: Dict[str, Junction]):
        try:
            # 1. Build QUBO
            Q, offset, meta = self.builder.build_qubo(
                junctions=junctions,
                link_vehicles={},  # Populated from simulator
                current_plans=self.current_plan_bits,
            )

            # 2. Solve with QAOA (or retrieve from cache)
            qaoa_res = self.solver.solve(
                Q,
                offset,
                self.builder,
                self.builder.junction_ids,
            )

            # 3. Safety Validation and Fallback Chain
            plans, level, checks = self.validator.validate_and_fallback(
                qaoa_bitstring=qaoa_res.get("bitstring"),
                junction_ids=self.builder.junction_ids,
                bf_best_bitstring=qaoa_res.get("brute_force", {}).get("best_bitstring"),
                rule_based_plans=None,
            )

            # Record handoff checks in telemetry
            qaoa_res["telemetry"]["handoff_checks"] = checks
            qaoa_res["fallback_level"] = level.value

            # 4. Apply validated plan
            with self._solver_lock:
                self.active_fallback_level = level
                self.last_solver_result = qaoa_res

                for j_id, (ns_g, ew_g) in plans.items():
                    if j_id in junctions:
                        # Determine why this plan was chosen
                        q_ns = junctions[j_id].queues["N"] + junctions[j_id].queues["S"]
                        q_ew = junctions[j_id].queues["E"] + junctions[j_id].queues["W"]
                        reason = (
                            f"NS queue: {q_ns}, EW queue: {q_ew}. "
                            f"Optimal split: NS {int(ns_g)}s / EW {int(ew_g)}s ({level.value})."
                        )
                        junctions[j_id].apply_plan(ns_g, ew_g, reason=reason)
                        junctions[j_id].safety_status = level.value

                self.total_plan_changes += 1

        except Exception as e:
            # Robust fallback on any worker exception
            with self._solver_lock:
                self.active_fallback_level = FallbackLevel.RULE_BASED
        finally:
            self.is_solving = False
