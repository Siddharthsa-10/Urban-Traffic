import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import networkx as nx

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"

class RoadNetwork:
    def __init__(self, district_config_path: Optional[Path] = None, enable_8_junctions: bool = False):
        path = district_config_path or (CONFIG_DIR / "district.json")
        with open(path, "r", encoding="utf-8") as f:
            self.data = json.load(f)
        self.enable_8_junctions = enable_8_junctions
        self.graph = nx.DiGraph()
        self.closed_edges = set()
        self.accident_edges = {}
        self.build_graph()

    def build_graph(self):
        self.graph.clear()
        junctions = self.data["junctions"]
        for j_id, j_info in junctions.items():
            if j_info.get("optional", False) and not self.enable_8_junctions:
                continue
            self.graph.add_node(j_id, **j_info)

        for link in self.data["links"]:
            if link.get("optional", False) and not self.enable_8_junctions:
                continue
            u, v = link["from"], link["to"]
            speed_ms = link["speed_limit_kmh"] / 3.6
            free_flow_s = link["length_m"] / speed_ms
            edge_attrs = {
                "id": link["id"],
                "name": link["name"],
                "length_m": link["length_m"],
                "lanes": link["lanes"],
                "speed_limit_ms": speed_ms,
                "free_flow_s": free_flow_s,
                "capacity": link["capacity"],
                "special": link.get("special", "normal"),
                "current_vehicles": 0,
                "travel_time_s": free_flow_s,
                "is_closed": False,
                "has_accident": False,
            }
            # Link is directed; if bidirectional add both directions
            self.graph.add_edge(u, v, **edge_attrs, direction=f"{u}->{v}")
            if link.get("bidirectional", True):
                self.graph.add_edge(v, u, **edge_attrs, direction=f"{v}->{u}")

    def update_edge_costs(self, edge_occupancies: Dict[Tuple[str, str], int]):
        """Update dynamic travel times using BPR-style queue-aware function."""
        for u, v, data in self.graph.edges(data=True):
            if (u, v) in self.closed_edges or data["is_closed"]:
                data["travel_time_s"] = 1e6
                continue

            num_veh = edge_occupancies.get((u, v), data["current_vehicles"])
            cap = data["capacity"]
            if (u, v) in self.accident_edges:
                cap = max(1, cap // 2)

            t0 = data["free_flow_s"]
            # BPR delay function: t = t0 * (1 + 0.15 * (V/C)^4)
            ratio = num_veh / max(1, cap)
            delay = t0 * (1.0 + 0.5 * (ratio ** 3))
            data["travel_time_s"] = delay

    def close_road(self, u: str, v: str, bidirectional: bool = True):
        self.closed_edges.add((u, v))
        if self.graph.has_edge(u, v):
            self.graph[u][v]["is_closed"] = True
        if bidirectional:
            self.closed_edges.add((v, u))
            if self.graph.has_edge(v, u):
                self.graph[v][u]["is_closed"] = True

    def reopen_road(self, u: str, v: str, bidirectional: bool = True):
        self.closed_edges.discard((u, v))
        if self.graph.has_edge(u, v):
            self.graph[u][v]["is_closed"] = False
        if bidirectional:
            self.closed_edges.discard((v, u))
            if self.graph.has_edge(v, u):
                self.graph[v][u]["is_closed"] = False

    def set_accident(self, u: str, v: str, active: bool = True):
        if active:
            self.accident_edges[(u, v)] = True
            if self.graph.has_edge(u, v):
                self.graph[u][v]["has_accident"] = True
        else:
            self.accident_edges.pop((u, v), None)
            if self.graph.has_edge(u, v):
                self.graph[u][v]["has_accident"] = False

    def get_route(self, origin: str, destination: str) -> Optional[List[str]]:
        """Compute shortest path based on current dynamic travel times."""
        try:
            return nx.shortest_path(self.graph, source=origin, target=destination, weight="travel_time_s")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None

    def get_alternative_routes(self, origin: str, destination: str, k: int = 3) -> List[List[str]]:
        try:
            generator = nx.shortest_simple_paths(self.graph, origin, destination, weight="travel_time_s")
            routes = []
            for path in generator:
                routes.append(path)
                if len(routes) >= k:
                    break
            return routes
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []
