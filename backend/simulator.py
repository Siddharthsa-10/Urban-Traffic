import random
import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
from .network import RoadNetwork
from .junction import Junction
from .vehicle import Vehicle

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
with open(CONFIG_DIR / "vehicles.json", "r", encoding="utf-8") as f:
    VEHICLE_CONFIG = json.load(f)

class TrafficSimulator:
    def __init__(self, seed: int = 42, enable_8_junctions: bool = False):
        self.seed = seed
        self.rng = random.Random(seed)
        self.enable_8_junctions = enable_8_junctions
        self.sim_time = 0.0
        self.dt = 1.0  # 1 second ticks

        self.network = RoadNetwork(enable_8_junctions=enable_8_junctions)
        self.junctions: Dict[str, Junction] = {}
        self._init_junctions()

        self.vehicles: Dict[str, Vehicle] = {}
        self.completed_vehicles: List[Vehicle] = []
        self.vehicle_id_counter = 0

        # Demand generation params
        self.base_spawn_rate = 0.55  # veh/sec average entry across boundary nodes
        self.demand_multiplier = 1.0
        self.boundary_nodes = ["J1", "J3", "J4", "J6"]
        if self.enable_8_junctions:
            self.boundary_nodes.extend(["J7", "J8"])

        # Windowed metrics (last 60 seconds)
        self.windowed_throughput_history: List[Tuple[float, int]] = []
        self.cum_fuel_liters = 0.0
        self.cum_co2_kg = 0.0
        self.total_completed_travel_time = 0.0
        self.total_completed_wait_time = 0.0
        self.max_observed_queue = 0
        self.active_controller_name = "Fixed-Time"
        self.solver_computation_time_ms = 0.0

    def _init_junctions(self):
        for node_id, data in self.network.graph.nodes(data=True):
            j = Junction(node_id, data.get("name", node_id), data.get("x", 0), data.get("y", 0))
            self.junctions[node_id] = j

        # Configure approach mapping based on grid relative positions
        for u, v, data in self.network.graph.edges(data=True):
            ju = self.junctions.get(u)
            jv = self.junctions.get(v)
            if not ju or not jv:
                continue
            dx = jv.x - ju.x
            dy = jv.y - ju.y
            # Inbound into v from u:
            if abs(dx) > abs(dy):
                direction = "W" if dx > 0 else "E"
            else:
                direction = "N" if dy > 0 else "S"
            jv.inbound_links[direction] = u

    def spawn_vehicle(self, veh_type: Optional[str] = None, origin: Optional[str] = None, dest: Optional[str] = None) -> Optional[Vehicle]:
        orig = origin or self.rng.choice(self.boundary_nodes)
        dests = [n for n in self.boundary_nodes if n != orig]
        destination = dest or self.rng.choice(dests)

        route = self.network.get_route(orig, destination)
        if not route or len(route) < 2:
            return None

        # Pick vehicle type based on distribution
        if not veh_type:
            r = self.rng.random()
            cum = 0.0
            for t_name, share in VEHICLE_CONFIG["proportions"].items():
                cum += share
                if r <= cum:
                    veh_type = t_name
                    break
            if not veh_type:
                veh_type = "car"

        self.vehicle_id_counter += 1
        v_id = f"v_{self.vehicle_id_counter}"
        veh = Vehicle(v_id, veh_type, route, self.sim_time)
        self.vehicles[v_id] = veh
        return veh

    def step(self):
        self.sim_time += self.dt

        # 1. Update signals for all junctions
        for j in self.junctions.values():
            j.tick_signals(self.dt)

        # 2. Stochastic demand spawning (Poisson process)
        expected_arrivals = self.base_spawn_rate * self.demand_multiplier * self.dt
        while self.rng.random() < expected_arrivals:
            self.spawn_vehicle()
            expected_arrivals -= 1.0

        # 3. Group vehicles by current directed edge and sort by position
        edge_vehicles: Dict[Tuple[str, str], List[Vehicle]] = {}
        for veh in self.vehicles.values():
            edge_vehicles.setdefault(veh.current_edge, []).append(veh)

        for edge, v_list in edge_vehicles.items():
            v_list.sort(key=lambda v: v.position, reverse=True)

        # 4. Update vehicle physics (IDM)
        departed_vehicle_ids = []
        for edge, v_list in edge_vehicles.items():
            u, v = edge
            edge_data = self.network.graph.get_edge_data(u, v, default={})
            link_len = edge_data.get("length_m", 300.0)
            target_junction = self.junctions.get(v)

            # Determine signal state at the end of the edge for this approach
            approach_dir = "N"
            if target_junction:
                for adir, from_node in target_junction.inbound_links.items():
                    if from_node == u:
                        approach_dir = adir
                        break
                signal_color = target_junction.get_signal_color(approach_dir)
            else:
                signal_color = "GREEN"

            for i, veh in enumerate(v_list):
                leader_dist = None
                leader_speed = None
                if i > 0:
                    leader = v_list[i - 1]
                    leader_dist = leader.position - veh.position - leader.length
                    leader_speed = leader.speed

                red_light_dist = None
                if signal_color in ("RED", "YELLOW"):
                    dist_to_stop = link_len - veh.position
                    if dist_to_stop > 0:
                        red_light_dist = dist_to_stop

                # Adjust desired speed if edge is under accident or flooded
                if edge_data.get("has_accident", False):
                    veh.desired_speed = min(veh.max_speed, 4.0)
                elif edge_data.get("special") == "floodable_underpass" and edge_data.get("is_closed", False):
                    red_light_dist = max(1.0, link_len - veh.position)
                else:
                    veh.desired_speed = veh.max_speed

                veh.update_idm(self.dt, leader_dist, leader_speed, red_light_dist)

                # Check if vehicle traversed the edge
                if veh.position >= link_len:
                    if signal_color == "GREEN" or (signal_color == "YELLOW" and veh.speed > 5.0):
                        # Advance to next node
                        veh.route_idx += 1
                        if veh.route_idx >= len(veh.route) - 1:
                            # Finished journey
                            veh.is_completed = True
                            veh.exit_time = self.sim_time
                            departed_vehicle_ids.append(veh.id)
                        else:
                            next_u = veh.route[veh.route_idx]
                            next_v = veh.route[veh.route_idx + 1]
                            veh.current_edge = (next_u, next_v)
                            veh.position = 0.0

        # Remove completed vehicles and record metrics
        for v_id in departed_vehicle_ids:
            v = self.vehicles.pop(v_id)
            self.completed_vehicles.append(v)
            trip_time = v.exit_time - v.entry_time
            self.total_completed_travel_time += trip_time
            self.total_completed_wait_time += v.total_wait_time
            self.cum_fuel_liters += v.fuel_consumed_liters
            self.cum_co2_kg += v.co2_emitted_kg
            self.windowed_throughput_history.append((self.sim_time, 1))

        # 5. Sensor measurements aggregation
        edge_occupancies = {edge: len(v_list) for edge, v_list in edge_vehicles.items()}
        self.network.update_edge_costs(edge_occupancies)

        for j_id, j in self.junctions.items():
            for arm, from_node in j.inbound_links.items():
                e_vehs = edge_vehicles.get((from_node, j_id), [])
                # Count queued vehicles (speed < 1.0 m/s and within 120m of stop line)
                queue_count = sum(1 for v in e_vehs if v.speed < 1.0 and (300.0 - v.position) <= 120.0)
                j.queues[arm] = queue_count
                self.max_observed_queue = max(self.max_observed_queue, queue_count)

                if e_vehs:
                    j.approach_speeds[arm] = sum(v.speed for v in e_vehs) / len(e_vehs)
                    j.occupancies[arm] = len(e_vehs) / 30.0
                    j.total_wait_by_dir[arm] = sum(v.total_wait_time for v in e_vehs)
                else:
                    j.approach_speeds[arm] = 12.0
                    j.occupancies[arm] = 0.0
                    j.total_wait_by_dir[arm] = 0.0

        # Prune windowed throughput (> 60s old)
        cutoff = self.sim_time - 60.0
        self.windowed_throughput_history = [
            (t, count) for (t, count) in self.windowed_throughput_history if t >= cutoff
        ]

    def get_metrics(self) -> Dict[str, Any]:
        num_completed = max(1, len(self.completed_vehicles))
        throughput_per_min = sum(c for _, c in self.windowed_throughput_history)
        active_fuel = sum(v.fuel_consumed_liters for v in self.vehicles.values())
        active_co2 = sum(v.co2_emitted_kg for v in self.vehicles.values())
        total_fuel = self.cum_fuel_liters + active_fuel
        total_co2 = self.cum_co2_kg + active_co2

        all_vehs = list(self.vehicles.values()) + self.completed_vehicles
        avg_wait = (sum(v.total_wait_time for v in all_vehs) / len(all_vehs)) if all_vehs else 0.0
        avg_travel = (self.total_completed_travel_time / num_completed) if self.completed_vehicles else 0.0

        total_signal_changes = sum(j.signal_change_count for j in self.junctions.values())

        return {
            "sim_time": round(self.sim_time, 1),
            "active_vehicles": len(self.vehicles),
            "completed_vehicles": len(self.completed_vehicles),
            "avg_wait_time_s": round(avg_wait, 2),
            "avg_travel_time_s": round(avg_travel, 2),
            "max_queue": self.max_observed_queue,
            "throughput_veh_per_min": throughput_per_min,
            "total_fuel_liters": round(total_fuel, 3),
            "total_co2_kg": round(total_co2, 3),
            "total_signal_changes": total_signal_changes,
            "solver_computation_time_ms": round(self.solver_computation_time_ms, 2)
        }
