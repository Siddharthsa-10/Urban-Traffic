import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.simulator import TrafficSimulator
from backend.controller_hybrid import HybridQuantumController
from backend.corridor import EmergencyCorridorManager
from backend.events import EventManager

def test_stage3_hybrid_closed_loop():
    print("=" * 80)
    print(" STAGE 3 VERIFICATION: HYBRID QUANTUM CONTROLLER, SAFETY & EMERGENCY CORRIDOR")
    print("=" * 80)

    sim = TrafficSimulator(seed=42)
    junctions_order = ["J1", "J2", "J3", "J4", "J5", "J6"]
    hybrid = HybridQuantumController(junctions_order=junctions_order, depth_p=1, shots=512)
    corridor = EmergencyCorridorManager(sim)
    events = EventManager(sim)

    # 1. Run simulation for 60 seconds (two 30s epochs)
    for step in range(60):
        if step % 30 == 0:
            decisions, solve_data = hybrid.solve_epoch(
                sim.junctions, sim.network, corridor.preempted_junctions, events.weather
            )
            print(f"[Epoch {solve_data['epoch']}] Method: {solve_data['used_method']} | "
                  f"Fallback: {solve_data['fallback_level']} | "
                  f"QAOA Cost: {solve_data['qaoa']['best_cost']} vs BF Opt: {solve_data['brute_force']['best_cost']} | "
                  f"Time: {solve_data['total_solve_time_ms']}ms")
            for j_id, p_id in decisions.items():
                sim.junctions[j_id].apply_plan(p_id)

        corridor.update()
        events.update()
        sim.step()

    # 2. Test Emergency Corridor Dispatch
    print("\n--- Dispatching Ambulance from J4 to J3 ---")
    dispatched = corridor.dispatch(origin="J4", destination="J3")
    assert dispatched, "Ambulance failed to dispatch"
    print(f"Ambulance ID: {corridor.ambulance_id} | Planned Route: {' -> '.join(corridor.route)}")
    print(f"Initial ETAs: {corridor.etas}")

    # Advance 20 seconds and check wave preemption
    for _ in range(20):
        corridor.update()
        sim.step()

    print(f"Preempted Junctions: {corridor.preempted_junctions}")
    assert len(corridor.preempted_junctions) > 0 or not corridor.active, "Expected preemption along route"

    # 3. Test Road Closure and Rerouting
    print("\n--- Testing Road Closure on J1-J2 ---")
    events.trigger_road_closure("J1", "J2")
    assert ("J1", "J2") in sim.network.closed_edges
    print(f"Shift log entry: {events.shift_log[-1]['message']}")

    # 4. Test Kill Quantum Drill
    print("\n--- Testing Kill Quantum Drill ---")
    hybrid.set_quantum_killed(True)
    decisions, solve_data = hybrid.solve_epoch(
        sim.junctions, sim.network, corridor.preempted_junctions, events.weather
    )
    print(f"After kill switch: Used Method = {solve_data['used_method']} | Fallback Level = {solve_data['fallback_level']}")
    assert solve_data["used_method"] == "Classical Exact", "Expected fallback to classical solver"

    print("\n" + "=" * 80)
    print("STAGE 3 HYBRID CLOSED-LOOP AND CORRIDOR VERIFIED SUCCESSFULLY!")
    print("=" * 80)

if __name__ == "__main__":
    test_stage3_hybrid_closed_loop()
