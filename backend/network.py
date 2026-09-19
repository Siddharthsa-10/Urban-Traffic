import json
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import networkx as nx


class RoadLink:
    def __init__(
        self,
        link_id: str,
        from_node: str,
        to_node: str,
        length_m: float,
        lanes: int,
        speed_limit_mps: float,
        capacity_vph: float,
        tag: str = "",
        is_arterial: bool = False,
        is_underpass: bool = False,
        is_narrow: bool = False,
        is_8_junction_only: bool = False,
    ):
        self.id = link_id
        self.from_node = from_node
        self.to_node = to_node
        self.length_m = length_m
        self.lanes = lanes
        self.base_speed_limit_mps = speed_limit_mps
        self.current_speed_limit_mps = speed_limit_mps
        self.base_capacity_vph = capacity_vph
        self.current_capacity_vph = capacity_vph
        self.original_capacity = capacity_vph
        self.tag = tag
        self.is_arterial = is_arterial
        self.is_underpass = is_underpass
        self.is_narrow = is_narrow
        self.is_8_junction_only = is_8_junction_only

        # Dynamic conditions (Part C1)
        self.is_closed: bool = False
        self.closure_reason: str = ""
        self.has_accident: bool = False
        self.is_flooded: bool = False

    @property
    def status(self) -> str:
        return "CLOSED" if self.is_closed else "OPEN"

    @property
    def free_flow_travel_time(self) -> float:
        if self.is_closed or self.current_speed_limit_mps <= 0.1:
            return 1e9
        return self.length_m / self.current_speed_limit_mps

    def set_accident(self, active: bool):
        self.has_accident = active
        if active:
            self.current_capacity_vph = max(200.0, self.base_capacity_vph * 0.35)
            self.current_speed_limit_mps = max(3.0, self.base_speed_limit_mps * 0.45)
        else:
            self.current_capacity_vph = self.base_capacity_vph
            self.current_speed_limit_mps = self.base_speed_limit_mps

    def set_closed(self, closed: bool, reason: str = "ROAD_CLOSURE"):
        self.is_closed = closed
        self.closure_reason = reason if closed else ""
        if closed:
            self.current_capacity_vph = 0.0
            self.current_speed_limit_mps = 0.0
        else:
            self.current_capacity_vph = self.base_capacity_vph
            self.current_speed_limit_mps = self.base_speed_limit_mps

    def set_flooded(self, flooded: bool):
        self.is_flooded = flooded
        self.set_closed(flooded, reason="FLOODED_UNDERPASS")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "from": self.from_node,
            "to": self.to_node,
            "length_m": self.length_m,
            "lanes": self.lanes,
            "speed_limit_mps": self.current_speed_limit_mps,
            "capacity_vph": self.current_capacity_vph,
            "original_capacity": self.original_capacity,
            "effective_capacity": self.current_capacity_vph,
            "status": self.status,
            "closure_reason": self.closure_reason,
            "is_arterial": self.is_arterial,
            "is_underpass": self.is_underpass,
            "is_narrow": self.is_narrow,
            "is_closed": self.is_closed,
            "has_accident": self.has_accident,
            "is_flooded": self.is_flooded,
            "tag": self.tag,
        }


class CityNetwork:
    def __init__(self, config_path: Optional[str] = None, enable_8_junctions: bool = False):
        if config_path is None:
            config_path = str(Path(__file__).resolve().parent.parent / "config" / "simulation_config.json")
        with open(config_path, "r", encoding="utf-8") as f:
            self.raw_config = json.load(f)

        self.enable_8_junctions = enable_8_junctions
        self.junctions: Dict[str, Dict[str, Any]] = {}
        self.special_sites: Dict[str, Dict[str, Any]] = self.raw_config.get("special_sites", {})
        self.links: Dict[str, RoadLink] = {}
        self.graph = nx.DiGraph()

        self._build_network()

    def _build_network(self):
        self.graph.clear()
        self.junctions.clear()
        self.links.clear()

        # Add junctions
        for j_id, j_data in self.raw_config["junctions"].items():
            if j_data.get("is_8_junction_only", False) and not self.enable_8_junctions:
                continue
            self.junctions[j_id] = j_data
            self.graph.add_node(
                j_id,
                name=j_data["name"],
                world_x=j_data["world_x"],
                world_y=j_data["world_y"],
                is_junction=True,
            )

        # Add special sites
        for s_id, s_data in self.special_sites.items():
            self.graph.add_node(
                s_id,
                name=s_data["name"],
                world_x=s_data["world_x"],
                world_y=s_data["world_y"],
                is_junction=False,
                site_type=s_data.get("type", "site"),
            )

        # Add road segments
        for seg in self.raw_config["road_segments"]:
            if seg.get("is_8_junction_only", False) and not self.enable_8_junctions:
                continue
            u = seg["from"]
            v = seg["to"]
            if u not in self.graph or v not in self.graph:
                continue

            link = RoadLink(
                link_id=seg["id"],
                from_node=u,
                to_node=v,
                length_m=seg["length_m"],
                lanes=seg["lanes"],
                speed_limit_mps=seg["speed_limit_mps"],
                capacity_vph=seg["capacity_vph"],
                tag=seg.get("tag", ""),
                is_arterial=seg.get("is_arterial", False),
                is_underpass=seg.get("is_underpass", False),
                is_narrow=seg.get("is_narrow", False),
                is_8_junction_only=seg.get("is_8_junction_only", False),
            )
            self.links[link.id] = link
            self.graph.add_edge(
                u,
                v,
                id=link.id,
                link=link,
                weight=link.free_flow_travel_time,
                length=link.length_m,
            )

    def get_link(self, from_node: str, to_node: str) -> Optional[RoadLink]:
        edge_data = self.graph.get_edge_data(from_node, to_node)
        if edge_data:
            return edge_data.get("link")
        return None

    def get_link_by_id(self, link_id: str) -> Optional[RoadLink]:
        return self.links.get(link_id)

    def get_approaches(self, junction_id: str) -> Dict[str, Optional[RoadLink]]:
        """Maps incoming links to compass directions (N, S, E, W)."""
        if junction_id not in self.junctions:
            return {"N": None, "S": None, "E": None, "W": None}

        j_pos = (self.junctions[junction_id]["world_x"], self.junctions[junction_id]["world_y"])
        approaches: Dict[str, Optional[RoadLink]] = {"N": None, "S": None, "E": None, "W": None}

        for u, v, data in self.graph.in_edges(junction_id, data=True):
            link = data["link"]
            u_node = self.graph.nodes[u]
            u_pos = (u_node["world_x"], u_node["world_y"])
            dx = u_pos[0] - j_pos[0]
            dy = u_pos[1] - j_pos[1]

            # Inbound from u to j:
            if abs(dx) >= abs(dy):
                if dx < 0:
                    approaches["W"] = link
                else:
                    approaches["E"] = link
            else:
                if dy < 0:
                    approaches["N"] = link
                else:
                    approaches["S"] = link

        return approaches

    def get_shortest_path(self, origin: str, destination: str, edge_weights: Optional[Dict[str, float]] = None) -> List[str]:
        """
        Calculates shortest path strictly excluding closed edges (Part C2 & C4).
        Never returns a route across a closed road.
        """
        if origin not in self.graph or destination not in self.graph:
            return []

        # Build view with closed edges filtered out
        def filter_edge(u, v):
            d = self.graph.get_edge_data(u, v)
            if not d:
                return False
            link: RoadLink = d.get("link")
            return not (link and link.is_closed)

        sub_view = nx.subgraph_view(self.graph, filter_edge=filter_edge)

        try:
            if edge_weights:
                def custom_weight(u, v, d):
                    link = d.get("link")
                    link_id = link.id if link else f"{u}_{v}"
                    return edge_weights.get(link_id, d.get("weight", 1.0))
                return nx.dijkstra_path(sub_view, origin, destination, weight=custom_weight)
            else:
                return nx.dijkstra_path(sub_view, origin, destination, weight="weight")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    def find_alternate_route(self, current_node: str, destination: str, avoid_link_id: Optional[str] = None) -> List[str]:
        """
        Finds a valid bypass route from current_node to destination strictly avoiding closed links
        and optionally an additional blocked link (Part C3).
        """
        if current_node not in self.graph or destination not in self.graph:
            return []

        def filter_edge(u, v):
            d = self.graph.get_edge_data(u, v)
            if not d:
                return False
            link: RoadLink = d.get("link")
            if link and link.is_closed:
                return False
            if avoid_link_id and link and link.id == avoid_link_id:
                return False
            return True

        sub_view = nx.subgraph_view(self.graph, filter_edge=filter_edge)
        try:
            return nx.dijkstra_path(sub_view, current_node, destination, weight="weight")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    def set_accident(self, link_id: str, active: bool = True):
        if link_id in self.links:
            self.links[link_id].set_accident(active)
            self.graph[self.links[link_id].from_node][self.links[link_id].to_node]["weight"] = self.links[link_id].free_flow_travel_time

    def set_road_closure(self, link_id: str, closed: bool = True, reason: str = "ROAD_CLOSURE"):
        if link_id in self.links:
            self.links[link_id].set_closed(closed, reason=reason)
            self.graph[self.links[link_id].from_node][self.links[link_id].to_node]["weight"] = self.links[link_id].free_flow_travel_time

    def set_underpass_flood(self, flooded: bool = True):
        for link in self.links.values():
            if link.is_underpass:
                link.set_flooded(flooded)
                self.graph[link.from_node][link.to_node]["weight"] = link.free_flow_travel_time

    def get_node_pos(self, node_id: str) -> Optional[Tuple[float, float]]:
        if node_id in self.graph.nodes:
            node = self.graph.nodes[node_id]
            return (float(node.get("world_x", 0.0)), float(node.get("world_y", 0.0)))
        return None
