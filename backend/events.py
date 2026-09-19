import time
from typing import Dict, List, Any, Optional

class EventManager:
    """Handles dynamic urban events, shift logs, and weather conditions."""
    def __init__(self, simulator: Any):
        self.sim = simulator
        self.shift_log: List[Dict[str, Any]] = []
        self.weather: str = "clear"  # "clear", "rain", "heavy_rain", "fog"
        self.active_events: Dict[str, Dict[str, Any]] = {}
        self.log_event("system", "02:00 Shift initialized. All systems normal.")

    def log_event(self, category: str, message: str):
        # Format simulated time as shift clock (e.g. 02:XX)
        minutes = int(self.sim.sim_time // 60)
        seconds = int(self.sim.sim_time % 60)
        timestamp = f"02:{minutes:02d}:{seconds:02d}"

        entry = {
            "time": timestamp,
            "sim_time": round(self.sim.sim_time, 1),
            "category": category,
            "message": message
        }
        self.shift_log.append(entry)
        if len(self.shift_log) > 100:
            self.shift_log.pop(0)

    def trigger_congestion(self, entry_node: str = "J1", multiplier: float = 2.5, duration_s: float = 60.0):
        self.sim.demand_multiplier = multiplier
        self.active_events["congestion"] = {
            "type": "congestion",
            "node": entry_node,
            "multiplier": multiplier,
            "expires_at": self.sim.sim_time + duration_s
        }
        self.log_event("alert", f"Sudden demand surge at {entry_node}. Demand x{multiplier:.1f} armed.")

    def trigger_accident(self, u: str = "J2", v: str = "J3"):
        self.sim.network.set_accident(u, v, active=True)
        self.active_events[f"accident_{u}_{v}"] = {
            "type": "accident",
            "edge": (u, v),
            "created_at": self.sim.sim_time
        }
        self.log_event("alert", f"Accident reported on {u}-{v}. Single lane blocked, capacity reduced.")

    def clear_accident(self, u: str = "J2", v: str = "J3"):
        self.sim.network.set_accident(u, v, active=False)
        self.active_events.pop(f"accident_{u}_{v}", None)
        self.log_event("info", f"Accident cleared on {u}-{v}. Full capacity restored.")

    def trigger_road_closure(self, u: str = "J4", v: str = "J5"):
        self.sim.network.close_road(u, v, bidirectional=True)
        self.active_events[f"closure_{u}_{v}"] = {
            "type": "closure",
            "edge": (u, v),
            "created_at": self.sim.sim_time
        }
        # Reroute all active vehicles that have (u, v) in their route
        rerouted_count = 0
        for veh in self.sim.vehicles.values():
            if (u, v) in zip(veh.route, veh.route[1:]) or (v, u) in zip(veh.route, veh.route[1:]):
                curr_node = veh.current_edge[0]
                new_route = self.sim.network.get_route(curr_node, veh.route[-1])
                if new_route:
                    veh.route = new_route
                    veh.route_idx = 0
                    if len(new_route) >= 2:
                        veh.current_edge = (new_route[0], new_route[1])
                    rerouted_count += 1

        self.log_event("warning", f"{u}-{v} link closed with barricades. {rerouted_count} vehicles rerouted.")

    def reopen_road(self, u: str = "J4", v: str = "J5"):
        self.sim.network.reopen_road(u, v, bidirectional=True)
        self.active_events.pop(f"closure_{u}_{v}", None)
        self.log_event("info", f"{u}-{v} link reopened. Normal routing active.")

    def set_weather(self, mode: str):
        valid = ("clear", "rain", "heavy_rain", "fog")
        if mode not in valid:
            return
        self.weather = mode

        # Weather impacts
        if mode == "heavy_rain":
            # Flood the underpass road J4-J5
            self.sim.network.close_road("J4", "J5", bidirectional=True)
            self.log_event("weather", "Heavy monsoon rain. Mill Underpass (J4-J5) waterlogged & closed.")
        else:
            if self.sim.network.graph.has_edge("J4", "J5") and self.sim.network.graph["J4"]["J5"]["is_closed"]:
                # If was closed due to weather only
                if f"closure_J4_J5" not in self.active_events:
                    self.sim.network.reopen_road("J4", "J5", bidirectional=True)
            self.log_event("weather", f"Weather changed to {mode.replace('_', ' ').title()}.")

    def update(self):
        # Check expired events (e.g. congestion timer)
        curr = self.sim.sim_time
        if "congestion" in self.active_events:
            cong = self.active_events["congestion"]
            if curr >= cong["expires_at"]:
                self.sim.demand_multiplier = 1.0
                self.active_events.pop("congestion", None)
                self.log_event("info", "Congestion surge normalized.")
