import json
from pathlib import Path
from typing import Dict, Any, List, Optional

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
with open(CONFIG_DIR / "signal_plans.json", "r", encoding="utf-8") as f:
    SIGNAL_CONFIG = json.load(f)

class Junction:
    def __init__(self, j_id: str, name: str, x: float, y: float):
        self.id = j_id
        self.name = name
        self.x = x
        self.y = y

        # Geometry and inbound links
        self.inbound_links: Dict[str, str] = {}  # direction ('N','S','E','W') -> from_node
        self.outbound_links: Dict[str, str] = {} # direction -> to_node

        # Signal state
        self.current_plan_id = 0
        self.active_axis = "NS"  # "NS" or "EW"
        self.sub_phase = "GREEN"  # "GREEN", "YELLOW", "ALL_RED", "PEDESTRIAN"
        self.phase_elapsed = 0.0
        self.phase_target_duration = 40.0
        self.yellow_duration = SIGNAL_CONFIG.get("yellow_s", 3.0)
        self.all_red_duration = SIGNAL_CONFIG.get("all_red_s", 2.0)
        self.pedestrian_duration = SIGNAL_CONFIG.get("pedestrian_min_walk_s", 15.0)

        # Proposed quantum/controller plan
        self.proposed_plan_id = 0
        self.signal_change_count = 0

        # Pedestrian crossing requests per arm
        self.pedestrian_requests = {"N": False, "S": False, "E": False, "W": False}
        self.pedestrian_wait_times = {"N": 0.0, "S": 0.0, "E": 0.0, "W": 0.0}
        self.is_pedestrian_active = False

        # Live sensor measurements
        self.queues = {"N": 0, "S": 0, "E": 0, "W": 0}
        self.approach_speeds = {"N": 10.0, "S": 10.0, "E": 10.0, "W": 10.0}
        self.occupancies = {"N": 0.0, "S": 0.0, "E": 0.0, "W": 0.0}
        self.total_wait_by_dir = {"N": 0.0, "S": 0.0, "E": 0.0, "W": 0.0}

        # Emergency preemption lock
        self.is_preempted = False
        self.preempt_target_axis = "NS"
        self.preempt_release_time = 0.0

    def request_pedestrian(self, arm: str):
        if arm in self.pedestrian_requests:
            self.pedestrian_requests[arm] = True

    def get_signal_color(self, direction: str) -> str:
        """Return 'GREEN', 'YELLOW', or 'RED' for an approach direction."""
        axis = "NS" if direction in ("N", "S") else "EW"
        if self.sub_phase == "PEDESTRIAN" or self.sub_phase == "ALL_RED":
            return "RED"
        if axis == self.active_axis:
            return self.sub_phase
        return "RED"

    def tick_signals(self, dt: float):
        self.phase_elapsed += dt

        # Update pedestrian wait counters
        for arm, requested in self.pedestrian_requests.items():
            if requested:
                self.pedestrian_wait_times[arm] += dt

        # Phase state machine
        if self.sub_phase == "GREEN":
            if self.phase_elapsed >= self.phase_target_duration:
                self.sub_phase = "YELLOW"
                self.phase_elapsed = 0.0

        elif self.sub_phase == "YELLOW":
            if self.phase_elapsed >= self.yellow_duration:
                self.sub_phase = "ALL_RED"
                self.phase_elapsed = 0.0

        elif self.sub_phase == "ALL_RED":
            if self.phase_elapsed >= self.all_red_duration:
                # Check if pending pedestrian request needs service
                has_pending_ped = any(self.pedestrian_requests.values())
                if has_pending_ped and not self.is_pedestrian_active:
                    self.sub_phase = "PEDESTRIAN"
                    self.is_pedestrian_active = True
                    self.phase_elapsed = 0.0
                else:
                    self._switch_axis()

        elif self.sub_phase == "PEDESTRIAN":
            if self.phase_elapsed >= self.pedestrian_duration:
                self.is_pedestrian_active = False
                for arm in self.pedestrian_requests:
                    self.pedestrian_requests[arm] = False
                    self.pedestrian_wait_times[arm] = 0.0
                self.sub_phase = "ALL_RED"
                self.phase_elapsed = 0.0

    def _switch_axis(self):
        # Switch between NS and EW
        old_axis = self.active_axis
        self.active_axis = "EW" if self.active_axis == "NS" else "NS"
        self.sub_phase = "GREEN"
        self.phase_elapsed = 0.0
        self.signal_change_count += 1

        # Apply target green duration based on active plan
        plan = SIGNAL_CONFIG["plans"].get(str(self.current_plan_id), SIGNAL_CONFIG["plans"]["0"])
        if self.active_axis == plan["primary_axis"]:
            self.phase_target_duration = plan["primary_green_s"]
        else:
            self.phase_target_duration = plan["secondary_green_s"]

    def apply_plan(self, plan_id: int):
        if plan_id != self.current_plan_id:
            self.current_plan_id = plan_id
            plan = SIGNAL_CONFIG["plans"].get(str(plan_id), SIGNAL_CONFIG["plans"]["0"])
            if self.active_axis == plan["primary_axis"]:
                self.phase_target_duration = plan["primary_green_s"]
            else:
                self.phase_target_duration = plan["secondary_green_s"]

    def to_dict(self) -> Dict[str, Any]:
        plan = SIGNAL_CONFIG["plans"].get(str(self.current_plan_id), SIGNAL_CONFIG["plans"]["0"])
        countdown = max(0.0, self.phase_target_duration - self.phase_elapsed)
        if self.sub_phase == "YELLOW":
            countdown = max(0.0, self.yellow_duration - self.phase_elapsed)
        elif self.sub_phase == "ALL_RED":
            countdown = max(0.0, self.all_red_duration - self.phase_elapsed)
        elif self.sub_phase == "PEDESTRIAN":
            countdown = max(0.0, self.pedestrian_duration - self.phase_elapsed)

        return {
            "id": self.id,
            "name": self.name,
            "x": self.x,
            "y": self.y,
            "current_plan_id": self.current_plan_id,
            "proposed_plan_id": self.proposed_plan_id,
            "active_axis": self.active_axis,
            "sub_phase": self.sub_phase,
            "countdown": round(countdown, 1),
            "signal_change_count": self.signal_change_count,
            "queues": self.queues,
            "occupancies": {k: round(v, 2) for k, v in self.occupancies.items()},
            "pedestrian_requests": self.pedestrian_requests,
            "is_pedestrian_active": self.is_pedestrian_active,
            "is_preempted": self.is_preempted,
            "plan_name": plan["name"],
            "signals": {
                "N": self.get_signal_color("N"),
                "S": self.get_signal_color("S"),
                "E": self.get_signal_color("E"),
                "W": self.get_signal_color("W")
            }
        }
