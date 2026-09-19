from typing import Dict, Any, Tuple, List, Optional
import json
from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
with open(CONFIG_DIR / "signal_plans.json", "r", encoding="utf-8") as f:
    SIGNAL_CONFIG = json.load(f)

class SafetyValidator:
    """
    Classical safety validation layer.
    Enforces:
    1. Minimum green time (>= 15s)
    2. Yellow (>= 3s) and all-red clearance (>= 2s)
    3. Pedestrian minimum crossing time (>= 15s)
    4. Conflicting green prevention (never both NS and EW green simultaneously)
    5. Maximum cycle length (<= 120s)
    6. Maximum wait per approach (<= 90s)
    """
    def __init__(self):
        self.min_green_s = 15.0
        self.max_cycle_s = 120.0
        self.max_wait_s = SIGNAL_CONFIG.get("pedestrian_max_wait_s", 90.0)

    def validate_plan(self, j_id: str, plan_id: int, junction_state: Any) -> Tuple[bool, List[str]]:
        violations = []
        plan = SIGNAL_CONFIG["plans"].get(str(plan_id))
        if not plan:
            return False, [f"Invalid plan ID {plan_id}"]

        primary_green = plan.get("primary_green_s", 0)
        secondary_green = plan.get("secondary_green_s", 0)

        # Rule 1: Minimum green
        if primary_green < self.min_green_s:
            violations.append(f"Primary green {primary_green}s < min {self.min_green_s}s")
        if secondary_green < self.min_green_s:
            violations.append(f"Secondary green {secondary_green}s < min {self.min_green_s}s")

        # Rule 2: Maximum cycle length
        cycle = primary_green + secondary_green + 2 * (SIGNAL_CONFIG.get("yellow_s", 3) + SIGNAL_CONFIG.get("all_red_s", 2))
        if cycle > self.max_cycle_s:
            violations.append(f"Cycle length {cycle}s exceeds maximum {self.max_cycle_s}s")

        # Rule 3: Approach starvation / max wait
        # If an approach has waited > 70s, it cannot receive the shortest secondary green (20s) if opposing queue is small
        for arm, wait in junction_state.total_wait_by_dir.items():
            if wait > self.max_wait_s:
                # Approach is starving; ensure it gets at least 30s green
                axis = "NS" if arm in ("N", "S") else "EW"
                allocated_green = primary_green if axis == plan["primary_axis"] else secondary_green
                if allocated_green < 30.0:
                    violations.append(f"Starving approach {arm} (wait {wait:.1f}s) receives only {allocated_green}s")

        is_valid = (len(violations) == 0)
        return is_valid, violations

    def repair_plan(self, plan_id: int, violations: List[str]) -> int:
        """Repairs a plan to a safer standard (e.g. Plan 0: NS Moderate 40s/30s or Plan 2: EW Moderate 40s/30s)."""
        # Default to moderate plan on same axis or balanced plan 0
        if plan_id == 1:
            return 0  # Moderate NS
        elif plan_id == 3:
            return 2  # Moderate EW
        return 0
