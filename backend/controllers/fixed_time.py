from typing import Dict
from .base import BaseController
from ..junction import Junction
from ..network import CityNetwork


class FixedTimeController(BaseController):
    """
    Fixed-Time Controller: Dumb old signals.
    Every junction uses the exact same rigid schedule:
    NS green 35s, yellow 5s, EW green 35s, yellow 5s, with all-red clearance.
    """
    def __init__(self, ns_green: float = 35.0, ew_green: float = 35.0):
        super().__init__(name="Fixed-Time Controller", controller_type="FIXED_TIME")
        self.ns_green = ns_green
        self.ew_green = ew_green

    def update(
        self,
        sim_time: float,
        dt: float,
        junctions: Dict[str, Junction],
        network: CityNetwork,
    ):
        # In fixed time, junctions always run their preset cycle times.
        # Ensure target durations are fixed.
        for j in junctions.values():
            if j.ns_green_target != self.ns_green or j.ew_green_target != self.ew_green:
                j.apply_plan(self.ns_green, self.ew_green, reason="Fixed 35s schedule")
