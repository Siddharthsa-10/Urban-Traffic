import json
from pathlib import Path
from typing import Dict, Any, Optional
from ..vehicles import Vehicle


class EnvironmentalModel:
    def __init__(self, config_path: Optional[str] = None):
        if config_path is None:
            config_path = str(Path(__file__).resolve().parent.parent.parent / "config" / "environmental_config.json")
        with open(config_path, "r", encoding="utf-8") as f:
            self.raw_data = json.load(f)

        self.assumptions: Dict[str, Dict[str, Any]] = self.raw_data.get("assumptions", {})
        self.notice: str = self.raw_data.get("_meta", {}).get("notice", "")
        self.formula: str = self.raw_data.get("_meta", {}).get("formula", "")

    def calculate_vehicle_consumption(self, vehicle: Vehicle) -> Dict[str, float]:
        """
        Calculates fuel in Liters and CO2 in kg for a vehicle:
        Fuel (L) = (idle_rate_lps * idle_s) + (stops * stop_penalty_l) + (cruise_l_per_km * distance_km)
        CO2 (kg) = Fuel (L) * emission_factor_kg_per_l
        """
        v_type = vehicle.type
        params = self.assumptions.get(v_type, self.assumptions.get("car", {}))

        idle_rate = params.get("idle_rate_lps", 0.00038)
        stop_penalty = params.get("stop_penalty_l", 0.0085)
        cruise_rate = params.get("cruise_l_per_km", 0.068)
        emission_factor = params.get("emission_factor_kg_per_l", 2.31)

        idle_time_s = vehicle.waiting_time_s
        stops = vehicle.stops_count
        dist_km = vehicle.distance_traveled_m / 1000.0

        fuel_idle = idle_rate * idle_time_s
        fuel_stops = stops * stop_penalty
        fuel_cruise = cruise_rate * dist_km
        total_fuel_l = fuel_idle + fuel_stops + fuel_cruise

        total_co2_kg = total_fuel_l * emission_factor

        return {
            "fuel_liters": total_fuel_l,
            "co2_kg": total_co2_kg,
            "fuel_idle_liters": fuel_idle,
            "fuel_stops_liters": fuel_stops,
            "fuel_cruise_liters": fuel_cruise,
        }

    def get_assumptions_metadata(self) -> Dict[str, Any]:
        return {
            "notice": self.notice,
            "formula": self.formula,
            "assumptions": self.assumptions,
        }
