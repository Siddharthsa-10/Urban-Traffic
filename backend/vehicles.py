import math
from typing import List, Optional, Dict, Any


class Vehicle:
    def __init__(
        self,
        vehicle_id: str,
        v_type: str,
        origin: str,
        destination: str,
        route: List[str],
        config: Dict[str, Any],
        creation_tick: int,
    ):
        self.id = vehicle_id
        self.type = v_type
        self.origin = origin
        self.destination = destination
        self.route = list(route)  # e.g. ["J1", "J2", "J3"]
        self.route_index = 0
        self.creation_tick = creation_tick

        # Kinematic parameters from config
        type_cfg = config.get("vehicle_types", {}).get(v_type, config.get("vehicle_types", {}).get("car", {}))
        self.length_m = type_cfg.get("length_m", 4.5)
        self.width_m = type_cfg.get("width_m", 1.8)
        self.base_max_speed_mps = type_cfg.get("max_speed_mps", 14.0)
        self.max_speed_mps = self.base_max_speed_mps
        self.max_accel_mps2 = type_cfg.get("max_accel_mps2", 2.5)
        self.desired_decel_mps2 = type_cfg.get("desired_decel_mps2", 2.0)
        self.min_gap_m = type_cfg.get("min_gap_m", 2.0)
        self.time_headway_s = type_cfg.get("time_headway_s", 1.2)
        self.idle_fuel_ml_per_s = type_cfg.get("idle_fuel_ml_per_s", 0.38)
        self.emission_kg_per_l = type_cfg.get("emission_kg_per_l", 2.3)
        self.stop_fuel_penalty_l = type_cfg.get("stop_fuel_penalty_l", 0.008)

        # Dynamic state
        self.current_link_id: Optional[str] = None
        self.position_m: float = 0.0  # Distance along current link
        self.speed_mps: float = 0.0
        self.target_speed_mps: float = self.max_speed_mps
        self.accel_mps2: float = 0.0
        
        # Explicit lifecycle state (Part D1)
        # States: SPAWNING, MOVING, APPROACHING_SIGNAL, QUEUED, CROSSING, REROUTING, ROUTE_BLOCKED, EMERGENCY, ARRIVED, DESPAWNED
        self.status: str = "EMERGENCY" if v_type == "ambulance" else "SPAWNING"

        # Authoritative trip statistics (Part A3)
        self.spawn_time_s: float = float(creation_tick)
        self.arrival_time_s: Optional[float] = None
        self.distance_traveled_m: float = 0.0
        self.time_in_network_s: float = 0.0
        self.waiting_time_s: float = 0.0  # strictly when speed < 0.5 m/s
        self.moving_time_s: float = 0.0
        self.stops_count: int = 0
        self.was_stopped: bool = False
        self.completed: bool = False
        self.is_route_blocked: bool = False

    @property
    def is_stopped(self) -> bool:
        return self.speed_mps < 0.5

    def apply_weather_modifiers(self, speed_mult: float, braking_mult: float):
        """Applies authoritative weather multipliers cleanly to kinematics."""
        self.max_speed_mps = max(3.0, self.base_max_speed_mps * speed_mult)
        self.desired_decel_mps2 = max(1.0, 2.0 / max(0.5, braking_mult))

    def compute_idm_accel(
        self,
        lead_distance_m: Optional[float],
        lead_speed_mps: Optional[float],
        speed_limit_mps: float,
    ) -> float:
        """
        Computes Intelligent Driver Model (IDM) acceleration towards targetSpeed.
        Never multiplies speed repeatedly per frame.
        """
        v = max(0.0, self.speed_mps)
        v0 = min(self.max_speed_mps, max(2.0, speed_limit_mps))
        self.target_speed_mps = v0
        a = self.max_accel_mps2
        b = self.desired_decel_mps2
        s0 = self.min_gap_m
        T = self.time_headway_s

        # Free-road acceleration ratio
        free_ratio = (v / v0) ** 4 if v0 > 0 else 1.0

        if lead_distance_m is not None and lead_distance_m < 300.0:
            delta_v = v - (lead_speed_mps if lead_speed_mps is not None else 0.0)
            # Desired minimum gap
            s_star = s0 + v * T + (v * delta_v) / (2.0 * math.sqrt(max(0.1, a * b)))
            interaction_ratio = (s_star / max(0.2, lead_distance_m)) ** 2
        else:
            interaction_ratio = 0.0

        raw_accel = a * (1.0 - free_ratio - interaction_ratio)
        # Cap deceleration and acceleration safely
        bounded_accel = max(-4.5, min(a, raw_accel))
        return bounded_accel

    def update_physics(self, accel: float, dt: float, link_length: float):
        self.accel_mps2 = accel
        new_speed = max(0.0, self.speed_mps + accel * dt)
        avg_speed = (self.speed_mps + new_speed) / 2.0
        ds = avg_speed * dt

        self.speed_mps = new_speed
        self.position_m = max(0.0, self.position_m + ds)
        self.distance_traveled_m += ds
        self.time_in_network_s += dt

        # Strict wait time vs moving time calculation (Part A3)
        WAIT_SPEED_THRESHOLD = 0.5
        if self.speed_mps <= WAIT_SPEED_THRESHOLD:
            self.waiting_time_s += dt
            if not self.was_stopped:
                self.stops_count += 1
                self.was_stopped = True
            if self.status != "EMERGENCY" and not self.is_route_blocked:
                self.status = "QUEUED"
        else:
            self.moving_time_s += dt
            if self.speed_mps > 1.5:
                self.was_stopped = False
            if self.status != "EMERGENCY" and not self.is_route_blocked:
                dist_to_end = link_length - self.position_m
                if dist_to_end < 45.0:
                    self.status = "APPROACHING_SIGNAL"
                else:
                    self.status = "MOVING"

    def reroute(self, new_route: List[str]):
        """Safely updates vehicle route without deleting or teleporting."""
        if len(new_route) >= 2:
            self.route = list(new_route)
            self.route_index = 0
            self.is_route_blocked = False
            self.status = "REROUTING"

    def mark_completed(self, current_time_s: float):
        self.completed = True
        self.arrival_time_s = current_time_s
        self.status = "ARRIVED"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "link_id": self.current_link_id,
            "position_m": round(self.position_m, 2),
            "speed_mps": round(self.speed_mps, 2),
            "accel_mps2": round(self.accel_mps2, 2),
            "status": self.status,
            "wait_time_s": round(self.waiting_time_s, 1),
            "moving_time_s": round(self.moving_time_s, 1),
            "travel_time_s": round(self.time_in_network_s, 1),
            "stops": self.stops_count,
            "completed": self.completed,
        }
