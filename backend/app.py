import asyncio
import collections
import json
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .simulator import TrafficSimulator
from .controller_fixed import FixedTimeController
from .controller_rule import RuleBasedController
from .controller_hybrid import HybridQuantumController
from .corridor import EmergencyCorridorManager
from .events import EventManager
from .multi_seed_runner import run_multi_seed_benchmark

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT_DIR / "config"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

app = FastAPI(title="NADI Traffic Optimization API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- BACKEND PERFORMANCE TELEMETRY ----------------- #
class BackendTelemetry:
    def __init__(self):
        self.tick_times = collections.deque(maxlen=200)       # ms
        self.serialize_times = collections.deque(maxlen=200)  # ms
        self.solve_times = collections.deque(maxlen=50)       # ms
        self.delivered_timestamps = collections.deque(maxlen=500) # s
        self.buffer_queue_depth = 0

    def record_tick(self, ms: float):
        self.tick_times.append(ms)

    def record_serialize(self, ms: float):
        self.serialize_times.append(ms)

    def record_solve(self, ms: float):
        self.solve_times.append(ms)

    def record_delivery(self):
        self.delivered_timestamps.append(time.time())

    def get_summary(self, window_s: float = 5.0) -> Dict[str, Any]:
        now = time.time()
        recent_delivs = [t for t in self.delivered_timestamps if now - t <= window_s]
        actual_window = max(0.5, (now - min(recent_delivs)) if len(recent_delivs) > 1 else window_s)
        send_rate = len(recent_delivs) / actual_window if recent_delivs else 0.0

        def stats(dq):
            if not dq:
                return 0.0, 0.0
            arr = list(dq)
            avg = float(np.mean(arr))
            p95 = float(np.percentile(arr, 95))
            return round(avg, 2), round(p95, 2)

        tick_avg, tick_p95 = stats(self.tick_times)
        ser_avg, ser_p95 = stats(self.serialize_times)
        solve_avg, solve_p95 = stats(self.solve_times)

        return {
            "tick_ms_avg": tick_avg,
            "tick_ms_p95": tick_p95,
            "serialize_ms_avg": ser_avg,
            "serialize_ms_p95": ser_p95,
            "ws_send_rate": round(send_rate, 2),
            "solve_ms_avg": solve_avg,
            "solve_ms_p95": solve_p95,
            "queue_depth": self.buffer_queue_depth
        }

telemetry = BackendTelemetry()

# ----------------- SIMULATION STATE MANAGER ----------------- #
class SimulationCoordinator:
    def __init__(self, seed: int = 42):
        self.seed = seed
        self.paused = False
        self.speed_multiplier = 1.0  # 1x, 2x, 4x, 8x
        self.epoch_interval = 30.0    # 30 seconds

        # Three side-by-side simulator instances with identical seed for Split and Ghost views
        self.sim_hybrid = TrafficSimulator(seed=seed)
        self.sim_fixed = TrafficSimulator(seed=seed)
        self.sim_rule = TrafficSimulator(seed=seed)

        junctions_order = ["J1", "J2", "J3", "J4", "J5", "J6"]
        self.ctrl_hybrid = HybridQuantumController(junctions_order=junctions_order)
        self.ctrl_fixed = FixedTimeController(plan_id=0)
        self.ctrl_rule = RuleBasedController()

        self.corridor = EmergencyCorridorManager(self.sim_hybrid)
        self.events = EventManager(self.sim_hybrid)

        self.last_epoch_time = -30.0
        self.latest_solve_data: Optional[Dict[str, Any]] = None

        # Solve immediately at t=0
        self.trigger_solve()

    def trigger_solve(self):
        t0 = time.perf_counter()
        decisions, solve_data = self.ctrl_hybrid.solve_epoch(
            self.sim_hybrid.junctions,
            self.sim_hybrid.network,
            self.corridor.preempted_junctions,
            self.events.weather
        )
        t_solve = (time.perf_counter() - t0) * 1000.0
        telemetry.record_solve(t_solve)

        self.latest_solve_data = solve_data
        for j_id, plan_id in decisions.items():
            self.sim_hybrid.junctions[j_id].apply_plan(plan_id)
            self.sim_hybrid.junctions[j_id].proposed_plan_id = plan_id

        self.sim_hybrid.solver_computation_time_ms = solve_data.get("total_solve_time_ms", 0.0)
        self.last_epoch_time = self.sim_hybrid.sim_time

    def step(self):
        if self.paused:
            return

        t0 = time.perf_counter()

        # Check 30s decision epoch for hybrid controller
        if self.sim_hybrid.sim_time - self.last_epoch_time >= self.epoch_interval:
            self.trigger_solve()

        # Update Fixed and Rule controllers on same cycle
        if int(self.sim_fixed.sim_time) % 30 == 0:
            dec_f = self.ctrl_fixed.decide(self.sim_fixed.junctions, self.sim_fixed.sim_time)
            for j_id, p_id in dec_f.items():
                self.sim_fixed.junctions[j_id].apply_plan(p_id)

            dec_r = self.ctrl_rule.decide(self.sim_rule.junctions, self.sim_rule.sim_time)
            for j_id, p_id in dec_r.items():
                self.sim_rule.junctions[j_id].apply_plan(p_id)

        self.corridor.update()
        self.events.update()

        # Step all 3 simulators
        self.sim_hybrid.step()
        self.sim_fixed.step()
        self.sim_rule.step()

        t_tick = (time.perf_counter() - t0) * 1000.0
        telemetry.record_tick(t_tick)

    def get_full_frame(self) -> Dict[str, Any]:
        # Generate ghost queues from fixed-time simulator for Ghost View
        ghost_queues = {
            j_id: dict(j.queues) for j_id, j in self.sim_fixed.junctions.items()
        }

        return {
            "sim_time": round(self.sim_hybrid.sim_time, 1),
            "paused": self.paused,
            "speed_multiplier": self.speed_multiplier,
            "weather": self.events.weather,
            "fallback_level": self.ctrl_hybrid.active_fallback_level,
            "is_quantum_killed": self.ctrl_hybrid.is_quantum_killed,
            "corridor": self.corridor.get_status(),
            "shift_log": list(self.events.shift_log[-12:]),
            "closed_roads": list(list(edge) for edge in self.sim_hybrid.network.closed_edges),
            "accidents": list(list(edge) for edge in self.sim_hybrid.network.accident_edges.keys()),
            # Primary Hybrid view
            "junctions": {j_id: j.to_dict() for j_id, j in self.sim_hybrid.junctions.items()},
            "vehicles": [v.to_dict() for v in self.sim_hybrid.vehicles.values()],
            "metrics": {
                "hybrid": self.sim_hybrid.get_metrics(),
                "fixed": self.sim_fixed.get_metrics(),
                "rule": self.sim_rule.get_metrics()
            },
            # Ghost cues
            "ghost_queues": ghost_queues,
            # Latest quantum solve payload
            "latest_solve": self.latest_solve_data
        }

coordinator = SimulationCoordinator(seed=42)

# ----------------- REST API ENDPOINTS ----------------- #
@app.get("/api/config")
async def get_config():
    with open(CONFIG_DIR / "district.json", "r", encoding="utf-8") as f:
        district = json.load(f)
    with open(CONFIG_DIR / "vehicles.json", "r", encoding="utf-8") as f:
        vehicles = json.load(f)
    with open(CONFIG_DIR / "weights.json", "r", encoding="utf-8") as f:
        weights = json.load(f)
    with open(CONFIG_DIR / "signal_plans.json", "r", encoding="utf-8") as f:
        plans = json.load(f)
    return {
        "district": district,
        "vehicles": vehicles,
        "weights": weights,
        "signal_plans": plans
    }

class SurgeRequest(BaseModel):
    node: str = "J1"
    multiplier: float = 2.5
    duration_s: float = 45.0

@app.post("/api/action/surge")
async def action_surge(req: SurgeRequest):
    coordinator.events.trigger_congestion(req.node, req.multiplier, req.duration_s)
    return {"status": "ok", "message": f"Surge applied at {req.node}"}

class AccidentRequest(BaseModel):
    u: str = "J2"
    v: str = "J3"

@app.post("/api/action/accident")
async def action_accident(req: AccidentRequest):
    key = (req.u, req.v)
    if key in coordinator.sim_hybrid.network.accident_edges:
        coordinator.events.clear_accident(req.u, req.v)
        return {"status": "ok", "active": False}
    else:
        coordinator.events.trigger_accident(req.u, req.v)
        return {"status": "ok", "active": True}

class ClosureRequest(BaseModel):
    u: str = "J4"
    v: str = "J5"

@app.post("/api/action/closure")
async def action_closure(req: ClosureRequest):
    key = (req.u, req.v)
    if key in coordinator.sim_hybrid.network.closed_edges:
        coordinator.events.reopen_road(req.u, req.v)
        return {"status": "ok", "closed": False}
    else:
        coordinator.events.trigger_road_closure(req.u, req.v)
        return {"status": "ok", "closed": True}

class AmbulanceRequest(BaseModel):
    origin: str = "J4"
    destination: str = "J3"

@app.post("/api/action/ambulance")
async def action_ambulance(req: AmbulanceRequest):
    ok = coordinator.corridor.dispatch(req.origin, req.destination)
    if ok:
        coordinator.events.log_event("corridor", f"Ambulance dispatched: {req.origin} -> {req.destination}")
    return {"status": "ok" if ok else "error", "corridor": coordinator.corridor.get_status()}

class WeatherRequest(BaseModel):
    mode: str = "rain"

@app.post("/api/action/weather")
async def action_weather(req: WeatherRequest):
    coordinator.events.set_weather(req.mode)
    return {"status": "ok", "weather": req.mode}

class PedestrianRequest(BaseModel):
    junction_id: str = "J2"
    arm: str = "N"

@app.post("/api/action/pedestrian")
async def action_pedestrian(req: PedestrianRequest):
    j = coordinator.sim_hybrid.junctions.get(req.junction_id)
    if j:
        j.request_pedestrian(req.arm)
        coordinator.events.log_event("pedestrian", f"{req.junction_id} arm {req.arm} crosswalk button pressed.")
        return {"status": "ok"}
    return {"status": "not_found"}

class KillQuantumRequest(BaseModel):
    killed: bool

@app.post("/api/action/kill_quantum")
async def action_kill_quantum(req: KillQuantumRequest):
    coordinator.ctrl_hybrid.set_quantum_killed(req.killed)
    coordinator.events.log_event(
        "drill",
        "KILL QUANTUM DRILL: Quantum service severed. Fallback chain engaged." if req.killed
        else "Quantum service restored to normal operation."
    )
    return {"status": "ok", "is_quantum_killed": req.killed, "level": coordinator.ctrl_hybrid.active_fallback_level}

@app.post("/api/action/solve_now")
async def action_solve_now():
    coordinator.trigger_solve()
    return {"status": "ok", "solve_data": coordinator.latest_solve_data}

class TimeControlRequest(BaseModel):
    action: str  # "pause", "resume", "toggle", "step", "speed"
    speed: Optional[float] = 1.0

@app.post("/api/action/time_control")
async def action_time_control(req: TimeControlRequest):
    if req.action == "pause":
        coordinator.paused = True
    elif req.action == "resume":
        coordinator.paused = False
    elif req.action == "toggle":
        coordinator.paused = not coordinator.paused
    elif req.action == "step":
        coordinator.paused = True
        coordinator.step()
    elif req.action == "speed" and req.speed:
        coordinator.speed_multiplier = req.speed
    return {"status": "ok", "paused": coordinator.paused, "speed": coordinator.speed_multiplier}

@app.get("/api/telemetry/backend")
async def get_backend_telemetry():
    """Returns sliding window backend performance statistics."""
    return telemetry.get_summary(window_s=5.0)

@app.get("/api/benchmark/10seeds")
async def get_benchmark():
    """Run 10 seeds and return mean + spread comparison."""
    return run_multi_seed_benchmark(num_seeds=10, sim_duration_s=75)

# ----------------- WEBSOCKET STREAM (10 HZ) ----------------- #
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. Very top of websocket_endpoint: MUST be the first await
    try:
        await websocket.accept()
    except Exception as e:
        print(f"[WS] Failed to accept websocket connection: {e}")
        return

    # 2. Enter streaming loop
    try:
        while True:
            # Send latest simulation frame with serialization measurement
            t0 = time.perf_counter()
            frame = coordinator.get_full_frame()
            payload = json.dumps(frame)
            t_ser = (time.perf_counter() - t0) * 1000.0
            telemetry.record_serialize(t_ser)

            await websocket.send_text(payload)
            telemetry.record_delivery()

            # Non-blocking read of any client messages
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.001)
                cmd = json.loads(msg)
                if cmd.get("type") == "solve_now":
                    coordinator.trigger_solve()
            except asyncio.TimeoutError:
                pass
            except (json.JSONDecodeError, Exception):
                pass

            # 100ms cadence adjusted by speed multiplier
            delay = 0.1 / max(0.25, coordinator.speed_multiplier)
            await asyncio.sleep(delay)
    except (WebSocketDisconnect, asyncio.CancelledError):
        # 3. Clean disconnect logging, no 500 traceback
        pass
    except Exception as e:
        print(f"[WS] Client disconnected or stream closed: {e}")

# Background simulation ticker solely advances physics
async def simulation_ticker():
    last_log_time = time.time()
    while True:
        try:
            if not coordinator.paused:
                coordinator.step()
            
            # Periodic telemetry log every 5s
            if time.time() - last_log_time >= 5.0:
                last_log_time = time.time()
                stats = telemetry.get_summary(window_s=5.0)
                print(f"[TELEMETRY-5s] Tick: {stats['tick_ms_avg']:.2f}ms (p95: {stats['tick_ms_p95']:.2f}ms) | Ser: {stats['serialize_ms_avg']:.2f}ms | SendRate: {stats['ws_send_rate']:.1f} fps | Solve: {stats['solve_ms_avg']:.2f}ms")

            delay = 0.1 / max(0.25, coordinator.speed_multiplier)
            await asyncio.sleep(delay)
        except Exception as e:
            print(f"[Ticker Error] {e}")
            await asyncio.sleep(0.1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(simulation_ticker())

# If frontend build exists, mount static files
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
