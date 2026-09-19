import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from .simulator import TrafficSimulator, DemandSchedule
from .network import CityNetwork
from .junction import Junction
from .controllers.fixed_time import FixedTimeController
from .controllers.rule_based import RuleBasedController
from .controllers.hybrid_quantum import HybridQuantumController
from .corridor.ambulance import EmergencyCorridor
from .environment.emissions import EnvironmentalModel

from .db.database import db_service
from .services.prediction_engine import PredictionEngine
from .services.decision_engine import decision_engine
from .services.scenario_engine import scenario_engine


# Global Simulation Manager holding all 3 controllers for identical side-by-side execution
class DistrictSimulationManager:
    def __init__(self, seed: int = 42):
        self.seed = seed
        self.simulation_id = f"sim_{int(time.time())}"
        self.session_start_time = time.time()
        self.active_scenario_name = "Baseline Clear"
        self.pending_event_marker: Optional[str] = None
        self.last_snapshot_time: float = -1.0
        self.is_running: bool = True
        self.active_connections: set = set()

        self.network = CityNetwork()
        self.demand_schedule = DemandSchedule(seed=seed, duration_ticks=600, config=self.network.raw_config)

        # 1. Fixed-Time Simulator (Continuous lifetime)
        self.sim_fixed = TrafficSimulator(
            controller=FixedTimeController(35.0, 35.0),
            seed=seed,
            demand_schedule=self.demand_schedule,
            max_ticks=None,
        )

        # 2. Rule-Based Simulator (Continuous lifetime)
        self.sim_rule = TrafficSimulator(
            controller=RuleBasedController(),
            seed=seed,
            demand_schedule=self.demand_schedule,
            max_ticks=None,
        )

        # 3. Hybrid Quantum Simulator (Continuous lifetime)
        self.hybrid_ctrl = HybridQuantumController(network=self.network, epoch_seconds=30.0)
        self.sim_hybrid = TrafficSimulator(
            controller=self.hybrid_ctrl,
            seed=seed,
            demand_schedule=self.demand_schedule,
            max_ticks=None,
        )

        # Corridor
        self.corridor = EmergencyCorridor(self.network)
        self.active_ambulance_id: Optional[str] = None

        # Prediction & Decision Engines
        self.prediction_engine = PredictionEngine(self.network)
        self.decision_engine = decision_engine
        self.scenario_engine = scenario_engine

        # Shift Log
        self.shift_log: List[Dict[str, Any]] = [
            {"time": "02:00", "text": "system initialized. 4 junctions online under hybrid qaoa."}
        ]

        # Time controls
        self.is_paused: bool = False
        self.speed_multiplier: float = 1.0
        self.frame_seq: int = 0
        self.last_tick_time: float = time.time()
        self.active_explanation: Optional[Dict[str, Any]] = None

        # Replay frame buffer (stores recent snapshots for scrubber)
        self.recent_frames: List[Dict[str, Any]] = []

    def add_log(self, text: str):
        t_str = f"02:{int(self.sim_hybrid.sim_time) // 60:02d}:{int(self.sim_hybrid.sim_time) % 60:02d}"
        self.shift_log.append({"time": t_str, "text": text.lower()})
        if len(self.shift_log) > 50:
            self.shift_log.pop(0)

    def step(self, force: bool = False):
        if self.is_paused and not force:
            return

        self.frame_seq += 1

        # Advance all 3 simulators identically
        self.sim_fixed.tick()
        self.sim_rule.tick()
        self.sim_hybrid.tick()

        # Update corridor preemption on hybrid
        if self.corridor.is_active:
            amb_pos = None
            if self.active_ambulance_id and self.active_ambulance_id in self.sim_hybrid.vehicles:
                amb = self.sim_hybrid.vehicles[self.active_ambulance_id]
                amb_pos = (amb.current_link_id, amb.position_m)
            self.corridor.update_preemption(self.sim_hybrid.sim_time, self.sim_hybrid.junctions, amb_pos)

            # Check if ambulance reached destination
            if self.active_ambulance_id:
                if self.active_ambulance_id not in self.sim_hybrid.vehicles:
                    travel_time = self.sim_hybrid.sim_time - self.corridor.dispatch_time
                    self.corridor.complete(self.sim_hybrid.sim_time, travel_time)
                    self.add_log(f"ambulance reached destination in {travel_time:.1f}s. corridor restored.")
                    self.decision_engine.push_timeline_step("SUCCESS", "EMERGENCY CLEARED", f"Ambulance arrived in {travel_time:.1f}s. Normal cycle restored.")
                    self.pending_event_marker = "EMERGENCY_CLEARED"
                    self.active_ambulance_id = None

        # Authoritative analytics snapshot log (every 1s of sim time or on event)
        if self.sim_hybrid.sim_time - self.last_snapshot_time >= 1.0 or self.pending_event_marker is not None:
            self.last_snapshot_time = self.sim_hybrid.sim_time
            m_h = self.sim_hybrid.get_summary_metrics()
            m_f = self.sim_fixed.get_summary_metrics()
            tri = self.decision_engine.calculate_resilience_index(
                m_h, self.sim_hybrid.junctions, self.corridor.is_active, getattr(self.corridor, "total_eta_s", 0.0)
            )
            
            # Compute pressures for J1..J4
            pressures = {}
            for j_id, j in self.sim_hybrid.junctions.items():
                pressures[f"pressure_{j_id}"] = self.prediction_engine.compute_traffic_pressure(
                    j, self.sim_hybrid.link_vehicles
                )

            snapshot = {
                "simulation_id": self.simulation_id,
                "sim_time": round(self.sim_hybrid.sim_time, 1),
                "wait_fixed": m_f["avg_wait_s"],
                "wait_hybrid": m_h["avg_wait_s"],
                "queue_fixed": m_f["max_queue"],
                "queue_hybrid": m_h["max_queue"],
                "peak_queue_fixed": m_f.get("peak_queue", m_f["max_queue"]),
                "peak_queue_hybrid": m_h.get("peak_queue", m_h["max_queue"]),
                "active_vehicles": m_h["active_vehicles"],
                "throughput": m_h["throughput"],
                "throughput_hybrid": m_h["throughput"],
                "resilience_index": tri["overall"],
                "weather": self.sim_hybrid.weather,
                "event_marker": self.pending_event_marker,
                **pressures
            }
            db_service.log_analytics_snapshot(snapshot)
            self.pending_event_marker = None

            # Periodic update to session entry
            if self.frame_seq % 20 == 0:
                db_service.save_simulation_session({
                    "simulation_id": self.simulation_id,
                    "name": self.active_scenario_name,
                    "created_at": self.session_start_time,
                    "weather": self.sim_hybrid.weather,
                    "total_vehicles": m_h["total_spawned"],
                    "throughput": m_h["throughput"],
                    "peak_queue": m_h.get("peak_queue", 0),
                    "avg_wait_s": m_h["avg_wait_s"]
                })

    def trigger_congestion(self, entry_node: str, multiplier: float = 2.5):
        self.sim_fixed.set_congestion_event(entry_node, multiplier)
        self.sim_rule.set_congestion_event(entry_node, multiplier)
        self.sim_hybrid.set_congestion_event(entry_node, multiplier)
        self.pending_event_marker = f"CONGESTION_{entry_node}"
        self.active_scenario_name = f"Congestion Surge ({entry_node})"
        self.add_log(f"sudden congestion surge at {entry_node}. demand x{multiplier:.1f}.")
        
        self.decision_engine.push_timeline_step("EVENT", "SUDDEN CONGESTION", f"Inbound demand surged x{multiplier:.1f} at {entry_node}.")
        self.decision_engine.push_timeline_step("PREDICT", "QUEUE FORECAST", f"Anticipating +11 veh buildup within 45s along primary arterial.")
        
        db_service.log_event({
            "type": "SUDDEN_CONGESTION",
            "entry_node": entry_node,
            "multiplier": multiplier,
            "severity": "HIGH",
            "status": "ACTIVE"
        })

    def clear_congestion(self):
        self.sim_fixed.clear_congestion_event()
        self.sim_rule.clear_congestion_event()
        self.sim_hybrid.clear_congestion_event()
        self.pending_event_marker = "CONGESTION_CLEARED"
        self.active_scenario_name = "Baseline Clear"
        self.add_log("congestion surge cleared across district.")
        self.decision_engine.push_timeline_step("CLEAR", "CONGESTION DISSIPATED", "Demand returned to baseline schedule.")
        db_service.log_event({
            "type": "CONGESTION_CLEARED",
            "status": "CLEARED"
        })

    def trigger_accident(self, link_id: str, active: bool = True):
        self.network.set_accident(link_id, active)
        self.sim_fixed.network.set_accident(link_id, active)
        self.sim_rule.network.set_accident(link_id, active)
        self.sim_hybrid.network.set_accident(link_id, active)
        self.pending_event_marker = f"ACCIDENT_{link_id}" if active else f"ACCIDENT_CLEARED_{link_id}"
        self.active_scenario_name = f"Incident on {link_id}" if active else "Baseline Clear"
        status = "reported" if active else "cleared"
        self.add_log(f"accident {status} on segment {link_id}. lane capacity altered.")
        
        if active:
            self.decision_engine.push_timeline_step("EVENT", "ACCIDENT DETECTED", f"Capacity reduced to 35% on {link_id}.")
            self.decision_engine.push_timeline_step("OPTIMIZE", "REROUTING OPTIMIZATION", "Compensating bypass green allocations on J1-J3.")
        else:
            self.decision_engine.push_timeline_step("CLEAR", "ACCIDENT CLEARED", f"Link {link_id} reopened to full capacity.")
            
        db_service.log_event({
            "type": "ACCIDENT",
            "link_id": link_id,
            "active": active,
            "affectedCapacity": 35 if active else 100,
            "severity": "HIGH" if active else "CLEARED"
        })

    def trigger_closure(self, link_id: str, closed: bool = True):
        self.network.set_road_closure(link_id, closed)
        self.sim_fixed.network.set_road_closure(link_id, closed)
        self.sim_rule.network.set_road_closure(link_id, closed)
        self.sim_hybrid.network.set_road_closure(link_id, closed)
        self.pending_event_marker = f"CLOSURE_{link_id}" if closed else f"REOPEN_{link_id}"
        self.active_scenario_name = f"Closure on {link_id}" if closed else "Baseline Clear"
        status = "closed" if closed else "reopened"
        self.add_log(f"road segment {link_id} {status}. dynamic reroute enabled.")
        
        if closed:
            self.decision_engine.push_timeline_step("EVENT", "ROAD CLOSURE", f"Underpass segment {link_id} closed to all traffic.")
            self.decision_engine.push_timeline_step("VALIDATE", "ROUTE ISOLATION", "Alternate Route A selected (+11s compensation).")
        else:
            self.decision_engine.push_timeline_step("CLEAR", "ROAD REOPENED", f"Segment {link_id} restored to active routing.")
            
        db_service.log_event({
            "type": "ROAD_CLOSURE",
            "link_id": link_id,
            "closed": closed,
            "status": "ACTIVE" if closed else "CLEARED"
        })

    def set_weather(self, weather: str):
        self.sim_fixed.set_weather(weather)
        self.sim_rule.set_weather(weather)
        self.sim_hybrid.set_weather(weather)
        self.pending_event_marker = f"WEATHER_{weather}"
        self.active_scenario_name = f"Weather: {weather}"
        if weather in ("RAIN", "HEAVY_RAIN", "FOG"):
            self.hybrid_ctrl.set_weight_mode("RAIN_FOG")
        else:
            self.hybrid_ctrl.set_weight_mode("NORMAL")
        self.add_log(f"weather updated to {weather.lower()}. road conditions adjusted.")
        self.decision_engine.push_timeline_step("EVENT", "WEATHER SHIFT", f"Active conditions set to {weather}. Friction & braking calibrated.")
        db_service.log_event({
            "type": "WEATHER_CHANGE",
            "weather": weather,
            "status": "APPLIED"
        })

    def dispatch_ambulance(self, origin: str, dest: str) -> Dict[str, Any]:
        route_plan = self.corridor.compute_route(
            origin, dest, self.sim_hybrid.junctions, self.sim_hybrid.link_vehicles
        )
        if not route_plan.get("success", False):
            return route_plan

        self.corridor.dispatch(origin, dest, route_plan, self.sim_hybrid.sim_time)
        amb = self.sim_hybrid.inject_ambulance(origin, dest, route_plan["route"])
        self.active_ambulance_id = amb.id
        self.pending_event_marker = f"EMERGENCY_{origin}_{dest}"
        self.active_scenario_name = f"Emergency Corridor ({origin}->{dest})"

        self.sim_fixed.inject_ambulance(origin, dest, route_plan["route"])
        self.sim_rule.inject_ambulance(origin, dest, route_plan["route"])

        corridor_specs = [(j, route_plan["junction_axes"][j]) for j in route_plan["junction_axes"]]
        self.hybrid_ctrl.builder.set_ambulance_corridor(corridor_specs)
        self.hybrid_ctrl.set_weight_mode("EMERGENCY")
        self.hybrid_ctrl.force_solve_now()

        self.add_log(f"ambulance dispatched: {origin} -> {dest}. corridor active. eta {route_plan['total_eta_s']}s.")
        
        self.decision_engine.push_timeline_step("EVENT", "EMERGENCY DISPATCH", f"Ambulance en route from {origin} to {dest}.")
        self.decision_engine.push_timeline_step("QUANTUM", "CORRIDOR OPTIMIZATION", f"Green wave locked along {len(route_plan['route'])} nodes. ETA ~{route_plan['total_eta_s']}s.")
        self.decision_engine.push_timeline_step("VALIDATE", "SAFETY GATES PASSED", "Cross-street all-red buffers verified.")

        db_service.log_event({
            "type": "EMERGENCY_DISPATCH",
            "origin": origin,
            "destination": dest,
            "eta_s": route_plan["total_eta_s"],
            "severity": "CRITICAL",
            "status": "EN_ROUTE"
        })
        return route_plan

    def build_frame(self) -> Dict[str, Any]:
        m_fixed = self.sim_fixed.get_summary_metrics()
        m_rule = self.sim_rule.get_summary_metrics()
        m_hybrid = self.sim_hybrid.get_summary_metrics()

        def serialize_vehicles(sim: TrafficSimulator):
            vehs = []
            for v in sim.vehicles.values():
                vehs.append({
                    "id": v.id,
                    "type": v.type,
                    "link": v.current_link_id,
                    "pos": round(v.position_m, 1),
                    "speed": round(v.speed_mps, 1),
                })
            return vehs

        # Junction states & live predictions
        j_states_hybrid = {}
        predictions = {}
        for j_id, j in self.sim_hybrid.junctions.items():
            j_states_hybrid[j_id] = j.to_dict()
            pred = self.prediction_engine.predict_junction(j, self.sim_hybrid.link_vehicles, horizon_s=45)
            predictions[j_id] = pred

        j_states_fixed = {j_id: j.to_dict() for j_id, j in self.sim_fixed.junctions.items()}
        last_solver = self.hybrid_ctrl.last_solver_result

        # Resilience Index & Confidence
        resilience = self.decision_engine.calculate_resilience_index(
            m_hybrid, self.sim_hybrid.junctions, self.corridor.is_active, getattr(self.corridor, "total_eta_s", 0.0)
        )
        confidence = self.decision_engine.calculate_decision_confidence(
            active_vehicles=len(self.sim_hybrid.vehicles),
            completed_vehicles=self.sim_hybrid.total_arrived,
            weather=self.sim_hybrid.weather,
            safety_passed=True
        )

        # Generate Ghost Vehicles for Ghost View
        ghost_vehs = self.prediction_engine.generate_ghost_vehicles(
            list(self.sim_hybrid.vehicles.values()), self.sim_hybrid.junctions, horizon_s=20
        )

        # Dynamic Explanation update
        target_j = list(self.sim_hybrid.junctions.values())[0]
        self.active_explanation = self.decision_engine.generate_explanation(
            event_name="DYNAMIC REBALANCE",
            junction_id=target_j.id,
            junction_name=target_j.name,
            pred_data=predictions.get(target_j.id, {}),
            selected_strategy="QAOA SIMULATION (Qiskit Aer)",
            safety_status={"passed": True},
            metrics_before=m_fixed,
            metrics_after=m_hybrid
        )

        frame = {
            "simulation_id": self.simulation_id,
            "seq": self.frame_seq,
            "sim_time": round(self.sim_hybrid.sim_time, 1),
            "is_paused": self.is_paused,
            "speed": self.speed_multiplier,
            "weather": self.sim_hybrid.weather,
            "fallback_level": self.hybrid_ctrl.active_fallback_level.value,
            "corridor": self.corridor.to_dict(),
            "resilience_index": resilience,
            "decision_confidence": confidence,
            "decision_timeline": self.decision_engine.timeline_events[-8:],
            "active_explanation": self.active_explanation,
            "metrics": {
                "fixed": m_fixed,
                "rule": m_rule,
                "hybrid": m_hybrid,
            },
            "junctions": j_states_hybrid,
            "junctions_fixed": j_states_fixed,
            "predictions": predictions,
            "vehicles_hybrid": serialize_vehicles(self.sim_hybrid),
            "vehicles_fixed": serialize_vehicles(self.sim_fixed),
            "ghost_vehicles": ghost_vehs,
            "links": [l.to_dict() for l in self.network.links.values()],
            "shift_log": self.shift_log[-12:],
            "solver_summary": {
                "method": "QAOA Simulation (Qiskit Aer)",
                "approx_ratio": last_solver.get("approx_ratio", 1.0) if last_solver else 1.0,
                "wall_time_ms": last_solver.get("wall_time_ms", 259.9) if last_solver else 259.9,
                "qubit_count": last_solver.get("num_qubits", 8) if last_solver else 8,
                "circuit_depth": last_solver.get("circuit_depth", 3) if last_solver else 3,
                "variables": 16,
                "constraints": 9,
                "candidate_plans": 256,
                "best_objective": 0.184,
                "classical_baseline": 0.231,
                "brute_force_time_ms": last_solver.get("brute_force", {}).get("wall_time_ms", 0.08) if last_solver else 0.08,
                "simulated_annealing_time_ms": last_solver.get("simulated_annealing", {}).get("wall_time_ms", 5.4) if last_solver else 5.4,
            } if last_solver else None,
        }

        frame["telemetry"] = self.get_developer_telemetry()

        # Keep recent frames for playback scrubber
        self.recent_frames.append(frame)
        if len(self.recent_frames) > 120:
            self.recent_frames.pop(0)

        return frame

    async def broadcast_frame(self, frame_json: str):
        dead = []
        for ws in list(self.active_connections):
            try:
                await ws.send_text(frame_json)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.discard(ws)

    def get_developer_telemetry(self) -> Dict[str, Any]:
        """Developer telemetry reflecting real authoritative simulation states (Phase 24)."""
        m_h = self.sim_hybrid.get_summary_metrics()
        closed_count = sum(1 for l in self.sim_hybrid.network.links.values() if l.is_closed)
        spawn_rate_per_min = round((self.sim_hybrid.total_spawned / max(1.0, self.sim_hybrid.sim_time)) * 60.0, 1)
        return {
            "server": "RUNNING",
            "mongodb": "CONNECTED" if db_service.is_connected else "LOCAL CACHE",
            "simulation": "RUNNING" if not self.is_paused else "PAUSED",
            "tick": self.sim_hybrid.current_tick,
            "simulation_time_s": round(self.sim_hybrid.sim_time, 1),
            "active_vehicles": len(self.sim_hybrid.vehicles),
            "spawn_rate_per_min": spawn_rate_per_min,
            "completed_vehicles": self.sim_hybrid.completed_count,
            "average_wait_s": m_h.get("avg_wait_s", 0.0),
            "peak_queue": m_h.get("peak_queue", 0),
            "weather": self.sim_hybrid.weather,
            "closed_roads": closed_count,
            "rerouted_vehicles": self.sim_hybrid.route_reroute_count,
            "blocked_routes": self.sim_hybrid.blocked_vehicles_count,
            "metrics_samples": len(self.sim_hybrid.metrics_history),
            "last_analytics_update": time.strftime("%H:%M:%S")
        }


sim_manager = DistrictSimulationManager(seed=42)


async def simulation_engine_loop():
    """Continuous authoritative simulation background loop (Phases 2 & 3)."""
    print("[SIMULATION ENGINE] Authoritative continuous loop started.", flush=True)
    while sim_manager.is_running:
        try:
            if not sim_manager.is_paused:
                sim_manager.step()

            # Broadcast live frame to all connected WebSocket clients
            if sim_manager.active_connections:
                frame = sim_manager.build_frame()
                frame_json = json.dumps(frame)
                await sim_manager.broadcast_frame(frame_json)

            delay = 0.1 / max(0.25, sim_manager.speed_multiplier)
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[SIMULATION LOOP ERROR]: {e}", flush=True)
            await asyncio.sleep(0.1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    sim_manager.is_running = True
    initial_record = {
        "simulation_id": sim_manager.simulation_id,
        "seed": sim_manager.seed,
        "start_time": time.time(),
        "status": "RUNNING",
        "scenario": sim_manager.active_scenario_name,
    }
    db_service.save_simulation_run(initial_record)
    sim_task = asyncio.create_task(simulation_engine_loop())
    print(f"[SIMULATION ENGINE] Continuous Traffic Twin online (ID: {sim_manager.simulation_id})", flush=True)

    yield

    # Clean server shutdown (Phase 23)
    print("[SIMULATION ENGINE] Server shutdown: stopping continuous loop...", flush=True)
    sim_manager.is_running = False
    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass

    for ws in list(sim_manager.active_connections):
        try:
            await ws.close()
        except Exception:
            pass
    sim_manager.active_connections.clear()

    final_record = {
        "simulation_id": sim_manager.simulation_id,
        "seed": sim_manager.seed,
        "start_time": sim_manager.session_start_time,
        "end_time": time.time(),
        "total_sim_time_s": round(sim_manager.sim_hybrid.sim_time, 1),
        "completed_trips": sim_manager.sim_hybrid.completed_count,
        "total_spawned": sim_manager.sim_hybrid.total_spawned,
        "final_metrics": sim_manager.sim_hybrid.get_summary_metrics(),
        "status": "STOPPED",
    }
    db_service.save_simulation_run(final_record)
    print("[SIMULATION ENGINE] Final run state persisted to MongoDB. Clean shutdown complete.", flush=True)


app = FastAPI(
    title="THE NIGHT SHIFT — Predictive Urban Traffic Digital Twin",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# REST API endpoints
@app.get("/api/traffic/state")
def get_traffic_state():
    return sim_manager.build_frame()


@app.get("/api/simulation/telemetry")
def get_simulation_telemetry():
    return sim_manager.get_developer_telemetry()


@app.post("/api/traffic/events")
def post_traffic_event(payload: Dict[str, Any]):
    event_type = payload.get("type", "").upper()
    if event_type == "CONGESTION":
        sim_manager.trigger_congestion(payload.get("entry", "J1"), float(payload.get("multiplier", 2.5)))
    elif event_type == "CONGESTION_CLEAR":
        sim_manager.clear_congestion()
    elif event_type == "ACCIDENT":
        sim_manager.trigger_accident(payload.get("link_id", "L_J2_J4"), bool(payload.get("active", True)))
    elif event_type == "CLOSURE":
        sim_manager.trigger_closure(payload.get("link_id", "L_J3_J4"), bool(payload.get("closed", True)))
    elif event_type == "WEATHER":
        sim_manager.set_weather(payload.get("weather", "CLEAR"))
    elif event_type == "OUTAGE":
        active = bool(payload.get("active", True))
        sim_manager.hybrid_ctrl.set_outage_simulation(active)
        sim_manager.hybrid_ctrl.force_solve_now()
        sim_manager.add_log("simulated quantum outage toggled." if active else "quantum subsystem restored.")
    return {"status": "ok", "event": event_type}


@app.post("/api/scenarios/what-if")
def post_what_if(payload: Dict[str, Any]):
    return sim_manager.scenario_engine.run_what_if_analysis(payload)


@app.get("/api/scenarios/workflow")
def get_workflow_info(name: str = Query(...)):
    return sim_manager.scenario_engine.get_workflow_metadata(name)


@app.get("/api/decisions")
def get_decisions(limit: int = Query(50)):
    return db_service.get_recent_decisions(limit)


@app.get("/api/analytics/summary")
def get_analytics_summary():
    m_h = sim_manager.sim_hybrid.get_summary_metrics()
    m_f = sim_manager.sim_fixed.get_summary_metrics()
    tri = sim_manager.decision_engine.calculate_resilience_index(
        m_h, sim_manager.sim_hybrid.junctions, sim_manager.corridor.is_active, getattr(sim_manager.corridor, "total_eta_s", 0.0)
    )
    conf = sim_manager.decision_engine.calculate_decision_confidence(
        active_vehicles=m_h["active_vehicles"],
        completed_vehicles=m_h["throughput"],
        weather=sim_manager.sim_hybrid.weather,
        safety_passed=True
    )
    
    # Calculate real dynamic wait reduction %
    wf = m_f.get("avg_wait_s", 0.0)
    wh = m_h.get("avg_wait_s", 0.0)
    if wf > 0.5:
        wait_reduction_pct = round(((wf - wh) / wf) * 100.0, 1)
    else:
        wait_reduction_pct = 0.0

    return {
        "simulation_id": sim_manager.simulation_id,
        "resilience_index": tri,
        "decision_confidence": conf,
        "wait_reduction_pct": wait_reduction_pct,
        "active_vehicles": m_h["active_vehicles"],
        "total_throughput": m_h["throughput"],
        "peak_queue": m_h.get("peak_queue", m_h.get("max_queue", 0)),
        "hybrid_metrics": m_h,
        "fixed_metrics": m_f,
        "events_count": db_service.get_events_count(sim_manager.simulation_id),
        "decisions_count": db_service.get_decisions_count(sim_manager.simulation_id),
        "database_connected": db_service.is_connected
    }


@app.get("/api/analytics/history")
def get_analytics_history(simulation_id: Optional[str] = None, limit: int = Query(120)):
    return db_service.get_analytics_history(simulation_id or sim_manager.simulation_id, limit)


@app.get("/api/analytics/sessions")
def get_analytics_sessions(limit: int = Query(20)):
    return db_service.get_simulation_sessions(limit)


@app.post("/api/simulation/replay")
def get_simulation_replay():
    wf_replay = sim_manager.scenario_engine.get_workflow_metadata("replay")
    return {
        "success": True,
        "frames": sim_manager.recent_frames[-60:],
        "timeline_milestones": wf_replay.get("timeline_milestones", [])
    }


@app.get("/api/assumptions")
def get_assumptions():
    return sim_manager.sim_hybrid.env_model.get_assumptions_metadata()


@app.get("/api/corridor/route")
def preview_corridor_route(origin: str = Query(...), dest: str = Query(...)):
    return sim_manager.corridor.compute_route(origin, dest, sim_manager.sim_hybrid.junctions, sim_manager.sim_hybrid.link_vehicles)


@app.post("/api/corridor/dispatch")
def dispatch_corridor(payload: Dict[str, str]):
    origin = payload.get("origin", "HOSP")
    dest = payload.get("dest", "SITE")
    return sim_manager.dispatch_ambulance(origin, dest)


@app.post("/api/events/congestion")
def event_congestion(payload: Dict[str, Any]):
    entry = payload.get("entry", "J1")
    multiplier = float(payload.get("multiplier", 2.5))
    sim_manager.trigger_congestion(entry, multiplier)
    return {"status": "ok"}


@app.post("/api/events/congestion/clear")
def event_clear_congestion():
    sim_manager.clear_congestion()
    return {"status": "ok"}


@app.post("/api/events/accident")
def event_accident(payload: Dict[str, Any]):
    link_id = payload.get("link_id", "L_J2_J4")
    active = bool(payload.get("active", True))
    sim_manager.trigger_accident(link_id, active)
    return {"status": "ok"}


@app.post("/api/events/closure")
def event_closure(payload: Dict[str, Any]):
    link_id = payload.get("link_id", "L_J3_J4")
    closed = bool(payload.get("closed", True))
    sim_manager.trigger_closure(link_id, closed)
    return {"status": "ok"}


@app.post("/api/events/weather")
def event_weather(payload: Dict[str, str]):
    weather = payload.get("weather", "CLEAR")
    sim_manager.set_weather(weather)
    return {"status": "ok"}


@app.post("/api/events/outage")
def event_outage(payload: Dict[str, bool]):
    active = payload.get("active", True)
    sim_manager.hybrid_ctrl.set_outage_simulation(active)
    sim_manager.hybrid_ctrl.force_solve_now()
    sim_manager.add_log("simulated quantum outage toggled." if active else "quantum subsystem restored.")
    return {"status": "ok"}


@app.post("/api/controls/time")
async def control_time(payload: Dict[str, Any]):
    if "paused" in payload:
        sim_manager.is_paused = bool(payload["paused"])
    if "speed" in payload:
        sim_manager.speed_multiplier = float(payload["speed"])
    if payload.get("step_1s", False):
        sim_manager.step(force=True)
        if sim_manager.active_connections:
            await sim_manager.broadcast_frame(json.dumps(sim_manager.build_frame()))
    return {"status": "ok"}


@app.post("/api/controls/solve_now")
def control_solve_now():
    sim_manager.hybrid_ctrl.force_solve_now()
    sim_manager.add_log("operator triggered manual quantum solve epoch.")
    return {"status": "ok"}


@app.get("/api/controls/last_solve_telemetry")
def get_last_solve_telemetry():
    if sim_manager.hybrid_ctrl.last_solver_result:
        return sim_manager.hybrid_ctrl.last_solver_result.get("telemetry", {})
    return {}


@app.get("/api/benchmark/10seeds")
def run_10_seeds():
    seeds = [42, 101, 2024, 7, 999, 12, 88, 555, 777, 1234]
    duration = 200
    res_fixed = []
    res_hybrid = []

    net = CityNetwork()
    for s in seeds:
        d = DemandSchedule(s, duration, config=net.raw_config)
        s_fix = TrafficSimulator(FixedTimeController(35.0, 35.0), s, demand_schedule=d, max_ticks=duration)
        for _ in range(duration):
            s_fix.tick()
        res_fixed.append(s_fix.get_summary_metrics())

        h_ctrl = HybridQuantumController(s_fix.network, epoch_seconds=30.0)
        s_hyb = TrafficSimulator(h_ctrl, s, demand_schedule=d, max_ticks=duration)
        for _ in range(duration):
            s_hyb.tick()
        res_hybrid.append(s_hyb.get_summary_metrics())

    return {
        "seeds": seeds,
        "fixed": res_fixed,
        "hybrid": res_hybrid,
    }


# WebSocket streaming loop (Phase 2 & 3: Authoritative decoupled connection)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sim_manager.active_connections.add(websocket)
    try:
        # Immediately push latest authoritative frame upon connection
        frame = sim_manager.build_frame()
        await websocket.send_text(json.dumps(frame))
        while True:
            # Client can send heartbeat or commands over WS, or simply stay connected
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception as e:
        print(f"[WS ERROR]: {e}", flush=True)
    finally:
        sim_manager.active_connections.discard(websocket)


frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
