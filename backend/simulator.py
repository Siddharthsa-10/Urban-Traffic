import json
import math
import random
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from .network import CityNetwork, RoadLink
from .vehicles import Vehicle
from .junction import Junction
from .controllers.base import BaseController
from .environment.emissions import EnvironmentalModel


class WeatherState:
    """Authoritative weather conditions configuration (Part B1)."""
    CONFIGS = {
        "CLEAR": {
            "type": "CLEAR",
            "speed_multiplier": 1.0,
            "braking_multiplier": 1.0,
            "capacity_multiplier": 1.0,
            "pedestrian_multiplier": 1.0,
            "visibility_multiplier": 1.0,
            "spawn_multiplier": 1.0,
        },
        "RAIN": {
            "type": "RAIN",
            "speed_multiplier": 0.85,
            "braking_multiplier": 1.15,
            "capacity_multiplier": 0.90,
            "pedestrian_multiplier": 1.10,
            "visibility_multiplier": 0.85,
            "spawn_multiplier": 0.95,
        },
        "HEAVY_RAIN": {
            "type": "HEAVY_RAIN",
            "speed_multiplier": 0.70,
            "braking_multiplier": 1.35,
            "capacity_multiplier": 0.70,
            "pedestrian_multiplier": 1.25,
            "visibility_multiplier": 0.60,
            "spawn_multiplier": 0.85,
        },
        "FOG": {
            "type": "FOG",
            "speed_multiplier": 0.75,
            "braking_multiplier": 1.20,
            "capacity_multiplier": 0.80,
            "pedestrian_multiplier": 1.15,
            "visibility_multiplier": 0.40,
            "spawn_multiplier": 0.90,
        },
    }

    def __init__(self, weather_type: str = "CLEAR"):
        self.set_type(weather_type)

    def set_type(self, weather_type: str):
        self.type = weather_type.upper() if weather_type.upper() in self.CONFIGS else "CLEAR"
        cfg = self.CONFIGS[self.type]
        self.speed_multiplier = cfg["speed_multiplier"]
        self.braking_multiplier = cfg["braking_multiplier"]
        self.capacity_multiplier = cfg["capacity_multiplier"]
        self.pedestrian_multiplier = cfg["pedestrian_multiplier"]
        self.visibility_multiplier = cfg["visibility_multiplier"]
        self.spawn_multiplier = cfg["spawn_multiplier"]

class ContinuousArrivalsDict(dict):
    """Mapping wrapper that generates arrivals on demand for any tick indefinitely."""
    def __init__(self, schedule: "DemandSchedule", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.schedule = schedule

    def __getitem__(self, tick: int):
        return self.schedule.get_arrivals(tick)

    def get(self, tick: int, default=None):
        return self.schedule.get_arrivals(tick)

    def __contains__(self, tick: int):
        return True


class DemandSchedule:
    """Deterministic, continuous vehicle arrivals so all controllers face identical, infinite traffic."""
    def __init__(self, seed: int, duration_ticks: int = 600, config: Optional[Dict[str, Any]] = None):
        self.seed = seed
        self.duration_ticks = duration_ticks
        self._raw_arrivals: Dict[int, List[Dict[str, Any]]] = {}
        self.arrivals = ContinuousArrivalsDict(self)
        self.config = config

        if config and "junctions" in config:
            self.entry_nodes = list(config["junctions"].keys())
        else:
            self.entry_nodes = ["J1", "J2", "J3", "J4"]
        self.dest_nodes = list(self.entry_nodes)

        self.v_types = ["two_wheeler", "auto", "car", "bus"]
        self.v_weights = [0.35, 0.20, 0.35, 0.10]

        # Precompute initial window for immediate fast lookups
        self._precompute_window(min(600, max(200, duration_ticks)))

    def _precompute_window(self, count: int):
        rng = random.Random(self.seed)
        v_counter = 1
        for tick in range(count):
            self._raw_arrivals[tick] = self._generate_tick_arrivals(tick, rng, v_counter)
            v_counter += len(self._raw_arrivals[tick])

    def _generate_tick_arrivals(self, tick: int, rng: random.Random, v_offset: int) -> List[Dict[str, Any]]:
        base_prob = 0.55 + 0.25 * (1.0 + math.sin(tick / 45.0))
        if rng.random() >= base_prob:
            return []
        num_vehicles = 1 if rng.random() < 0.7 else 2
        arrivals = []
        for i in range(num_vehicles):
            origin = rng.choice(self.entry_nodes)
            possible_dests = [d for d in self.dest_nodes if d != origin]
            dest = rng.choice(possible_dests)
            chosen_type = rng.choices(self.v_types, weights=self.v_weights, k=1)[0]
            arrivals.append({
                "id": f"v_{tick}_{v_offset + i}",
                "type": chosen_type,
                "origin": origin,
                "dest": dest,
            })
        return arrivals

    def get_arrivals(self, tick: int) -> List[Dict[str, Any]]:
        if tick in self._raw_arrivals:
            return self._raw_arrivals[tick]
        # Continuously generate deterministic arrivals for any tick in the future!
        rng = random.Random(self.seed + tick * 10007)
        arrivals = self._generate_tick_arrivals(tick, rng, 1)
        self._raw_arrivals[tick] = arrivals
        # Rolling cache bound to prevent memory leak
        if len(self._raw_arrivals) > 2000:
            oldest = min(self._raw_arrivals.keys())
            del self._raw_arrivals[oldest]
        return arrivals


class TrafficSimulator:
    def __init__(
        self,
        controller: BaseController,
        seed: int = 42,
        network_config_path: Optional[str] = None,
        demand_schedule: Optional[DemandSchedule] = None,
        max_ticks: Optional[int] = None,
        simulation_id: Optional[str] = None,
    ):
        self.seed = seed
        self.simulation_id = simulation_id or f"sim_{seed}_{int(random.random()*1e6)}"
        self.sim_time: float = 0.0
        self.current_tick: int = 0
        self.max_ticks = max_ticks
        self.dt: float = 1.0

        # Network and controller
        self.network = CityNetwork(network_config_path)
        self.controller = controller
        self.env_model = EnvironmentalModel()

        # Instantiate junctions
        self.junctions: Dict[str, Junction] = {}
        for j_id, j_data in self.network.junctions.items():
            self.junctions[j_id] = Junction(
                junction_id=j_id,
                name=j_data["name"],
                world_x=j_data["world_x"],
                world_y=j_data["world_y"],
            )

        # Vehicles tracking & continuous lifecycle (Phase 4, 5, 14)
        self.vehicles: Dict[str, Vehicle] = {}
        self.link_vehicles: Dict[str, List[Vehicle]] = {link_id: [] for link_id in self.network.links.keys()}
        self.completed_vehicles: List[Vehicle] = []
        self.completed_count: int = 0
        self.total_spawned_count: int = 0
        self.cumulative_wait_s: float = 0.0
        self.cumulative_travel_s: float = 0.0
        self.cumulative_fuel_l: float = 0.0
        self.cumulative_co2_kg: float = 0.0
        self.trip_history: List[Dict[str, Any]] = []
        self.min_active_vehicles: int = 8
        self.base_spawn_rate: float = 0.85
        self.vehicle_counter: int = 1
        self.blocked_vehicles_count: int = 0
        self.route_reroute_count: int = 0

        # Demand schedule
        if demand_schedule is not None:
            self.demand_schedule = demand_schedule
        else:
            self.demand_schedule = DemandSchedule(seed=seed, duration_ticks=max_ticks or 600, config=self.network.raw_config)

        # Continuous spawn accumulator (Part D3 & Phase 7)
        self.spawn_accumulator: float = 0.0
        self.congestion_multiplier: float = 1.0
        self.congested_entry: Optional[str] = None
        self.event_rng = random.Random(seed + 9999)

        # Authoritative weather state (Part B1)
        self.weather_state = WeatherState("CLEAR")
        self.weather: str = "CLEAR"

        # Peak queue tracking (Part A4)
        self.peak_queue_observed: int = 0

        # Metrics history
        self.metrics_history: List[Dict[str, Any]] = []

    @property
    def total_arrived(self) -> int:
        return self.completed_count

    @property
    def total_spawned(self) -> int:
        return len(self.vehicles) + self.completed_count

    def set_congestion_event(self, entry_node: str, multiplier: float = 2.5):
        self.congested_entry = entry_node
        self.congestion_multiplier = multiplier

    def clear_congestion_event(self):
        self.congested_entry = None
        self.congestion_multiplier = 1.0

    def set_weather(self, weather: str):
        """Authoritative weather transition without resetting or stopping vehicles (Part B4)."""
        self.weather = weather.upper()
        self.weather_state.set_type(self.weather)

        # Low-lying underpass flood on HEAVY_RAIN
        is_flooded = (self.weather == "HEAVY_RAIN")
        self.network.set_underpass_flood(is_flooded)

        # Update link capacities and speed limits safely
        for link in self.network.links.values():
            if not link.is_closed and not link.has_accident:
                link.current_speed_limit_mps = link.base_speed_limit_mps * self.weather_state.speed_multiplier
                link.current_capacity_vph = link.base_capacity_vph * self.weather_state.capacity_multiplier

        # Existing vehicles smoothly adapt their target speeds without deletion
        for veh in self.vehicles.values():
            veh.apply_weather_modifiers(self.weather_state.speed_multiplier, self.weather_state.braking_multiplier)

        # When underpass floods, reroute affected vehicles immediately
        if is_flooded:
            self._reroute_vehicles_around_closure("L_J3_J4")
            self._reroute_vehicles_around_closure("L_J4_J3")

    def set_road_closure(self, link_id: str, closed: bool = True, reason: str = "ROAD_CLOSURE"):
        """Authoritatively closes or reopens a link and reroutes affected traffic (Part C2-C4)."""
        self.network.set_road_closure(link_id, closed, reason=reason)
        if closed:
            self._reroute_vehicles_around_closure(link_id)

    def _reroute_vehicles_around_closure(self, closed_link_id: str):
        """Dynamically reroutes vehicles currently heading toward the closed link (Part C3)."""
        closed_link = self.network.get_link_by_id(closed_link_id)
        if not closed_link:
            return

        for veh in list(self.vehicles.values()):
            # Check if closed link is anywhere in vehicle's remaining route
            if veh.route_index + 1 < len(veh.route):
                remaining_pairs = [
                    (veh.route[i], veh.route[i+1]) for i in range(veh.route_index, len(veh.route) - 1)
                ]
                has_closed = any(u == closed_link.from_node and v == closed_link.to_node for u, v in remaining_pairs)
                if has_closed:
                    current_node = veh.route[veh.route_index]
                    alt_path = self.network.find_alternate_route(current_node, veh.destination, avoid_link_id=closed_link_id)
                    if alt_path and len(alt_path) >= 2:
                        veh.reroute(alt_path)
                        self.route_reroute_count += 1
                    else:
                        # No alternate route available; vehicle marked blocked safely (Part C5)
                        veh.is_route_blocked = True
                        veh.status = "ROUTE_BLOCKED"
                        self.blocked_vehicles_count += 1

    def inject_ambulance(self, origin: str, destination: str, route: List[str]) -> Vehicle:
        amb_id = f"AMB_{int(self.sim_time)}"
        amb = Vehicle(
            vehicle_id=amb_id,
            v_type="ambulance",
            origin=origin,
            destination=destination,
            route=route,
            config=self.network.raw_config,
            creation_tick=self.current_tick,
        )
        self.vehicles[amb_id] = amb
        if len(route) >= 2:
            first_link = self.network.get_link(route[0], route[1])
            if first_link:
                amb.current_link_id = first_link.id
                amb.position_m = 0.0
                self.link_vehicles[first_link.id].append(amb)
        return amb

    def tick(self):
        """Deterministic simulation step (Part G)."""
        self.sim_time += self.dt
        self.current_tick += 1

        # 1. Update junction signal timers
        for junction in self.junctions.values():
            junction.tick(self.dt)

        # 2. Update adaptive signal controller
        self.controller.update(self.sim_time, self.dt, self.junctions, self.network)

        # 3. Spawn vehicles with continuous accumulator (never drops to zero)
        self._spawn_scheduled_arrivals()

        # 4. Advance vehicle physics with IDM and dynamic rerouting
        self._update_vehicle_physics()

        # 5. Measure approach queues (strictly clamped non-negative)
        self._update_sensors_and_queues()

        # 6. Record authoritative metrics history
        self._record_metrics()

        # 7. Simulation Integrity Validation (Phase 26)
        self._validate_simulation_integrity()

    def _validate_simulation_integrity(self):
        """Phase 26: Validates that all simulation invariants strictly hold."""
        t_str = time.strftime("%Y-%m-%d %H:%M:%S")

        # 1. Active vehicles >= 0
        if len(self.vehicles) < 0:
            print(f"================================================\nSIMULATION INTEGRITY ERROR\nTimestamp: {t_str}\nEntity: active_vehicles\nValue: {len(self.vehicles)}\nExpected: >= 0\nSource: TrafficSimulator.vehicles\n================================================")

        # 2. Junction queues >= 0
        for j_id, j in self.junctions.items():
            for arm, q in j.queues.items():
                if q < 0:
                    print(f"================================================\nSIMULATION INTEGRITY ERROR\nTimestamp: {t_str}\nEntity: Junction {j_id} arm {arm} queue\nValue: {q}\nExpected: >= 0\nSource: Junction.queues\n================================================")

        # 3. Vehicle speeds and positions >= 0
        for v_id, veh in self.vehicles.items():
            if veh.speed_mps < 0.0:
                print(f"================================================\nSIMULATION INTEGRITY ERROR\nTimestamp: {t_str}\nEntity: Vehicle {v_id} speed\nValue: {veh.speed_mps}\nExpected: >= 0\nSource: Vehicle.speed_mps\n================================================")
            if veh.position_m < 0.0:
                print(f"================================================\nSIMULATION INTEGRITY ERROR\nTimestamp: {t_str}\nEntity: Vehicle {v_id} position\nValue: {veh.position_m}\nExpected: >= 0\nSource: Vehicle.position_m\n================================================")

        # 4. Road link vehicle count >= 0
        for link_id, vehs in self.link_vehicles.items():
            if len(vehs) < 0:
                print(f"================================================\nSIMULATION INTEGRITY ERROR\nTimestamp: {t_str}\nEntity: Road {link_id} vehicles\nValue: {len(vehs)}\nExpected: >= 0\nSource: TrafficSimulator.link_vehicles\n================================================")

    def _spawn_scheduled_arrivals(self):
        """Continuous spawn scheduler ensuring continuous, indefinite vehicle ingress (Phases 4-11)."""
        # 1. Scheduled arrivals for this tick
        scheduled = self.demand_schedule.get_arrivals(self.current_tick)
        arrivals_to_spawn = list(scheduled)

        # 2. Congestion burst multiplier
        if self.congested_entry and self.congestion_multiplier > 1.0:
            extra_count = int(max(1, len(scheduled)) * (self.congestion_multiplier - 1.0))
            for i in range(extra_count):
                dests = [d for d in self.network.junctions.keys() if d != self.congested_entry]
                arrivals_to_spawn.append({
                    "id": f"v_surge_{self.current_tick}_{i}",
                    "type": self.event_rng.choice(["car", "auto", "two_wheeler"]),
                    "origin": self.congested_entry,
                    "dest": self.event_rng.choice(dests),
                })

        # 3. Continuous Rate-Based Spawn Accumulator (Phases 6 & 7)
        # Guarantees steady, non-zero traffic demand for the entire lifetime of the server
        effective_spawn_rate = (
            self.base_spawn_rate
            * self.weather_state.spawn_multiplier
            * (self.congestion_multiplier if self.congested_entry else 1.0)
        )
        self.spawn_accumulator += self.dt * effective_spawn_rate
        entry_nodes = list(self.network.junctions.keys())
        while self.spawn_accumulator >= 1.0:
            origin = self.event_rng.choice(entry_nodes)
            dests = [d for d in entry_nodes if d != origin]
            dest = self.event_rng.choice(dests)
            v_type = self.event_rng.choices(["car", "auto", "two_wheeler", "bus"], weights=[0.35, 0.20, 0.35, 0.10], k=1)[0]
            self.vehicle_counter += 1
            arrivals_to_spawn.append({
                "id": f"v_cont_{self.current_tick}_{self.vehicle_counter}",
                "type": v_type,
                "origin": origin,
                "dest": dest,
            })
            self.spawn_accumulator -= 1.0

        # 4. Anti-Starvation Traffic Demand (Phase 8)
        # Prevents network active vehicles from dropping to 0
        if len(self.vehicles) + len(arrivals_to_spawn) < self.min_active_vehicles:
            deficit = self.min_active_vehicles - (len(self.vehicles) + len(arrivals_to_spawn))
            for i in range(deficit):
                origin = self.event_rng.choice(entry_nodes)
                dests = [d for d in entry_nodes if d != origin]
                dest = self.event_rng.choice(dests)
                v_type = self.event_rng.choices(["car", "auto", "two_wheeler"], weights=[0.4, 0.3, 0.3], k=1)[0]
                self.vehicle_counter += 1
                arrivals_to_spawn.append({
                    "id": f"v_keepalive_{self.current_tick}_{self.vehicle_counter}",
                    "type": v_type,
                    "origin": origin,
                    "dest": dest,
                })

        # 5. Process each arrival and insert safely into network (Phases 9-11)
        for item in arrivals_to_spawn:
            origin = item["origin"]
            dest = item["dest"]
            # Network shortest route strictly excluding closed edges (Part C4)
            route = self.network.get_shortest_path(origin, dest)
            if len(route) < 2:
                # No open path from origin to destination; skip safely
                continue

            first_link = self.network.get_link(route[0], route[1])
            if not first_link or first_link.is_closed:
                continue

            # Check physical spacing at link entry
            current_on_link = self.link_vehicles[first_link.id]
            if len(current_on_link) > 0:
                rear_vehicle = min(current_on_link, key=lambda v: v.position_m)
                if rear_vehicle.position_m < 7.0:
                    # Entrance temporarily occupied; will try next tick
                    continue

            vehicle = Vehicle(
                vehicle_id=item["id"],
                v_type=item["type"],
                origin=origin,
                destination=dest,
                route=route,
                config=self.network.raw_config,
                creation_tick=self.current_tick,
            )
            vehicle.apply_weather_modifiers(self.weather_state.speed_multiplier, self.weather_state.braking_multiplier)
            vehicle.current_link_id = first_link.id
            vehicle.position_m = 0.0
            self.vehicles[vehicle.id] = vehicle
            self.link_vehicles[first_link.id].append(vehicle)
            self.total_spawned_count += 1

    def _update_vehicle_physics(self):
        """Advances vehicle kinematics, checks signals, and reroutes when downstream roads close (Part C3 & D2)."""
        for link_id, link in self.network.links.items():
            if link_id not in self.link_vehicles:
                self.link_vehicles[link_id] = []
            vehs = self.link_vehicles[link_id]
            vehs.sort(key=lambda v: v.position_m, reverse=True)

            to_transfer: List[Tuple[Vehicle, str]] = []
            to_complete: List[Vehicle] = []

            for idx, veh in enumerate(vehs):
                lead_distance = None
                lead_speed = None
                if idx > 0:
                    leader = vehs[idx - 1]
                    lead_distance = max(0.1, leader.position_m - veh.position_m - leader.length_m)
                    lead_speed = leader.speed_mps
                else:
                    downstream_junction = self.junctions.get(link.to_node)
                    if downstream_junction:
                        dist_to_stopline = max(0.1, link.length_m - veh.position_m)
                        approaches = self.network.get_approaches(downstream_junction.id)
                        arm = "N"
                        for a_name, a_link in approaches.items():
                            if a_link and a_link.id == link.id:
                                arm = a_name
                                break

                        can_go = downstream_junction.can_proceed(arm)
                        if not can_go:
                            lead_distance = dist_to_stopline
                            lead_speed = 0.0

                # Compute IDM acceleration
                accel = veh.compute_idm_accel(lead_distance, lead_speed, link.current_speed_limit_mps)
                veh.update_physics(accel, self.dt, link.length_m)

                # Reached end of current link
                if veh.position_m >= link.length_m:
                    downstream_j = self.junctions.get(link.to_node)
                    approaches = self.network.get_approaches(link.to_node) if downstream_j else {}
                    arm = "N"
                    for a_name, a_link in approaches.items():
                        if a_link and a_link.id == link.id:
                            arm = a_name
                            break

                    can_enter = downstream_j.can_proceed(arm) if downstream_j else True
                    if can_enter:
                        if veh.route_index + 2 < len(veh.route):
                            next_u = veh.route[veh.route_index + 1]
                            next_v = veh.route[veh.route_index + 2]
                            next_link = self.network.get_link(next_u, next_v)

                            # If next link is closed, dynamic reroute (Part C3)
                            if next_link and next_link.is_closed:
                                alt_route = self.network.find_alternate_route(link.to_node, veh.destination, avoid_link_id=next_link.id)
                                if alt_route and len(alt_route) >= 2:
                                    veh.reroute(alt_route)
                                    next_u = veh.route[veh.route_index]
                                    next_v = veh.route[veh.route_index + 1]
                                    next_link = self.network.get_link(next_u, next_v)
                                    self.route_reroute_count += 1
                                else:
                                    # Safe holding: cannot proceed, hold safely
                                    veh.position_m = link.length_m - 0.5
                                    veh.speed_mps = 0.0
                                    veh.is_route_blocked = True
                                    veh.status = "ROUTE_BLOCKED"
                                    continue

                            # Transfer if next link has capacity
                            if next_link and not next_link.is_closed and len(self.link_vehicles.get(next_link.id, [])) < int(next_link.length_m / 4.2):
                                veh.route_index += 1
                                veh.is_route_blocked = False
                                veh.status = "CROSSING"
                                to_transfer.append((veh, next_link.id))
                            else:
                                # Spillback hold at stopline
                                veh.position_m = link.length_m - 0.5
                                veh.speed_mps = 0.0
                        else:
                            to_complete.append(veh)
                    else:
                        # Stop at red signal
                        veh.position_m = link.length_m - 0.5
                        veh.speed_mps = 0.0

            for veh, next_link_id in to_transfer:
                vehs.remove(veh)
                veh.current_link_id = next_link_id
                veh.position_m = 0.0
                self.link_vehicles[next_link_id].append(veh)

            for veh in to_complete:
                vehs.remove(veh)
                veh.mark_completed(self.sim_time)

                # Accumulate authoritative statistics
                self.completed_count += 1
                self.cumulative_wait_s += veh.waiting_time_s
                self.cumulative_travel_s += veh.time_in_network_s
                cons = self.env_model.calculate_vehicle_consumption(veh)
                self.cumulative_fuel_l += cons["fuel_liters"]
                self.cumulative_co2_kg += cons["co2_kg"]

                # Add to completed list bounded to last 300 (Phase 5 & 14)
                self.completed_vehicles.append(veh)
                if len(self.completed_vehicles) > 300:
                    self.completed_vehicles.pop(0)

                # Store lightweight historical trip record
                trip_record = {
                    "vehicle_id": veh.id,
                    "type": getattr(veh, "type", "car"),
                    "origin": veh.origin,
                    "dest": veh.destination,
                    "spawn_tick": veh.creation_tick,
                    "complete_time": round(self.sim_time, 1),
                    "travel_time_s": round(veh.time_in_network_s, 1),
                    "wait_time_s": round(veh.waiting_time_s, 1),
                    "weather": self.weather,
                }
                self.trip_history.append(trip_record)
                if len(self.trip_history) > 1000:
                    self.trip_history.pop(0)

                if veh.id in self.vehicles:
                    del self.vehicles[veh.id]

    def _update_sensors_and_queues(self):
        """Strict non-negative queue measurement and peak tracking (Part A4)."""
        current_district_max_q = 0
        for j_id, j in self.junctions.items():
            approaches = self.network.get_approaches(j_id)
            for arm in ["N", "S", "E", "W"]:
                link = approaches.get(arm)
                if link:
                    link_vehs = self.link_vehicles.get(link.id, [])
                    # Queued vehicle: within 65m and stopped (speed < 0.5 m/s)
                    q_count = sum(1 for v in link_vehs if (link.length_m - v.position_m) < 65.0 and v.is_stopped)
                    # Clamped non-negative
                    q_count = max(0, q_count)
                    j.queues[arm] = q_count
                    j.vehicle_counts[arm] = len(link_vehs)
                    speeds = [v.speed_mps for v in link_vehs]
                    j.avg_speeds[arm] = sum(speeds) / len(speeds) if speeds else link.current_speed_limit_mps
                    if q_count > current_district_max_q:
                        current_district_max_q = q_count
                else:
                    j.queues[arm] = 0
                    j.vehicle_counts[arm] = 0
                    j.avg_speeds[arm] = 0.0

        self.peak_queue_observed = max(self.peak_queue_observed, current_district_max_q)

    def _record_metrics(self):
        """Authoritative metrics calculation per tick (Part A2 & A3)."""
        all_active = list(self.vehicles.values())

        # Wait time strictly from actual vehicle states (Part A3)
        if self.completed_count > 0:
            avg_wait = self.cumulative_wait_s / self.completed_count
            avg_travel = self.cumulative_travel_s / self.completed_count
        elif len(all_active) > 0:
            avg_wait = sum(v.waiting_time_s for v in all_active) / len(all_active)
            avg_travel = sum(v.time_in_network_s for v in all_active) / len(all_active)
        else:
            avg_wait = 0.0
            avg_travel = 0.0

        current_max_q = max((max(j.queues.values()) for j in self.junctions.values()), default=0)
        current_max_q = max(0, current_max_q)
        throughput = self.completed_count

        # Average speed across network
        if len(all_active) > 0:
            avg_speed_kmh = (sum(v.speed_mps for v in all_active) / len(all_active)) * 3.6
        else:
            avg_speed_kmh = 35.0

        # Emissions: cumulative completed + active vehicles (O(N_active) runtime)
        active_fuel = 0.0
        active_co2 = 0.0
        for v in all_active:
            cons = self.env_model.calculate_vehicle_consumption(v)
            active_fuel += cons["fuel_liters"]
            active_co2 += cons["co2_kg"]
        total_fuel = self.cumulative_fuel_l + active_fuel
        total_co2 = self.cumulative_co2_kg + active_co2

        # Closed links count
        closed_roads_count = sum(1 for l in self.network.links.values() if l.is_closed)

        record = {
            "tick": self.current_tick,
            "sim_time": round(self.sim_time, 1),
            "active_vehicles": len(all_active),
            "completed_vehicles": throughput,
            "avg_wait_s": round(avg_wait, 2),
            "max_queue": current_max_q,
            "peak_queue": self.peak_queue_observed,
            "throughput": throughput,
            "avg_speed_kmh": round(avg_speed_kmh, 1),
            "avg_travel_time_s": round(avg_travel, 2),
            "total_fuel_l": round(total_fuel, 2),
            "total_co2_kg": round(total_co2, 2),
            "plan_changes": self.controller.total_plan_changes,
            "closed_roads": closed_roads_count,
            "blocked_vehicles": self.blocked_vehicles_count,
            "reroutes": self.route_reroute_count,
            "weather": self.weather,
        }
        self.metrics_history.append(record)
        # Bounded to MAX_METRIC_SAMPLES = 3600 (Phase 16)
        if len(self.metrics_history) > 3600:
            self.metrics_history.pop(0)

    def get_authoritative_metrics(self) -> Dict[str, Any]:
        """Single authoritative metrics structure (Part A2)."""
        if not self.metrics_history:
            return {
                "simulation_id": self.simulation_id,
                "elapsed_time": 0.0,
                "vehicle_count": 0,
                "completed_vehicles": 0,
                "active_vehicles": 0,
                "average_wait_time": 0.0,
                "peak_queue_length": 0,
                "throughput": 0,
                "average_speed_kmh": 35.0,
                "weather_condition": self.weather,
                "road_closures": 0,
                "spillback_events": 0,
                "plan_changes": 0,
            }

        last = self.metrics_history[-1]
        return {
            "simulation_id": self.simulation_id,
            "elapsed_time": last["sim_time"],
            "vehicle_count": last["active_vehicles"] + last["completed_vehicles"],
            "completed_vehicles": last["completed_vehicles"],
            "active_vehicles": last["active_vehicles"],
            "average_wait_time": last["avg_wait_s"],
            "peak_queue_length": last["peak_queue"],
            "current_max_queue": last["max_queue"],
            "throughput": last["throughput"],
            "average_speed_kmh": last["avg_speed_kmh"],
            "average_travel_time": last["avg_travel_time_s"],
            "total_fuel_l": last["total_fuel_l"],
            "total_co2_kg": last["total_co2_kg"],
            "weather_condition": self.weather,
            "road_closures": last["closed_roads"],
            "blocked_vehicles": last["blocked_vehicles"],
            "reroutes": last["reroutes"],
            "plan_changes": last["plan_changes"],
        }

    def get_summary_metrics(self) -> Dict[str, Any]:
        """Provides summary metrics for comparisons."""
        if not self.metrics_history:
            return {
                "avg_wait_s": 0.0,
                "max_queue": 0,
                "peak_queue": 0,
                "throughput": 0,
                "total_fuel_l": 0.0,
                "total_co2_kg": 0.0,
                "avg_travel_time_s": 0.0,
                "plan_changes": 0,
                "active_vehicles": 0,
                "total_spawned": 0,
                "completed_vehicles": 0,
            }
        last = self.metrics_history[-1]
        return {
            "avg_wait_s": last["avg_wait_s"],
            "max_queue": last["max_queue"],
            "peak_queue": last["peak_queue"],
            "throughput": last["throughput"],
            "total_fuel_l": last["total_fuel_l"],
            "total_co2_kg": last["total_co2_kg"],
            "avg_travel_time_s": last["avg_travel_time_s"],
            "plan_changes": last["plan_changes"],
            "active_vehicles": last["active_vehicles"],
            "total_spawned": last["active_vehicles"] + last["completed_vehicles"],
            "completed_vehicles": last["completed_vehicles"],
        }
