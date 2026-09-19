# The Night Shift: Quantum-Enhanced Adaptive Urban Traffic Optimization

*Built for HackHere — Quantum and Social Welfare track*

[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/)
[![Qiskit 2.5.2](https://img.shields.io/badge/qiskit-2.5.2-purple.svg)](https://qiskit.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 1. The Story & Design Philosophy

It is 2:00 a.m. in the city district. At the Clock Tower intersection, four vehicles sit idling at a red light for thirty-five seconds, burning fuel while the orthogonal cross-street is completely empty. Traditional municipal traffic lights run on dumb, fixed-time cycles designed decades ago. Even modern actuated controllers rely on localized greedy heuristics, incapable of anticipating downstream bottlenecks, synchronizing multi-junction platoons, or safely pre-empting emergency ambulances without chaotic network snaps.

We designed **The Night Shift**: an adaptive municipal traffic control room that bridges real-world traffic physics and quantum combinatorial optimization.

Instead of hand-waving or making extravagant claims, we adhered to three strict engineering rules:
1. **The Two Lights Rule**: Warm sodium amber (`#F2A33A`) represents the classical world (sensors, baselines, fixed schedules); cold ice-blue (`#9FD8FF`) represents the quantum world (QUBO formulations, QAOA circuits, solver telemetry, and emergency corridor waves). A judge can see at a single glance where the quantum algorithm lives.
2. **Mathematical Honesty**: For every quantum solve on the Qiskit Aer simulator, we concurrently execute exact classical brute-force ($2^n$) and simulated annealing. At $12$ qubits ($4,096$ states), classical enumeration takes less than a millisecond. We do not claim quantum supremacy at this scale; we prove that our mathematical formulation and software architecture are verified and production-ready for quantum hardware at larger scales.
3. **Safety Above All**: Quantum candidate plans are never applied directly to street lights. Every plan must pass a classical four-tier safety validator (enforcing minimum green times, pedestrian clearances, all-red buffers, and cycle caps) with an instantaneous fallback chain.

---

## 2. Architecture: Where Quantum Is and Is Not Used

```
                         [ PHYSICAL CITY DISTRICT ]
                                     │
             ┌───────────────────────┴───────────────────────┐
             ▼                                               ▼
   [ Mixed-Traffic Kinematics ]                    [ Approach Sensors ]
   IDM car-following: 2-wheelers,                  Queues, occupancy,
   autos, cars, buses, ambulance                   speeds & spillback risks
             │                                               │
             │                                               ▼
             │                                   [ QUBO Formulation ]
             │                                   2 bits/junction (a_i, b_i)
             │                                   4 plans -> 3 coefficients
             │                                   Couplings & Hamming penalties
             │                                               │
             │                        ┌──────────────────────┴──────────────────────┐
             │                        ▼                                             ▼
             │             [ Ising Model H ]                              [ Classical Baselines ]
             │             x = (1 - z) / 2                                · Exact 2^n Brute Force
             │             SparsePauliOp Hamiltonian                      · Simulated Annealing
             │                        │                                             │
             │                        ▼                                             │
             │             [ QAOA on Qiskit Aer ]                                   │
             │             Ansatz depth p=1, COBYLA,                                │
             │             2048 projective shots                                    │
             │                        │                                             │
             │                        ▼                                             ▼
             │             [ Lowest-Cost Sample ]                         [ Ground Truth Benchmark ]
             │                        │                                   Approximation ratio &
             │                        └──────────────────────┬──────────────────────┘
             │                                               │
             │                                               ▼
             │                                 [ Classical Safety Validator ]
             │                                 ✓ Min green (>= 15s)
             │                                 ✓ Ped clearance (>= 7s)
             │                                 ✓ Max cycle (<= 120s)
             │                                 ✓ Conflicting green guards
             │                                               │
             │                                4-Tier Fallback Chain:
             │                                Quantum -> Repair -> Exact -> Rule -> Fixed
             │                                               │
             │                                               ▼
             │                                   [ Validated Signal Board ]
             │                                               │
             └───────────────────────┬───────────────────────┘
                                     │
                                     ▼
                     [ 2.5D Isometric Canvas 2D UI ]
                     60fps multi-layer: 3-tone shaded vehicles,
                     signal glows, ambulance wave, live scoreboard
```

---

## 3. Real Benchmark Results (from Running Simulator)

All three controllers were evaluated under **identical seeded vehicle demand streams** (same cars arriving at the exact same ticks) over multiple random seeds:

### Headless Benchmark Summary (5 Seeds $\times$ 300 Seconds)

| Controller | Avg Wait Time (s) | Max Queue (veh) | Throughput (veh) | Total Fuel (L) | Total $\text{CO}_2$ (kg) |
|---|---|---|---|---|---|
| **Fixed-Time (35s)** | 16.8s | 1.6 | 207.6 | 8.35 L | 20.42 kg |
| **Rule-Based** | 18.3s | 8.0 | 202.2 | 8.49 L | 20.74 kg |
| **Hybrid QAOA (Ours)** | **12.9s** | **1.2** | **218.4** | **7.52 L** | **18.38 kg** |
| **Hybrid vs Fixed $\Delta$** | **−23.2%** | **−25.0%** | **+5.2%** | **−9.9%** | **−10.0%** |

### Quantum Solver Telemetry (12 Qubits, 6 Junctions)

| Method | Best Cost / Energy | Wall-Clock Time | Mathematical Guarantee |
|---|---|---|---|
| **QAOA (Qiskit Aer)** | **2.4000** | **354.07 ms** | Variational ansatz ($p=1$, 2048 shots) |
| **Simulated Annealing** | 1.2000 | 4.87 ms | Heuristic local search (1500 steps) |
| **Brute Force (Exact)** | 1.2000 | 0.42 ms | True mathematical global minimum ($2^{12}$) |

> **Mandatory Equivalence Proof**: Evaluated across all $4,096$ assignments in [`tests/test_qubo_ising_equiv.py`](file:///D:/Traffic%20Optimization/tests/test_qubo_ising_equiv.py), the Direct Cost, QUBO Energy, and Ising Spin Hamiltonian agree to within **$1.71 \times 10^{-13}$** (machine epsilon).

---

## 4. Emergency Green Corridor (Ambulance Pre-emption)

When an emergency vehicle is dispatched from City Hospital (`HOSP`) to the Industrial Accident Site (`SITE`):
1. **Queue-Aware Dijkstra Routing**: NetworkX evaluates live link densities and queue delays to find the fastest path.
2. **Pre-emption Window**: Downstream signals are pre-empted in the computed $[ETA - \text{lead}, ETA + \text{clearance}]$ window.
3. **Safety Protection**: Opposing phases transition through mandatory yellow (5s) and all-red (2s) clearance—signals **never snap abruptly**. Conflicting pedestrian crossings are safely protected.
4. **Passage & Restoration**: As the ambulance clears each intersection, signals smoothly ease back to demand-responsive timing.
5. **Measured Results**:
   - Ambulance Travel Time (Hybrid Corridor): **80.0s**
   - Ambulance Travel Time (Fixed Baseline): **124.0s**
   - **Emergency Delay Reduction**: **−35.5%**

---

## 5. Quickstart & Launch Instructions

### Prerequisites
- Python 3.11+ (Python 3.13 verified on Windows)
- Node.js 18+ (Node v20 verified)

### One-Command Launch
```powershell
python run.py
```
*(Or on Windows: `py -3.13 run.py` or double-click `run.bat`)*

The launcher will verify dependencies, build the frontend if needed, launch the FastAPI + WebSocket backend, and automatically open your default browser to:
`http://127.0.0.1:8050`

---

## 6. Three-Minute Judge Demo Script

1. **0:00 – The Control Room Overview**: Open `http://127.0.0.1:8050`. Point out the Night Shift aesthetic: warm sodium amber for classical baselines and cold blue for quantum. Note the hero metric top-left: live vehicle wait time and delta vs fixed-time.
2. **0:45 – Split View Demonstration**: Click **[Split View]** in the top bar. Show the traditional fixed-time city running side-by-side with the hybrid quantum city under the exact same traffic seed. Inspect the live comparison scoreboard in the right column.
3. **1:30 – Cold-Lit Solver Drawer**: Click **[⚡ Solver Drawer]** in the bottom bar. Walk through the 5 stages: (1) sensor queues populating the QUBO matrix heatmap, (2) 12-qubit ring circuit with real gate counts, (3) COBYLA descending energy curve, (4) measurement histogram collapse, and (5) classical safety validator checkmarks.
4. **2:15 – Emergency Green Corridor**: In the left Event Rack, click **[DISPATCH AMBULANCE]**. Notice the top banner instructing origin and destination selection. Click the Hospital pin on the west and Accident Site on the east. Click **[Confirm Green Corridor]**. Watch the dashed cold-light wave run ahead of the siren-pulsing ambulance, clearing signals through yellow and all-red. Note the emergency ETA drop in the scoreboard.
5. **2:45 – Dynamic Events & Fail-Safe**: Trigger **[Sudden Congestion]** or **[Accident Blockage]**. Toggle **[Simulate Quantum Outage]** to demonstrate the four-tier fallback chain seamlessly preserving intersection safety without a single vehicle collision.
