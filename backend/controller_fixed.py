from typing import Dict, Any

class FixedTimeController:
    """Baseline 1: Static fixed-time controller (uniform 35s NS / 35s EW)."""
    def __init__(self, plan_id: int = 0):
        self.name = "Fixed-Time"
        self.default_plan_id = plan_id

    def decide(self, junctions: Dict[str, Any], sim_time: float) -> Dict[str, int]:
        # Returns static plan 0 (or symmetric timing) for all junctions
        return {j_id: self.default_plan_id for j_id in junctions.keys()}
