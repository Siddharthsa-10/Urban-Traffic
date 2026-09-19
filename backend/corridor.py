import math
from typing import Dict, List, Tuple, Optional, Any

class EmergencyCorridorManager:
    """Manages ambulance green wave preemption, queue clearance, and restoration."""
    def __init__(self, simulator: Any):
        self.sim = simulator
        self.active = False
        self.ambulance_id: Optional[str] = None
        self.origin = "J4"          # Hospital Gate
        self.destination = "J3"     # Highway Accident Site (or east edge)
        self.route: List[str] = []
        self.alternative_routes: List[List[str]] = []
        self.etas: Dict[str, float] = {}  # junction_id -> estimated arrival time (sim_time seconds)
        self.preempted_junctions: Dict[str, str] = {}  # junction_id -> target_axis ("NS" or "EW")
        self.dispatch_time: float = 0.0
        self.completion_time: Optional[float] = None
        self.start_delay_baseline: float = 0.0

    def dispatch(self, origin: str = "J4", destination: str = "J3") -> bool:
        self.origin = origin
        self.destination = destination
        self.dispatch_time = self.sim.sim_time
        self.completion_time = None

        # 1. Compute queue-aware route and alternatives
        net = self.sim.network
        self.route = net.get_route(origin, destination) or [origin, destination]
        self.alternative_routes = net.get_alternative_routes(origin, destination, k=2)

        # 2. Spawn emergency ambulance
        amb = self.sim.spawn_vehicle(veh_type="ambulance", origin=origin, dest=destination)
        if not amb:
            return False

        self.ambulance_id = amb.id
        self.active = True

        # 3. Calculate initial ETAs along route
        self._calculate_etas()
        return True

    def _calculate_etas(self):
        self.etas.clear()
        if not self.active or not self.ambulance_id or self.ambulance_id not in self.sim.vehicles:
            return

        amb = self.sim.vehicles[self.ambulance_id]
        curr_time = self.sim.sim_time

        # Traverse remaining route nodes
        remaining_route = amb.route[amb.route_idx:]
        accumulated_time = 0.0

        for i in range(len(remaining_route) - 1):
            u = remaining_route[i]
            v = remaining_route[i + 1]
            edge_data = self.sim.network.graph.get_edge_data(u, v, default={})
            link_len = edge_data.get("length_m", 300.0)

            # In front of vehicle on current link
            if i == 0:
                dist = max(10.0, link_len - amb.position)
            else:
                dist = link_len

            # Speed with emergency siren
            eff_speed = min(amb.max_speed, 14.0)
            t_edge = dist / eff_speed
            accumulated_time += t_edge
            self.etas[v] = round(curr_time + accumulated_time, 1)

    def update(self):
        """Update preemption and wave of green light."""
        if not self.active or not self.ambulance_id:
            return

        if self.ambulance_id not in self.sim.vehicles:
            # Ambulance finished journey
            self.active = False
            self.completion_time = self.sim.sim_time
            self._restore_junctions()
            return

        amb = self.sim.vehicles[self.ambulance_id]
        self._calculate_etas()
        curr_time = self.sim.sim_time
        self.preempted_junctions.clear()

        # Check each junction along route
        for i in range(len(amb.route) - 1):
            u = amb.route[i]
            v = amb.route[i + 1]
            target_j = self.sim.junctions.get(v)
            if not target_j:
                continue

            eta = self.etas.get(v, curr_time + 999.0)
            time_to_arrival = eta - curr_time

            # Queue length in front of ambulance approaching v
            queue_len = 0
            for arm, from_node in target_j.inbound_links.items():
                if from_node == u:
                    queue_len = target_j.queues.get(arm, 0)
                    break

            # Lead time needed to discharge queue: ~1.8s per queued vehicle + 6s buffer
            lead_time = max(8.0, queue_len * 1.8 + 6.0)
            clearance_time = 5.0  # seconds after passage

            # Determine ambulance travel axis into junction v
            ju = self.sim.junctions.get(u)
            if ju and abs(target_j.x - ju.x) > abs(target_j.y - ju.y):
                target_axis = "EW"
            else:
                target_axis = "NS"

            # Preemption window: [ETA - lead_time, ETA + clearance_time]
            if time_to_arrival <= lead_time and time_to_arrival >= -clearance_time:
                self.preempted_junctions[v] = target_axis
                target_j.is_preempted = True
                target_j.preempt_target_axis = target_axis

                # Enforce safe transition (never jump straight; run yellow/all-red if changing)
                if target_j.active_axis != target_axis and target_j.sub_phase == "GREEN":
                    target_j.sub_phase = "YELLOW"
                    target_j.phase_elapsed = 0.0
                elif target_j.active_axis == target_axis and target_j.sub_phase == "GREEN":
                    # Extend green duration so it doesn't turn red while ambulance approaches
                    target_j.phase_target_duration = max(target_j.phase_target_duration, time_to_arrival + 10.0)
            elif time_to_arrival < -clearance_time:
                # Ambulance passed this junction; ease back
                if target_j.is_preempted:
                    target_j.is_preempted = False

    def _restore_junctions(self):
        """Restore junctions to normal signal timing smoothly."""
        for j in self.sim.junctions.values():
            if j.is_preempted:
                j.is_preempted = False

    def get_status(self) -> Dict[str, Any]:
        amb = self.sim.vehicles.get(self.ambulance_id) if self.ambulance_id else None
        travel_time = 0.0
        if self.completion_time:
            travel_time = self.completion_time - self.dispatch_time
        elif self.active and self.ambulance_id:
            travel_time = self.sim.sim_time - self.dispatch_time

        return {
            "active": self.active,
            "ambulance_id": self.ambulance_id,
            "origin": self.origin,
            "destination": self.destination,
            "route": self.route,
            "alternative_routes": self.alternative_routes,
            "etas": self.etas,
            "preempted_junctions": self.preempted_junctions,
            "travel_time_s": round(travel_time, 1),
            "position": round(amb.position, 1) if amb else 0.0,
            "current_edge": f"{amb.current_edge[0]}->{amb.current_edge[1]}" if amb else ""
        }
