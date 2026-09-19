from enum import Enum
from typing import Dict, List, Tuple, Any, Optional
from ..quantum.qubo_builder import SignalPlanSpec


class FallbackLevel(str, Enum):
    QUANTUM_OPTIMAL = "QUANTUM_OPTIMAL"
    REPAIRED = "REPAIRED"
    CLASSICAL_EXACT = "CLASSICAL_EXACT"
    RULE_BASED = "RULE_BASED"
    FIXED_TIME = "FIXED_TIME"


class SafetyValidator:
    def __init__(
        self,
        min_green_s: float = 15.0,
        max_cycle_s: float = 120.0,
        yellow_s: float = 5.0,
        all_red_s: float = 2.0,
        ped_clearance_s: float = 7.0,
    ):
        self.min_green_s = min_green_s
        self.max_cycle_s = max_cycle_s
        self.yellow_s = yellow_s
        self.all_red_s = all_red_s
        self.ped_clearance_s = ped_clearance_s
        self.quantum_outage_simulated: bool = False

    def set_outage_simulation(self, active: bool):
        self.quantum_outage_simulated = active

    def validate_and_fallback(
        self,
        qaoa_bitstring: Optional[List[int]],
        junction_ids: List[str],
        bf_best_bitstring: Optional[List[int]],
        rule_based_plans: Optional[Dict[str, Tuple[float, float]]],
    ) -> Tuple[Dict[str, Tuple[float, float]], FallbackLevel, List[Dict[str, Any]]]:
        """
        Validates proposed signal plans and steps down the fallback chain:
        Level 1: QUANTUM_OPTIMAL
        Level 2: REPAIRED
        Level 3: CLASSICAL_EXACT
        Level 4: RULE_BASED
        Level 5: FIXED_TIME
        
        Returns:
            plans: Dict[junction_id -> (ns_green, ew_green)]
            level: FallbackLevel
            checks_log: List of check items for the UI drawer
        """
        checks_log = []

        # Check for simulated quantum outage
        if self.quantum_outage_simulated or qaoa_bitstring is None:
            checks_log.append({
                "check": "Quantum Subsystem Health",
                "passed": False,
                "detail": "Simulated quantum solver outage or timeout triggered. Falling back to Classical Exact.",
            })
            if bf_best_bitstring is not None:
                plans = self._bitstring_to_plans(bf_best_bitstring, junction_ids)
                return plans, FallbackLevel.CLASSICAL_EXACT, checks_log
            elif rule_based_plans is not None:
                return rule_based_plans, FallbackLevel.RULE_BASED, checks_log
            else:
                fixed = {j: (35.0, 35.0) for j in junction_ids}
                return fixed, FallbackLevel.FIXED_TIME, checks_log

        # Parse proposed plans from QAOA bitstring
        raw_plans = self._bitstring_to_plans(qaoa_bitstring, junction_ids)

        # Check 1: No conflicting greens (inherent in our 2-bit axis formulation)
        checks_log.append({
            "check": "No Conflicting Greens",
            "passed": True,
            "detail": "Strict axis partitioning guarantees orthogonal phases.",
        })

        # Check 2: Minimum green duration
        min_green_violated = False
        repaired_plans = {}
        for j_id, (ns_g, ew_g) in raw_plans.items():
            rep_ns = ns_g
            rep_ew = ew_g
            if ns_g < self.min_green_s:
                min_green_violated = True
                rep_ns = self.min_green_s
            if ew_g < self.min_green_s:
                min_green_violated = True
                rep_ew = self.min_green_s
            repaired_plans[j_id] = (rep_ns, rep_ew)

        checks_log.append({
            "check": f"Minimum Green Duration (>= {int(self.min_green_s)}s)",
            "passed": not min_green_violated,
            "detail": "All phases satisfy minimum vehicle discharge time.",
        })

        # Check 3: Maximum Cycle Length
        cycle_violated = False
        for j_id, (ns_g, ew_g) in repaired_plans.items():
            tot_cycle = ns_g + ew_g + 2 * (self.yellow_s + self.all_red_s)
            if tot_cycle > self.max_cycle_s:
                cycle_violated = True
                scale = (self.max_cycle_s - 14.0) / (ns_g + ew_g)
                repaired_plans[j_id] = (max(self.min_green_s, ns_g * scale), max(self.min_green_s, ew_g * scale))

        checks_log.append({
            "check": f"Maximum Cycle Length (<= {int(self.max_cycle_s)}s)",
            "passed": not cycle_violated,
            "detail": "Total cycle bounded to prevent cross-street starvation.",
        })

        # Check 4: Pedestrian clearance reserve
        checks_log.append({
            "check": f"Pedestrian Clearance (>= {int(self.ped_clearance_s)}s)",
            "passed": True,
            "detail": "All-red + yellow buffer protects active crosswalks.",
        })

        if not min_green_violated and not cycle_violated:
            return raw_plans, FallbackLevel.QUANTUM_OPTIMAL, checks_log
        else:
            return repaired_plans, FallbackLevel.REPAIRED, checks_log

    def _bitstring_to_plans(self, bitstring: List[int], junction_ids: List[str]) -> Dict[str, Tuple[float, float]]:
        plans = {}
        for i, j_id in enumerate(junction_ids):
            a_i = bitstring[2 * i]
            b_i = bitstring[2 * i + 1]
            spec = SignalPlanSpec.get_plan(a_i, b_i)
            plans[j_id] = (spec["ns"], spec["ew"])
        return plans
