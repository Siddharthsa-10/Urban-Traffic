import math
from typing import Dict, List, Any
from ..junction import Junction
from ..network import CityNetwork


class PredictionEngine:
    def __init__(self, network: CityNetwork):
        self.network = network

    def predict_junction(self, junction: Junction, link_vehicles: Dict[str, List[Any]], horizon_s: int = 45) -> Dict[str, Any]:
        """
        Projects queue growth and traffic pressure at a junction over the forecast horizon.
        Explicitly separates currentQueue, predictedQueue, and queueDelta (Part A5).
        Guarantees non-negative queue and prediction values (Part A4).
        """
        # Find links ending at this junction
        ns_approaches = []
        ew_approaches = []
        for lid, link in self.network.links.items():
            if link.to_node == junction.id:
                if "J1_J3" in lid or "J3_J1" in lid or "J2_J4" in lid or "J4_J2" in lid:
                    ns_approaches.append(link)
                else:
                    ew_approaches.append(link)

        # Approaching vehicle counts and active speeds
        ns_approaching = sum(len(link_vehicles.get(l.id, [])) for l in ns_approaches)
        ew_approaching = sum(len(link_vehicles.get(l.id, [])) for l in ew_approaches)

        # In Junction class, queues has N, S, E, W
        ns_current_q = max(0, junction.queues.get("N", 0) + junction.queues.get("S", 0))
        ew_current_q = max(0, junction.queues.get("E", 0) + junction.queues.get("W", 0))
        current_total_q = ns_current_q + ew_current_q

        # Physical capacity of approaches (vehicles that can fit)
        ns_capacity = max(10, sum(int(l.length_m / 6.5) for l in ns_approaches))
        ew_capacity = max(10, sum(int(l.length_m / 6.5) for l in ew_approaches))

        # Inflow arrivals over forecast horizon (+45s)
        # Inflow depends on vehicles approaching plus incoming flow from upstream
        time_fraction = horizon_s / 60.0
        ns_arrivals = max(0.0, ns_approaching * 0.65 + 1.2 * time_fraction)
        ew_arrivals = max(0.0, ew_approaching * 0.65 + 1.2 * time_fraction)

        # Active green split & signal discharge rate
        phase_str = str(junction.current_phase.value if hasattr(junction.current_phase, "value") else junction.current_phase)
        is_ns_green = "NS_GREEN" in phase_str
        is_ew_green = "EW_GREEN" in phase_str

        # Discharge rates: green direction discharges at saturation rate ~2.2 veh/s, red ~0
        green_time_ratio = (junction.ns_green_target / (junction.ns_green_target + junction.ew_green_target)) if (junction.ns_green_target + junction.ew_green_target) > 0 else 0.5
        if is_ns_green:
            ns_max_discharge = (junction.time_remaining_s * 0.55) + (horizon_s - junction.time_remaining_s) * green_time_ratio * 0.5
            ew_max_discharge = (horizon_s - junction.time_remaining_s) * (1.0 - green_time_ratio) * 0.5
        else:
            ew_max_discharge = (junction.time_remaining_s * 0.55) + (horizon_s - junction.time_remaining_s) * (1.0 - green_time_ratio) * 0.5
            ns_max_discharge = (horizon_s - junction.time_remaining_s) * green_time_ratio * 0.5

        # Effective discharge cannot exceed available vehicles (current queue + arriving vehicles)
        ns_effective_discharge = min(ns_current_q + ns_arrivals, max(0.0, ns_max_discharge))
        ew_effective_discharge = min(ew_current_q + ew_arrivals, max(0.0, ew_max_discharge))

        # Predicted queues: MUST NEVER BE NEGATIVE (Part A4 & A5)
        ns_predicted_q = max(0, int(round(ns_current_q + ns_arrivals - ns_effective_discharge)))
        ew_predicted_q = max(0, int(round(ew_current_q + ew_arrivals - ew_effective_discharge)))

        # Expected deltas
        ns_delta = ns_predicted_q - ns_current_q
        ew_delta = ew_predicted_q - ew_current_q

        # Dominant axis
        if (ns_current_q + ns_approaching) >= (ew_current_q + ew_approaching):
            dominant_axis = "NS"
            dom_current = ns_current_q
            dom_predicted = ns_predicted_q
            dom_delta = ns_delta
        else:
            dominant_axis = "EW"
            dom_current = ew_current_q
            dom_predicted = ew_predicted_q
            dom_delta = ew_delta

        # Robust Traffic Pressure Formula (Part A6)
        # Weighted combination: queue occupancy (40%) + approach density (35%) + arrival rate (15%) + signal bias (10%)
        ns_occ = min(1.0, ns_current_q / float(ns_capacity))
        ns_app = min(1.0, ns_approaching / float(ns_capacity))
        ns_raw_p = (0.40 * ns_occ + 0.35 * ns_app + 0.15 * min(1.0, ns_arrivals / 6.0) + (0.10 if not is_ns_green else 0.05)) * 100.0
        # If any vehicles present or approaching, guarantee sensible minimum floor (12-18%)
        if ns_current_q > 0 or ns_approaching > 0:
            ns_pressure = max(15, min(100, int(round(ns_raw_p))))
        else:
            ns_pressure = max(5, min(100, int(round(ns_raw_p))))

        ew_occ = min(1.0, ew_current_q / float(ew_capacity))
        ew_app = min(1.0, ew_approaching / float(ew_capacity))
        ew_raw_p = (0.40 * ew_occ + 0.35 * ew_app + 0.15 * min(1.0, ew_arrivals / 6.0) + (0.10 if not is_ew_green else 0.05)) * 100.0
        if ew_current_q > 0 or ew_approaching > 0:
            ew_pressure = max(15, min(100, int(round(ew_raw_p))))
        else:
            ew_pressure = max(5, min(100, int(round(ew_raw_p))))

        # Spillback risk
        max_pressure = max(ns_pressure, ew_pressure)
        if max_pressure > 80:
            spillback_risk = "CRITICAL"
            spillback_s = max(15, int(round((100 - max_pressure) * 2.5)))
        elif max_pressure > 60:
            spillback_risk = "HIGH"
            spillback_s = 45
        elif max_pressure > 35:
            spillback_risk = "MODERATE"
            spillback_s = 90
        else:
            spillback_risk = "LOW"
            spillback_s = 180

        delta_sign = "+" if dom_delta > 0 else ""
        pred_label = f"Pred: {dom_predicted} ({delta_sign}{dom_delta}/{horizon_s}s)"

        return {
            "junction_id": junction.id,
            "horizon_s": horizon_s,
            "current_queue": dom_current,
            "predicted_queue": dom_predicted,
            "queue_delta": dom_delta,
            "ns_current_queue": ns_current_q,
            "ew_current_queue": ew_current_q,
            "ns_projected_queue": ns_predicted_q,
            "ew_projected_queue": ew_predicted_q,
            "ns_delta": ns_delta,
            "ew_delta": ew_delta,
            "ns_pressure_pct": ns_pressure,
            "ew_pressure_pct": ew_pressure,
            "dominant_axis": dominant_axis,
            "predicted_queue_change": dom_delta,
            "prediction_label": pred_label,
            "spillback_risk": spillback_risk,
            "spillback_s": spillback_s,
        }

    def compute_traffic_pressure(self, junction: Junction, link_vehicles: Dict[str, List[Any]]) -> float:
        pred = self.predict_junction(junction, link_vehicles, horizon_s=45)
        return float(max(pred["ns_pressure_pct"], pred["ew_pressure_pct"]))

    def generate_ghost_vehicles(self, vehicles: List[Any], junctions: Dict[str, Junction], horizon_s: int = 20) -> List[Dict[str, Any]]:
        """Generates future ghost vehicle trajectories strictly bounded on links."""
        ghosts = []
        for v in vehicles[:24]:
            link = self.network.links.get(v.current_link_id)
            if not link or link.is_closed:
                continue

            crawl_speed = max(1.5, v.speed_mps * 0.5)
            projected_pos = min(max(0.0, link.length_m - 3.0), v.position_m + crawl_speed * horizon_s)

            frac = min(1.0, max(0.0, projected_pos / max(1.0, link.length_m)))
            from_pt = self.network.get_node_pos(link.from_node)
            to_pt = self.network.get_node_pos(link.to_node)
            if not from_pt or not to_pt:
                continue

            gx = from_pt[0] + (to_pt[0] - from_pt[0]) * frac
            gy = from_pt[1] + (to_pt[1] - from_pt[1]) * frac

            ghosts.append({
                "id": f"ghost_{v.id}",
                "original_id": v.id,
                "link": link.id,
                "world_x": round(gx, 1),
                "world_y": round(gy, 1),
                "projected_pos": round(projected_pos, 1),
                "is_congested": v.is_stopped or v.status in ("QUEUED", "ROUTE_BLOCKED"),
            })

        return ghosts
