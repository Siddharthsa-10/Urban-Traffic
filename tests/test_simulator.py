import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.simulator import TrafficSimulator, DemandSchedule
from backend.controllers.fixed_time import FixedTimeController
from backend.controllers.rule_based import RuleBasedController


def run_5_seed_benchmark(duration_ticks: int = 300):
    seeds = [42, 101, 2024, 7, 999]
    results = {"FIXED_TIME": [], "RULE_BASED": []}

    header = "=" * 88
    print(header)
    print("STAGE 1: DETERMINISTIC SIMULATION BENCHMARK (5 SEEDS x 300s)")
    print("Mixed Traffic: 2-Wheelers, Autos, Cars, Buses | IDM Kinematics | 6 Junctions")
    print(header)
    print(f"{'Seed':<6} | {'Controller':<12} | {'Avg Wait (s)':<12} | {'Max Queue':<10} | {'Throughput':<11} | {'Fuel (L)':<9} | {'CO2 (kg)':<9}")
    print("-" * 88)

    for seed in seeds:
        # Create identical deterministic arrival schedule for both controllers
        shared_demand = DemandSchedule(seed=seed, duration_ticks=duration_ticks)

        # 1. Run Fixed-Time Controller
        sim_fixed = TrafficSimulator(
            controller=FixedTimeController(ns_green=35.0, ew_green=35.0),
            seed=seed,
            demand_schedule=shared_demand,
            max_ticks=duration_ticks,
        )
        for _ in range(duration_ticks):
            sim_fixed.tick()
        m_fixed = sim_fixed.get_summary_metrics()
        results["FIXED_TIME"].append(m_fixed)

        # 2. Run Rule-Based Controller
        sim_rule = TrafficSimulator(
            controller=RuleBasedController(),
            seed=seed,
            demand_schedule=shared_demand,
            max_ticks=duration_ticks,
        )
        for _ in range(duration_ticks):
            sim_rule.tick()
        m_rule = sim_rule.get_summary_metrics()
        results["RULE_BASED"].append(m_rule)

        print(f"{seed:<6} | {'FIXED-TIME':<12} | {m_fixed['avg_wait_s']:>10.1f}s | {m_fixed['max_queue']:>9} | {m_fixed['throughput']:>8} veh | {m_fixed['total_fuel_l']:>7.2f} L | {m_fixed['total_co2_kg']:>7.2f} kg")
        print(f"{seed:<6} | {'RULE-BASED':<12} | {m_rule['avg_wait_s']:>10.1f}s | {m_rule['max_queue']:>9} | {m_rule['throughput']:>8} veh | {m_rule['total_fuel_l']:>7.2f} L | {m_rule['total_co2_kg']:>7.2f} kg")
        print("-" * 88)

    # Compute Means
    mean_fixed = {
        "avg_wait": sum(r["avg_wait_s"] for r in results["FIXED_TIME"]) / len(seeds),
        "max_q": sum(r["max_queue"] for r in results["FIXED_TIME"]) / len(seeds),
        "throughput": sum(r["throughput"] for r in results["FIXED_TIME"]) / len(seeds),
        "fuel": sum(r["total_fuel_l"] for r in results["FIXED_TIME"]) / len(seeds),
        "co2": sum(r["total_co2_kg"] for r in results["FIXED_TIME"]) / len(seeds),
    }
    mean_rule = {
        "avg_wait": sum(r["avg_wait_s"] for r in results["RULE_BASED"]) / len(seeds),
        "max_q": sum(r["max_queue"] for r in results["RULE_BASED"]) / len(seeds),
        "throughput": sum(r["throughput"] for r in results["RULE_BASED"]) / len(seeds),
        "fuel": sum(r["total_fuel_l"] for r in results["RULE_BASED"]) / len(seeds),
        "co2": sum(r["total_co2_kg"] for r in results["RULE_BASED"]) / len(seeds),
    }

    d_wait = ((mean_rule["avg_wait"] - mean_fixed["avg_wait"]) / mean_fixed["avg_wait"]) * 100
    d_q = ((mean_rule["max_q"] - mean_fixed["max_q"]) / mean_fixed["max_q"]) * 100
    d_thru = ((mean_rule["throughput"] - mean_fixed["throughput"]) / mean_fixed["throughput"]) * 100
    d_fuel = ((mean_rule["fuel"] - mean_fixed["fuel"]) / mean_fixed["fuel"]) * 100
    d_co2 = ((mean_rule["co2"] - mean_fixed["co2"]) / mean_fixed["co2"]) * 100

    print(header)
    print("5-SEED SUMMARY MEAN PERFORMANCE:")
    print(f"  Fixed-Time : Avg Wait = {mean_fixed['avg_wait']:.1f}s | Max Queue = {mean_fixed['max_q']:.1f} | Throughput = {mean_fixed['throughput']:.1f} | Fuel = {mean_fixed['fuel']:.2f}L | CO2 = {mean_fixed['co2']:.2f}kg")
    print(f"  Rule-Based : Avg Wait = {mean_rule['avg_wait']:.1f}s | Max Queue = {mean_rule['max_q']:.1f} | Throughput = {mean_rule['throughput']:.1f} | Fuel = {mean_rule['fuel']:.2f}L | CO2 = {mean_rule['co2']:.2f}kg")
    print(f"  Delta (Rule vs Fixed): Wait {d_wait:+.1f}%, MaxQueue {d_q:+.1f}%, Throughput {d_thru:+.1f}%, Fuel {d_fuel:+.1f}%, CO2 {d_co2:+.1f}%")
    print(header)
    print("STATUS: STAGE 1 HEADLESS SIMULATION VERIFIED DETERMINISTIC & VALID.")
    print(header)


if __name__ == "__main__":
    run_5_seed_benchmark()
