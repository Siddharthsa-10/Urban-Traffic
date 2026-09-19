import json
import math
from pathlib import Path
from typing import Dict, Any, Optional

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"

with open(CONFIG_DIR / "vehicles.json", "r", encoding="utf-8") as f:
    VEHICLE_CONFIG = json.load(f)

class Vehicle:
    def __init__(self, veh_id: str, veh_type: str, route: list[str], entry_time: float):
        self.id = veh_id
        self.type = veh_type
        cfg = VEHICLE_CONFIG["types"][veh_type]
        self.name = cfg["name"]
        self.length = cfg["length_m"]
        self.width = cfg["width_m"]
        self.max_speed = cfg["max_speed_ms"]
        self.desired_speed = self.max_speed
        self.a_max = cfg["accel_ms2"]
        self.b_comf = cfg["decel_ms2"]
        self.s0 = cfg["min_gap_m"]
        self.T = cfg["time_headway_s"]
        self.idle_fuel_lh = cfg["idle_fuel_lh"]
        self.cruise_fuel_l_per_km = cfg["cruise_fuel_l_per_km"]
        self.stop_penalty_l = cfg["stop_penalty_l"]
        self.emission_factor = cfg["emission_kg_per_l"]
        self.pcu = cfg.get("pcu", 1.0)
        self.passengers = cfg.get("passengers", 1)
        self.color = cfg["color"]

        # Route navigation
        self.route = list(route)
        self.route_idx = 0
        self.current_edge = (route[0], route[1]) if len(route) >= 2 else ("", "")
        self.position = 0.0  # distance along current edge in meters
        self.speed = 0.0
        self.acceleration = 0.0

        # State tracking
        self.entry_time = entry_time
        self.exit_time: Optional[float] = None
        self.total_wait_time = 0.0
        self.total_distance = 0.0
        self.stops_count = 0
        self.was_stopped = False
        self.is_completed = False
        self.is_ghost = False

    def update_idm(self, dt: float, leader_dist: Optional[float], leader_speed: Optional[float], red_light_dist: Optional[float]):
        """Intelligent Driver Model (IDM) acceleration calculation."""
        v = max(0.0, self.speed)
        v0 = max(1.0, self.desired_speed)

        # Determine closest obstacle: either vehicle ahead or red light stop line
        s_star_candidates = []
        if leader_dist is not None:
            delta_v = v - (leader_speed if leader_speed is not None else 0.0)
            s_star = self.s0 + max(0.0, v * self.T + (v * delta_v) / (2.0 * math.sqrt(self.a_max * self.b_comf)))
            ratio = (s_star / max(0.1, leader_dist)) ** 2
            s_star_candidates.append(ratio)

        if red_light_dist is not None and red_light_dist > 0:
            delta_v = v  # stopping against stationary line
            s_star = self.s0 + max(0.0, v * self.T + (v * delta_v) / (2.0 * math.sqrt(self.a_max * self.b_comf)))
            ratio = (s_star / max(0.1, red_light_dist)) ** 2
            s_star_candidates.append(ratio)

        interaction_term = sum(s_star_candidates)
        accel = self.a_max * (1.0 - (v / v0) ** 4 - interaction_term)
        # Cap deceleration to comfortable/emergency bounds
        accel = max(-2.5 * self.b_comf, min(self.a_max, accel))

        self.acceleration = accel
        new_speed = max(0.0, self.speed + accel * dt)
        if new_speed > self.desired_speed:
            new_speed = self.desired_speed

        step_dist = 0.5 * (self.speed + new_speed) * dt
        self.speed = new_speed
        self.position += step_dist
        self.total_distance += step_dist

        # Stopped / idling detection (speed < 0.2 m/s)
        is_stopped = self.speed < 0.2
        if is_stopped:
            self.total_wait_time += dt
            if not self.was_stopped:
                self.stops_count += 1
                self.was_stopped = True
        else:
            self.was_stopped = False

    @property
    def fuel_consumed_liters(self) -> float:
        idle_hours = self.total_wait_time / 3600.0
        idle_fuel = self.idle_fuel_lh * idle_hours
        stop_fuel = self.stops_count * self.stop_penalty_l
        cruise_fuel = (self.total_distance / 1000.0) * self.cruise_fuel_l_per_km
        return idle_fuel + stop_fuel + cruise_fuel

    @property
    def co2_emitted_kg(self) -> float:
        return self.fuel_consumed_liters * self.emission_factor

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "route": self.route,
            "route_idx": self.route_idx,
            "edge": f"{self.current_edge[0]}->{self.current_edge[1]}",
            "position": round(self.position, 1),
            "speed": round(self.speed, 2),
            "acceleration": round(self.acceleration, 2),
            "wait_time": round(self.total_wait_time, 1),
            "color": self.color,
            "length": self.length,
            "is_ghost": self.is_ghost
        }
