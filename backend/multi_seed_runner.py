import json
from typing import Dict, List, Any
from .simulator import TrafficSimulator
from .controller_fixed import FixedTimeController
from .controller_rule import RuleBasedController
from .controller_hybrid import HybridQuantumController

def run_multi_seed_benchmark(num_seeds: int = 10, sim_duration_s: int = 90) -> Dict[str, Any]:
    """Runs parallel or sequential benchmark across 10 distinct seeds for all 3 controllers."""
    seeds = [42, 101, 233, 404, 512, 777, 999, 1234, 1888, 2026][:num_seeds]
    results = {
        "seeds": seeds,
        "duration_s": sim_duration_s,
        "runs": [],
        "summary": {}
    }

    junctions_order = ["J1", "J2", "J3", "J4", "J5", "J6"]

    fixed_all, rule_all, hybrid_all = [], [], []

    for s in seeds:
        # 1. Fixed-time run
        sim_f = TrafficSimulator(seed=s)
        ctrl_f = FixedTimeController(0)
        for t in range(sim_duration_s):
            if t % 30 == 0:
                dec = ctrl_f.decide(sim_f.junctions, sim_f.sim_time)
                for j_id, p_id in dec.items():
                    sim_f.junctions[j_id].apply_plan(p_id)
            sim_f.step()
        mf = sim_f.get_metrics()
        fixed_all.append(mf)

        # 2. Rule-based run
        sim_r = TrafficSimulator(seed=s)
        ctrl_r = RuleBasedController()
        for t in range(sim_duration_s):
            if t % 30 == 0:
                dec = ctrl_r.decide(sim_r.junctions, sim_r.sim_time)
                for j_id, p_id in dec.items():
                    sim_r.junctions[j_id].apply_plan(p_id)
            sim_r.step()
        mr = sim_r.get_metrics()
        rule_all.append(mr)

        # 3. Hybrid controller run
        sim_h = TrafficSimulator(seed=s)
        ctrl_h = HybridQuantumController(junctions_order=junctions_order, depth_p=1, shots=512)
        for t in range(sim_duration_s):
            if t % 30 == 0:
                dec, _ = ctrl_h.solve_epoch(sim_h.junctions, sim_h.network)
                for j_id, p_id in dec.items():
                    sim_h.junctions[j_id].apply_plan(p_id)
            sim_h.step()
        mh = sim_h.get_metrics()
        hybrid_all.append(mh)

        results["runs"].append({
            "seed": s,
            "fixed": mf,
            "rule": mr,
            "hybrid": mh
        })

    def calc_stats(metric_list, key):
        vals = [m[key] for m in metric_list]
        return {
            "mean": round(sum(vals) / len(vals), 2),
            "min": round(min(vals), 2),
            "max": round(max(vals), 2)
        }

    keys = ["avg_wait_time_s", "max_queue", "throughput_veh_per_min", "total_fuel_liters", "total_co2_kg"]
    summary = {}
    for k in keys:
        summary[k] = {
            "fixed": calc_stats(fixed_all, k),
            "rule": calc_stats(rule_all, k),
            "hybrid": calc_stats(hybrid_all, k)
        }
    results["summary"] = summary
    return results
