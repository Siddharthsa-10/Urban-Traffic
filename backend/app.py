import asyncio
import json
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
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
        decisions, solve_data = self.ctrl_hybrid.solve_epoch(
            self.sim_hybrid.junctions,
            self.sim_hybrid.network,
            self.corridor.preempted_junctions,
            self.events.weather
        )
        self.latest_solve_data = solve_data
        for j_id, plan_id in decisions.items():
            self.sim_hybrid.junctions[j_id].apply_plan(plan_id)
            self.sim_hybrid.junctions[j_id].proposed_plan_id = plan_id

        self.sim_hybrid.solver_computation_time_ms = solve_data.get("total_solve_time_ms", 0.0)
        self.last_epoch_time = self.sim_hybrid.sim_time

    def step(self):
        if self.paused:
            return

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
            # Send latest simulation frame
            frame = coordinator.get_full_frame()
            await websocket.send_json(frame)

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
    while True:
        try:
            if not coordinator.paused:
                coordinator.step()
            delay = 0.1 / max(0.25, coordinator.speed_multiplier)
            await asyncio.sleep(delay)
        except Exception:
            await asyncio.sleep(0.1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(simulation_ticker())

# If frontend build exists, mount static files
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
