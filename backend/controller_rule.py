from typing import Dict, Any

class RuleBasedController:
    """Baseline 2: Heuristic rule-based controller.
    If queue on an axis exceeds threshold (> 15 vehicles or > 1.5x opposing),
    assigns bias to that axis. Also honors max-wait starvation prevention.
    """
    def __init__(self, queue_threshold: int = 12):
        self.name = "Rule-Based"
        self.queue_threshold = queue_threshold

    def decide(self, junctions: Dict[str, Any], sim_time: float) -> Dict[str, int]:
        decision = {}
        for j_id, j in junctions.items():
            q_ns = j.queues.get("N", 0) + j.queues.get("S", 0)
            q_ew = j.queues.get("E", 0) + j.queues.get("W", 0)

            # Check max wait starvation
            wait_ns = j.total_wait_by_dir.get("N", 0) + j.total_wait_by_dir.get("S", 0)
            wait_ew = j.total_wait_by_dir.get("E", 0) + j.total_wait_by_dir.get("W", 0)

            if q_ns > q_ew + self.queue_threshold or wait_ns > wait_ew + 40:
                # Strong NS priority
                plan_id = 1
            elif q_ns > q_ew:
                # Moderate NS priority
                plan_id = 0
            elif q_ew > q_ns + self.queue_threshold or wait_ew > wait_ns + 40:
                # Strong EW priority
                plan_id = 3
            else:
                # Moderate EW priority
                plan_id = 2

            decision[j_id] = plan_id

        return decision
