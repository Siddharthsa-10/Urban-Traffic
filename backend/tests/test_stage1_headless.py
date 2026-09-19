import copy
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.simulator import TrafficSimulator
from backend.controller_fixed import FixedTimeController
from backend.controller_rule import RuleBasedController

def run_headless_comparison(seeds=[42, 101, 777, 1234, 2026], duration_s=150):
    print("=" * 80)
    print(" STAGE 1 HEADLESS SIMULATION: FIXED-TIME VS RULE-BASED CONTROLLERS")
    print(f" Seeds: {seeds} | Duration: {duration_s}s per run")
    print("=" * 80)

    fixed_metrics_all = []
    rule_metrics_all = []

    for s in seeds:
        # 1. Run Fixed-Time
        sim_fixed = TrafficSimulator(seed=s)
        ctrl_fixed = FixedTimeController(plan_id=0)

        for step in range(duration_s):
            if step % 30 == 0:
                decisions = ctrl_fixed.decide(sim_fixed.junctions, sim_fixed.sim_time)
                for j_id, plan_id in decisions.items():
                    sim_fixed.junctions[j_id].apply_plan(plan_id)
            sim_fixed.step()

        m_fixed = sim_fixed.get_metrics()
        fixed_metrics_all.append(m_fixed)

        # 2. Run Rule-Based with identical seed
        sim_rule = TrafficSimulator(seed=s)
        ctrl_rule = RuleBasedController(queue_threshold=10)

        for step in range(duration_s):
            if step % 30 == 0:
                decisions = ctrl_rule.decide(sim_rule.junctions, sim_rule.sim_time)
                for j_id, plan_id in decisions.items():
                    sim_rule.junctions[j_id].apply_plan(plan_id)
            sim_rule.step()

        m_rule = sim_rule.get_metrics()
        rule_metrics_all.append(m_rule)

        print(f"[Seed {s:>4}] Fixed: AvgWait={m_fixed['avg_wait_time_s']:>5.1f}s, MaxQ={m_fixed['max_queue']:>2}, Thru={m_fixed['throughput_veh_per_min']:>2}/min, Fuel={m_fixed['total_fuel_liters']:>5.2f}L | "
              f"Rule: AvgWait={m_rule['avg_wait_time_s']:>5.1f}s, MaxQ={m_rule['max_queue']:>2}, Thru={m_rule['throughput_veh_per_min']:>2}/min, Fuel={m_rule['total_fuel_liters']:>5.2f}L")

    print("\n" + "=" * 80)
    print(" 5-SEED AGGREGATED SUMMARY (MEAN +/- SPREAD)")
    print("=" * 80)
    header = f"{'Metric':<25} | {'Fixed-Time (Mean)':<18} | {'Rule-Based (Mean)':<18} | {'Delta':<12}"
    print(header)
    print("-" * len(header))

    def stats(data, key):
        vals = [d[key] for d in data]
        return sum(vals) / len(vals), min(vals), max(vals)

    keys = [
        ("Avg Waiting Time (s)", "avg_wait_time_s"),
        ("Max Queue (vehicles)", "max_queue"),
        ("Throughput (veh/min)", "throughput_veh_per_min"),
        ("Total Fuel (L)", "total_fuel_liters"),
        ("Total CO2 (kg)", "total_co2_kg"),
        ("Signal Changes", "total_signal_changes")
    ]

    for label, k in keys:
        mean_f, min_f, max_f = stats(fixed_metrics_all, k)
        mean_r, min_r, max_r = stats(rule_metrics_all, k)
        diff = mean_r - mean_f
        pct = (diff / max(1e-5, mean_f)) * 100
        sign = "+" if diff > 0 else ""
        print(f"{label:<25} | {mean_f:>8.2f} [{min_f:>5.1f}..{max_f:>5.1f}] | {mean_r:>8.2f} [{min_r:>5.1f}..{max_r:>5.1f}] | {sign}{diff:>5.2f} ({sign}{pct:>5.1f}%)")

    print("=" * 80)
    print("STAGE 1 VERIFICATION COMPLETED SUCCESSFULLY.")

if __name__ == "__main__":
    run_headless_comparison()
