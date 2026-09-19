from typing import Dict
from .base import BaseController
from ..junction import Junction
from ..network import CityNetwork


class RuleBasedController(BaseController):
    """
    Rule-Based Controller:
    Implements standard heuristic traffic engineering rules:
    - If approach queue > 20 vehicles, add 10s to that green phase (capped at 55s, min 20s).
    - If opposing queue has waited > 45s, prioritize clearance.
    - Evaluated at phase transitions or fixed intervals.
    """
    def __init__(self, check_interval_s: float = 10.0):
        super().__init__(name="Rule-Based Controller", controller_type="RULE_BASED")
        self.check_interval_s = check_interval_s
        self.last_check_time = 0.0

    def update(
        self,
        sim_time: float,
        dt: float,
        junctions: Dict[str, Junction],
        network: CityNetwork,
    ):
        if sim_time - self.last_check_time < self.check_interval_s:
            return
        self.last_check_time = sim_time

        for j_id, j in junctions.items():
            q_ns = j.queues["N"] + j.queues["S"]
            q_ew = j.queues["E"] + j.queues["W"]

            target_ns = 35.0
            target_ew = 35.0
            reason_parts = []

            # Rule 1: Heavy queue (>20 vehicles) adds 10s green capped at 55s
            if q_ns > 20 and q_ns > q_ew:
                target_ns = min(55.0, 35.0 + 10.0)
                target_ew = max(20.0, 35.0 - 10.0)
                reason_parts.append(f"NS queue ({q_ns}) > 20: +10s NS green")
            elif q_ew > 20 and q_ew > q_ns:
                target_ew = min(55.0, 35.0 + 10.0)
                target_ns = max(20.0, 35.0 - 10.0)
                reason_parts.append(f"EW queue ({q_ew}) > 20: +10s EW green")
            elif q_ns > q_ew + 8:
                target_ns = 45.0
                target_ew = 25.0
                reason_parts.append(f"NS imbalance ({q_ns} vs {q_ew})")
            elif q_ew > q_ns + 8:
                target_ew = 45.0
                target_ns = 25.0
                reason_parts.append(f"EW imbalance ({q_ew} vs {q_ns})")
            else:
                reason_parts.append("Balanced queues: default 35s/35s")

            # Apply only if changed
            if abs(j.ns_green_target - target_ns) > 0.1 or abs(j.ew_green_target - target_ew) > 0.1:
                j.apply_plan(target_ns, target_ew, reason="; ".join(reason_parts))
                self.total_plan_changes += 1
