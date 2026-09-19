import asyncio
import json
import time
import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, r"d:\Traffic Optimization")

from backend.simulator import TrafficSimulator, DemandSchedule
from backend.controllers.fixed_time import FixedTimeController
from backend.controllers.hybrid_quantum import HybridQuantumController
from backend.main import DistrictSimulationManager, app
from backend.db.database import db_service
import uvicorn
import httpx
import websockets

def test_unit_simulator_continuity():
    print("\n--- TEST 1: Simulator Level Continuity (1500 ticks) ---")
    sim_mgr = DistrictSimulationManager(seed=42)
    # The default precomputation was 1200 ticks. We run up to 1500 ticks to verify continuous generation beyond 1200 ticks.
    start_t = time.time()
    for tick in range(1500):
        sim_mgr.step()
        if tick % 300 == 0 or tick == 1499:
            m_h = sim_mgr.sim_hybrid.get_summary_metrics()
            active = len(sim_mgr.sim_hybrid.vehicles)
            spawned = sim_mgr.sim_hybrid.total_spawned
            throughput = sim_mgr.sim_hybrid.completed_count
            hist_len = len(sim_mgr.sim_hybrid.metrics_history)
            trip_len = len(sim_mgr.sim_hybrid.trip_history)
            comp_len = len(sim_mgr.sim_hybrid.completed_vehicles)
            print(f"Tick {tick:4d} | SimTime: {sim_mgr.sim_hybrid.sim_time:6.1f}s | Active: {active:2d} | Spawned: {spawned:3d} | Throughput: {throughput:3d} | Hist: {hist_len} | Trips: {trip_len} | CompBounded: {comp_len}")
            if tick >= 5:
                assert active >= 8, f"Active vehicles starved! {active} < 8"
            assert comp_len <= 300, f"Completed vehicles not bounded! {comp_len} > 300"
            assert hist_len <= 3600, f"Metrics history unbounded! {hist_len}"
    
    elapsed = time.time() - start_t
    print(f"1500 ticks completed in {elapsed:.2f}s ({1500/elapsed:.1f} ticks/s)")
    print("[OK] Simulator continuous generation & memory bounding PASSED.")


async def test_live_server_continuity():
    print("\n--- TEST 2: Live Server Continuous Twin & Decoupled WebSocket ---")
    PORT = 8055
    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())

    # Wait for server to start
    await asyncio.sleep(1.5)

    base_url = f"http://127.0.0.1:{PORT}"
    ws_url = f"ws://127.0.0.1:{PORT}/ws"

    async with httpx.AsyncClient(base_url=base_url) as client:
        # 1. Telemetry before any client connects
        r1 = await client.get("/api/simulation/telemetry")
        assert r1.status_code == 200
        t1 = r1.json()
        print(f"Initial Telemetry: SimTime = {t1['simulation_time_s']}s, Active = {t1['active_vehicles']}, Status = {t1['simulation']}")
        assert t1["simulation"] == "RUNNING"
        assert t1["active_vehicles"] >= 8

        # 2. Wait 2 seconds WITHOUT websocket, check that sim_time advanced in background
        await asyncio.sleep(2.0)
        r2 = await client.get("/api/simulation/telemetry")
        t2 = r2.json()
        print(f"Telemetry after 2s without WS: SimTime = {t2['simulation_time_s']}s, Active = {t2['active_vehicles']}")
        assert t2["simulation_time_s"] > t1["simulation_time_s"], "Simulation did NOT advance without WebSocket client!"
        print("[OK] Authoritative background loop runs independently of WebSocket connection.")

        # 3. Connect WebSocket and stream frames
        print("Connecting WebSocket client...")
        async with websockets.connect(ws_url) as ws:
            frames_received = 0
            start_ws = time.time()
            while frames_received < 15 and (time.time() - start_ws) < 5.0:
                msg = await ws.recv()
                frame = json.loads(msg)
                frames_received += 1
                assert "junctions" in frame
                assert "vehicles_hybrid" in frame
                assert len(frame["vehicles_hybrid"]) >= 8
            print(f"[OK] Received {frames_received} frames over WebSocket. Vehicles: {len(frame['vehicles_hybrid'])}")

        # 4. Disconnect WebSocket, wait 2 seconds, reconnect
        print("Disconnected WebSocket. Waiting 2 seconds...")
        await asyncio.sleep(2.0)
        async with websockets.connect(ws_url) as ws:
            msg = await ws.recv()
            frame = json.loads(msg)
            print(f"[OK] Reconnected to WebSocket! Current SimTime: {frame['sim_time']}s, Vehicles: {len(frame['vehicles_hybrid'])}")
            assert frame["sim_time"] > t2["simulation_time_s"] + 1.0

        # 5. Test Weather Event
        print("Testing Weather Event (HEAVY_RAIN)...")
        rw = await client.post("/api/events/weather", json={"weather": "HEAVY_RAIN"})
        assert rw.status_code == 200
        await asyncio.sleep(0.5)
        rt_w = await client.get("/api/simulation/telemetry")
        assert rt_w.json()["weather"] == "HEAVY_RAIN"
        print("[OK] Weather changed to HEAVY_RAIN.")

        # 6. Test Road Closure Event
        print("Testing Road Closure (L_J3_J4)...")
        rc = await client.post("/api/events/closure", json={"link_id": "L_J3_J4", "closed": True})
        assert rc.status_code == 200
        await asyncio.sleep(0.5)
        rt_c = await client.get("/api/simulation/telemetry")
        assert rt_c.json()["closed_roads"] >= 1
        print(f"[OK] Road closure active. Closed roads: {rt_c.json()['closed_roads']}, Reroutes: {rt_c.json()['rerouted_vehicles']}")

        # 7. Test Ambulance Dispatch
        print("Testing Ambulance Dispatch (HOSP -> SITE)...")
        rd = await client.post("/api/corridor/dispatch", json={"origin": "HOSP", "dest": "SITE"})
        assert rd.status_code == 200
        disp_res = rd.json()
        print(f"[OK] Ambulance dispatched! Active: {disp_res.get('active')}, Route: {disp_res.get('route')}")

        # 8. Test Pause / Resume / Step
        print("Testing Pause...")
        await client.post("/api/controls/time", json={"paused": True})
        await asyncio.sleep(0.5)
        rt_p1 = await client.get("/api/simulation/telemetry")
        sim_t_paused = rt_p1.json()["simulation_time_s"]
        await asyncio.sleep(1.0)
        rt_p2 = await client.get("/api/simulation/telemetry")
        assert rt_p2.json()["simulation_time_s"] == sim_t_paused, "Simulation advanced while paused!"
        print(f"[OK] Simulation paused successfully at {sim_t_paused}s.")

        print("Testing Step 1s...")
        await client.post("/api/controls/time", json={"step_1s": True})
        rt_s = await client.get("/api/simulation/telemetry")
        assert rt_s.json()["simulation_time_s"] > sim_t_paused
        print(f"[OK] Simulation stepped 1s to {rt_s.json()['simulation_time_s']}s.")

        print("Testing Resume...")
        await client.post("/api/controls/time", json={"paused": False, "speed": 2.0})
        await asyncio.sleep(1.0)
        rt_res = await client.get("/api/simulation/telemetry")
        assert rt_res.json()["simulation_time_s"] > rt_s.json()["simulation_time_s"]
        print(f"[OK] Simulation resumed at 2x speed: {rt_res.json()['simulation_time_s']}s.")

    # 9. Server clean shutdown
    print("Initiating clean server shutdown...")
    server.should_exit = True
    await server_task
    print("[OK] Server shutdown cleanly.")


def main():
    test_unit_simulator_continuity()
    asyncio.run(test_live_server_continuity())
    print("\n=======================================================")
    print("ALL CONTINUOUS TRAFFIC DIGITAL TWIN TESTS PASSED!")
    print("=======================================================\n")

if __name__ == "__main__":
    main()
