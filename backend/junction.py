from enum import Enum
from typing import Dict, Optional, Any, List


class SignalPhase(str, Enum):
    NS_GREEN = "NS_GREEN"
    NS_YELLOW = "NS_YELLOW"
    ALL_RED_1 = "ALL_RED_1"
    EW_GREEN = "EW_GREEN"
    EW_YELLOW = "EW_YELLOW"
    ALL_RED_2 = "ALL_RED_2"


class PedestrianStatus(str, Enum):
    IDLE = "IDLE"
    REQUESTED = "REQUESTED"
    CROSSING = "CROSSING"


class Junction:
    def __init__(
        self,
        junction_id: str,
        name: str,
        world_x: float,
        world_y: float,
        default_ns_green: float = 35.0,
        default_ew_green: float = 35.0,
        yellow_duration: float = 5.0,
        all_red_duration: float = 2.0,
    ):
        self.id = junction_id
        self.name = name
        self.world_x = world_x
        self.world_y = world_y

        # Plan timings
        self.ns_green_target = default_ns_green
        self.ew_green_target = default_ew_green
        self.yellow_duration = yellow_duration
        self.all_red_duration = all_red_duration
        self.ped_clearance_duration = 7.0

        # Live State Machine
        self.current_phase: SignalPhase = SignalPhase.NS_GREEN
        self.phase_time_elapsed: float = 0.0
        self.target_phase_duration: float = default_ns_green

        # Proposed next plan (from optimizer)
        self.proposed_ns_green: Optional[float] = None
        self.proposed_ew_green: Optional[float] = None
        self.proposed_reason: str = "Initial fixed baseline"
        self.active_plan_description: str = f"NS {int(default_ns_green)}s / EW {int(default_ew_green)}s"

        # Pre-emption
        self.is_preempted: bool = False
        self.preempt_axis: Optional[str] = None  # "NS" or "EW"
        self.preempt_timer: float = 0.0

        # Pedestrian State per approach
        self.pedestrians: Dict[str, Dict[str, Any]] = {
            arm: {
                "status": PedestrianStatus.IDLE,
                "wait_time": 0.0,
                "cross_timer": 0.0,
                "requests_count": 0,
            }
            for arm in ["N", "S", "E", "W"]
        }

        # Sensors & Approach Queues (N, S, E, W)
        self.queues: Dict[str, int] = {"N": 0, "S": 0, "E": 0, "W": 0}
        self.vehicle_counts: Dict[str, int] = {"N": 0, "S": 0, "E": 0, "W": 0}
        self.avg_speeds: Dict[str, float] = {"N": 0.0, "S": 0.0, "E": 0.0, "W": 0.0}

        # Fallback badge tracking
        self.safety_status: str = "NORMAL"

    @property
    def current_axis(self) -> str:
        if self.current_phase in (SignalPhase.NS_GREEN, SignalPhase.NS_YELLOW, SignalPhase.ALL_RED_1):
            return "NS"
        return "EW"

    @property
    def is_green(self) -> bool:
        return self.current_phase in (SignalPhase.NS_GREEN, SignalPhase.EW_GREEN)

    @property
    def is_yellow(self) -> bool:
        return self.current_phase in (SignalPhase.NS_YELLOW, SignalPhase.EW_YELLOW)

    @property
    def is_all_red(self) -> bool:
        return self.current_phase in (SignalPhase.ALL_RED_1, SignalPhase.ALL_RED_2)

    @property
    def time_remaining_s(self) -> float:
        return max(0.0, self.target_phase_duration - self.phase_time_elapsed)

    def get_axis_for_approach(self, arm: str) -> str:
        return "NS" if arm in ("N", "S") else "EW"

    def can_proceed(self, arm: str) -> bool:
        """Vehicles on this arm can enter intersection if their axis is GREEN."""
        arm_axis = self.get_axis_for_approach(arm)
        if arm_axis == "NS" and self.current_phase == SignalPhase.NS_GREEN:
            # Check if pedestrian is actively crossing conflicting arm
            return not self.is_pedestrian_crossing("NS")
        if arm_axis == "EW" and self.current_phase == SignalPhase.EW_GREEN:
            return not self.is_pedestrian_crossing("EW")
        return False

    def is_pedestrian_crossing(self, axis: str) -> bool:
        # If pedestrians are crossing arms along that axis
        arms = ["N", "S"] if axis == "NS" else ["E", "W"]
        return any(self.pedestrians[a]["status"] == PedestrianStatus.CROSSING for a in arms)

    def request_pedestrian(self, arm: str):
        if arm in self.pedestrians and self.pedestrians[arm]["status"] == PedestrianStatus.IDLE:
            self.pedestrians[arm]["status"] = PedestrianStatus.REQUESTED
            self.pedestrians[arm]["wait_time"] = 0.0
            self.pedestrians[arm]["requests_count"] += 1

    def apply_plan(self, ns_green: float, ew_green: float, reason: str = ""):
        self.ns_green_target = max(15.0, ns_green)
        self.ew_green_target = max(15.0, ew_green)
        self.active_plan_description = f"NS {int(self.ns_green_target)}s / EW {int(self.ew_green_target)}s"
        if reason:
            self.proposed_reason = reason

    def set_preemption(self, axis: str, hold_duration: float = 20.0):
        self.is_preempted = True
        self.preempt_axis = axis
        self.preempt_timer = hold_duration

    def clear_preemption(self):
        self.is_preempted = False
        self.preempt_axis = None
        self.preempt_timer = 0.0

    def tick(self, dt: float = 1.0):
        self.phase_time_elapsed += dt

        # Update preemption timer
        if self.is_preempted:
            self.preempt_timer = max(0.0, self.preempt_timer - dt)
            if self.preempt_timer <= 0.0:
                self.clear_preemption()

        # Update pedestrian wait times & crossing timers
        for arm, ped in self.pedestrians.items():
            if ped["status"] == PedestrianStatus.REQUESTED:
                ped["wait_time"] += dt
                # If approaching max wait (60s), force cross during next all-red
                if ped["wait_time"] > 60.0 and self.is_all_red:
                    ped["status"] = PedestrianStatus.CROSSING
                    ped["cross_timer"] = self.ped_clearance_duration
            elif ped["status"] == PedestrianStatus.CROSSING:
                ped["cross_timer"] = max(0.0, ped["cross_timer"] - dt)
                if ped["cross_timer"] <= 0.0:
                    ped["status"] = PedestrianStatus.IDLE
                    ped["wait_time"] = 0.0

        # State machine transition logic
        if self.current_phase == SignalPhase.NS_GREEN:
            # If preempting EW, cut NS green safely to yellow
            if self.is_preempted and self.preempt_axis == "EW" and self.phase_time_elapsed >= 10.0:
                self._transition_to(SignalPhase.NS_YELLOW, self.yellow_duration)
            elif self.phase_time_elapsed >= self.target_phase_duration:
                self._transition_to(SignalPhase.NS_YELLOW, self.yellow_duration)

        elif self.current_phase == SignalPhase.NS_YELLOW:
            if self.phase_time_elapsed >= self.target_phase_duration:
                self._transition_to(SignalPhase.ALL_RED_1, self.all_red_duration)

        elif self.current_phase == SignalPhase.ALL_RED_1:
            if self.phase_time_elapsed >= self.target_phase_duration:
                # Trigger EW pedestrian walk if requested
                self._serve_pedestrians_for_phase("EW")
                # Next is EW Green
                next_dur = self.ew_green_target
                if self.is_preempted and self.preempt_axis == "EW":
                    next_dur = max(next_dur, self.preempt_timer)
                self._transition_to(SignalPhase.EW_GREEN, next_dur)

        elif self.current_phase == SignalPhase.EW_GREEN:
            # If preempting NS, cut EW green safely to yellow
            if self.is_preempted and self.preempt_axis == "NS" and self.phase_time_elapsed >= 10.0:
                self._transition_to(SignalPhase.EW_YELLOW, self.yellow_duration)
            elif self.phase_time_elapsed >= self.target_phase_duration:
                self._transition_to(SignalPhase.EW_YELLOW, self.yellow_duration)

        elif self.current_phase == SignalPhase.EW_YELLOW:
            if self.phase_time_elapsed >= self.target_phase_duration:
                self._transition_to(SignalPhase.ALL_RED_2, self.all_red_duration)

        elif self.current_phase == SignalPhase.ALL_RED_2:
            if self.phase_time_elapsed >= self.target_phase_duration:
                # Trigger NS pedestrian walk if requested
                self._serve_pedestrians_for_phase("NS")
                # Next is NS Green
                next_dur = self.ns_green_target
                if self.is_preempted and self.preempt_axis == "NS":
                    next_dur = max(next_dur, self.preempt_timer)
                self._transition_to(SignalPhase.NS_GREEN, next_dur)

    def _serve_pedestrians_for_phase(self, axis: str):
        arms = ["N", "S"] if axis == "NS" else ["E", "W"]
        for arm in arms:
            if self.pedestrians[arm]["status"] == PedestrianStatus.REQUESTED:
                self.pedestrians[arm]["status"] = PedestrianStatus.CROSSING
                self.pedestrians[arm]["cross_timer"] = self.ped_clearance_duration

    def _transition_to(self, next_phase: SignalPhase, duration: float):
        self.current_phase = next_phase
        self.phase_time_elapsed = 0.0
        self.target_phase_duration = duration

    def to_dict(self) -> Dict[str, Any]:
        time_remaining = max(0.0, self.target_phase_duration - self.phase_time_elapsed)
        return {
            "id": self.id,
            "name": self.name,
            "world_x": self.world_x,
            "world_y": self.world_y,
            "phase": self.current_phase.value,
            "axis": self.current_axis,
            "is_green": self.is_green,
            "is_yellow": self.is_yellow,
            "is_all_red": self.is_all_red,
            "time_remaining_s": round(time_remaining, 1),
            "target_duration_s": round(self.target_phase_duration, 1),
            "ns_green_target": round(self.ns_green_target, 1),
            "ew_green_target": round(self.ew_green_target, 1),
            "plan_desc": self.active_plan_description,
            "reason": self.proposed_reason,
            "is_preempted": self.is_preempted,
            "preempt_axis": self.preempt_axis,
            "queues": self.queues,
            "pedestrians": {
                arm: {
                    "status": p["status"].value,
                    "wait_time": round(p["wait_time"], 1),
                }
                for arm, p in self.pedestrians.items()
            },
            "safety_status": self.safety_status,
        }
