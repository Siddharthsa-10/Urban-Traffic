import json
from pathlib import Path
import sys

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.simulator import TrafficSimulator
from backend.controller_hybrid import HybridQuantumController
from backend.corridor import EmergencyCorridorManager
from backend.events import EventManager

def generate_prerecorded_demo(out_path: Path):
    print("Generating Demo-Safe pre-recorded playback data...")
    sim = TrafficSimulator(seed=2026)
    junctions_order = ["J1", "J2", "J3", "J4", "J5", "J6"]
    hybrid = HybridQuantumController(junctions_order=junctions_order, depth_p=1, shots=512)
    corridor = EmergencyCorridorManager(sim)
    events = EventManager(sim)

    frames = []
    solver_events = []

    # Run 90 simulation seconds
    # At t=20s: surge
    # At t=40s: dispatch ambulance
    # At t=65s: rain
    for step in range(90):
        t = sim.sim_time

        if step == 20:
            events.trigger_congestion("J1", multiplier=2.2, duration_s=30.0)
        elif step == 40:
            corridor.dispatch("J4", "J3")
        elif step == 65:
            events.set_weather("rain")

        if step % 30 == 0:
            decisions, solve_data = hybrid.solve_epoch(
                sim.junctions, sim.network, corridor.preempted_junctions, events.weather
            )
            solver_events.append({"sim_time": t, "data": solve_data})
            for j_id, p_id in decisions.items():
                sim.junctions[j_id].apply_plan(p_id)

        corridor.update()
        events.update()
        sim.step()

        # Capture frame
        frame = {
            "sim_time": round(sim.sim_time, 1),
            "junctions": {j_id: j.to_dict() for j_id, j in sim.junctions.items()},
            "vehicles": [v.to_dict() for v in sim.vehicles.values()],
            "metrics": sim.get_metrics(),
            "corridor": corridor.get_status(),
            "shift_log": list(events.shift_log[-12:]),
            "weather": events.weather,
            "fallback_level": hybrid.active_fallback_level,
            "is_quantum_killed": hybrid.is_quantum_killed
        }
        frames.append(frame)

    payload = {
        "title": "NADI Pre-Recorded Reference Run (Demo Safe)",
        "recorded_at": "2026-09-19T15:30:00Z",
        "duration_s": 90,
        "frames_count": len(frames),
        "frames": frames,
        "solver_events": solver_events
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    size_kb = out_path.stat().st_size / 1024
    print(f"Demo safe recording saved to {out_path} ({len(frames)} frames, {size_kb:.1f} KB)")

if __name__ == "__main__":
    dest = Path(__file__).resolve().parent.parent / "frontend" / "public" / "prerecorded_run.json"
    generate_prerecorded_demo(dest)
