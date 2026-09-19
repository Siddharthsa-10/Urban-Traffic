# NADI: Quantum-Enhanced Adaptive Urban Traffic Optimization

> *"A traffic control room that shows its working."*

Built for **HackHere — Quantum and Social Welfare Track**.

---

## 1. The Core Idea

Urban traffic congestion is not merely an inconvenience; it represents thousands of hours of idling, tons of unnecessary $\text{CO}_2$ emissions, and critical delays for emergency vehicles.

Traditional signal controllers operate either on static time tables (Fixed-Time) or localized reactive triggers (Rule-Based). When demand surges or road incidents occur, local adjustments often cause shockwaves that back up into upstream intersections.

**NADI** approaches urban traffic as an interconnected combinatorial optimization problem. Every 30 seconds, real-time sensor measurements from a network of junctions are formulated into a **Quadratic Unconstrained Binary Optimization (QUBO)** problem, converted into an Ising Hamiltonian, and solved using the **Quantum Approximate Optimization Algorithm (QAOA)** simulated on Qiskit Aer. The resulting signal timings are checked against a strict classical safety validator before being applied to the signals.

---

## 2. System Architecture

```
                       [ REAL-TIME SENSORS (10 Hz) ]
                                     |
               +---------------------+---------------------+
               |                     |                     |
     [ FIXED-TIME BASELINE ]  [ RULE-BASED HEURISTIC ]     |
               |                     |                     |
               |                     |          [ 12/16-QUBIT QUBO BUILDER ]
               |                     |          (Local queue, platoon, fuel,
               |                     |           emergency, change penalty)
               |                     |                     |
               |                     |          [ ISING CONVERTER ]
               |                     |          x_i = (1 - z_i)/2
               |                     |                     |
               |                     |          [ QAOA on Qiskit Aer ]
               |                     |          (Ansatz p=1..3, COBYLA,
               |                     |           warm start, 1024 shots)
               |                     |                     |
               |                     |          [ CLASSICAL SAFETY VALIDATOR ]
               |                     |          (Min green, clearance, max wait)
               |                     |                     |
               |                     |          [ FAIL-SAFE REDUNDANCY ]
               |                     |          (Quantum -> Exact -> Rule -> Fixed)
               +---------------------+---------------------+
                                     |
                     [ 60 FPS CANVAS 2D STAGE ]
           ("The Night Shift" Console: Map, Solver Drawer,
            Emergency Corridor, Split & Ghost Views)
```

### Where Quantum Is and Is Not Used
- **Quantum (Simulated):** Strictly the *"find low-energy bitstring in non-convex landscape"* step.
- **Classical:** Vehicle physics (IDM car-following), graph routing (NetworkX), sensor queue forecasting, QUBO formulation, safety constraint validation, fuel & $\text{CO}_2$ accounting, and live telemetry streaming.

---

## 3. Measured Results (10-Seed Aggregated Benchmark)

All three controllers were evaluated on identical, deterministic Poisson arrival streams across multiple random seeds:

| Metric | Fixed-Time (Mean) | Rule-Based (Mean) | Hybrid QAOA (Mean) | Improvement vs Fixed |
|---|:---:|:---:|:---:|:---:|
| **Average Waiting Time** | 12.84 s | 9.89 s | **9.22 s** | **-28.2%** |
| **Max Queue Length** | 7.2 veh | 7.0 veh | **5.8 veh** | **-19.4%** |
| **Network Throughput** | 13.2 veh/min | 18.8 veh/min | **19.4 veh/min** | **+47.0%** |
| **Total Fuel Consumed** | 3.10 L | 3.19 L | **2.98 L** | **-3.9%** |
| **Total $\text{CO}_2$ Emitted** | 7.58 kg | 7.79 kg | **7.29 kg** | **-3.8%** |
| **Solver Computation Time** | 0.0 ms | 0.1 ms | **530 - 690 ms** | Ready for hardware |

---

## 4. Honest Scientific Limitations

We believe in radical transparency:
1. **Simulation vs Hardware:** All quantum computations in this prototype execute on the local Qiskit Aer simulator. Real quantum QPUs introduce gate noise and readout fidelities that require error-mitigation or shallow-depth formulations.
2. **Qubit Scale Reality:** At 12 to 16 qubits (6 to 8 junctions), classical brute force evaluates all $2^{12} = 4096$ states in ~0.3 ms. **We do not claim quantum beats classical today at this scale.** Our contribution demonstrates that the problem maps cleanly to a QUBO with exact agreement ($< 10^{-14}$ error), that QAOA finds near-optimal solutions (approximation ratio > 0.95), and that the software architecture, safety fallback, and emergency corridors are verified and ready for hardware scaling.
3. **What Real Production Deployment Requires:** Certified fail-safe traffic controller hardware (NEMA/170 standards), inductive loop/radar detector feeds, and direct municipal emergency dispatch integration.

---

## 5. Quick Start (One Command)

### Prerequisites
- Python 3.11+ (Python 3.13 tested and confirmed)
- Node.js 18+ (Node 20 tested and confirmed)

### Launch
```bash
# 1. Clone repository and navigate to project root
cd "Traffic Optimization"

# 2. Start the unified control room (compiles frontend and launches backend)
py -3.13 run.py
```
Open your browser at **`http://localhost:8000`**.

---

## 6. Three-Minute Judge Demo Script

If demonstrating live, follow this 3-minute sequence:

1. **0:00 — The Night Shift Stage:** Note the aesthetic: warm sodium amber (`#F2A33A`) for the classical simulator, cold ice-blue (`#9FD8FF`) for the quantum world. Switch between Single, Split (3 Cities side-by-side), and Ghost views.
2. **0:30 — Inject a Traffic Surge:** Click `Surge x2.5`. Watch queues build along the Clock Tower arterial.
3. **1:00 — Open the Solver Drawer:** Click `QUANTUM SOLVER DRAWER`. Show the 12x12 QUBO matrix heatmap, the 12-qubit ring circuit, the COBYLA energy descent trace, and the 1024-shot bitstring histogram.
4. **1:30 — Dispatch an Emergency Ambulance:** Click `Ambulance`. Watch the queue-aware lead clearance wave run ahead, locking signals green just in time for the ambulance and restoring smoothly afterward.
5. **2:00 — Extreme Weather Test:** Switch weather to `Heavy Rain`. Watch the Mill Underpass flood and barricade itself, vehicles rerouting dynamically, and QUBO weights shifting to safety-first mode.
6. **2:30 — The Kill-Quantum Drill:** Click `KILL QUANTUM SERVICE`. Notice how the system gracefully falls back to Classical Exact within the same second without stopping traffic.
7. **2:50 — Scoreboard & Limits:** Open the `10-SEED SCOREBOARD` and `LIMITS & ARCHITECTURE` modals to discuss real benchmark numbers and future hardware scaling.
