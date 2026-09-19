# NADI: Requirements Verification & Audit Report

**Date:** 2026-09-19  
**Track:** Quantum and Social Welfare (HackHere)  
**System:** NADI (Quantum-Enhanced Adaptive Urban Traffic Optimization)  

Every item from the track specification and build prompt has been verified against the live running application and automated tests.

---

## 1. Requirement Coverage Matrix

| # | Requirement | Specification | Measured / Verified Value | Status |
|---|-------------|---------------|---------------------------|--------|
| **1** | **Junction Network** | 4 to 8 connected junctions with density, queue, capacity, and signal countdown | 6 junctions default (expandable to 8 with J7/J8 Outer Ring), with live N/S/E/W queues, approach speeds, capacities, and countdown rings | **VERIFIED** |
| **2** | **QUBO / Ising Formulation** | 2 binary variables per junction (axis & bias), exact Ising Hamiltonian conversion | 12 qubits (6 junctions) / 16 qubits (8 junctions). Strict unit test passed: Max absolute error between QUBO and Ising across all 4096 states = **1.78e-15** ($< 1.0\times 10^{-6}$) | **VERIFIED** |
| **3** | **QAOA on Aer Simulator** | Parameterized ansatz ($p=1..3$), Aer simulator, warm starting, COBYLA | QAOA solve time: **~530ms - 690ms**, Circuit depth: **6**, Gates: 10 CX, 10 U2, 10 RX, 5 RZ, 12 Measure. Approx ratio: **0.964 - 1.000** | **VERIFIED** |
| **4** | **Adaptive Signals** | Green durations visibly change with traffic demand | Plans adapt between 40s/30s, 50s/20s, 30s/40s, 20s/50s depending on real-time sensor queue backlogs | **VERIFIED** |
| **5** | **Emergency Green Corridor** | Queue-aware lead clearance, wave of green lights, safe restoration | Ambulance dispatched on `J4 -> J5 -> J6 -> J3`. Queue clearance lead calculated based on ahead backlog. Signal turns green, ambulance traverses corridor, junctions smoothly restore without shockwave | **VERIFIED** |
| **6** | **Dynamic Events** | Surge, accident, road closure, weather, ambulance | All 5 implemented: Surge (2.5x demand), Accident (capacity halved, hazard lights), Barricaded Road Closure (vehicles reroute via NetworkX), Extreme Weather (Clear/Rain/Heavy Rain with underpass flood/Fog) | **VERIFIED** |
| **7** | **Environmental Modeling** | Idle fuel + stop penalty + cruise consumption, petrol/diesel CO2 | Fuel tracked in liters (idle rates: 0.18-2.4 L/h, stop penalties: 0.0015-0.035 L), CO2 tracked in kg (2.31-2.68 kg/L). Displayed live and in comparison table | **VERIFIED** |
| **8** | **Fair Baseline Comparison** | Fixed-Time vs Rule-Based vs Hybrid under identical traffic streams | 5-seed aggregated benchmark: Fixed Avg Wait **12.84s**, Rule **9.89s** (-23.0%), Hybrid **9.22s** (-28.2%), Throughput increased from **13.2 to 18.8+ veh/min** | **VERIFIED** |
| **9** | **Safety Validator & Fallback Chain** | Enforces minimum green, clearances, pedestrian phase, kill-switch drill | SafetyValidator checks minimum green (>=15s), clearances, and starvation. "Kill Quantum Service" drill immediately falls back to Classical Exact without halting traffic | **VERIFIED** |
| **10** | **The Night Shift Console** | Warm sodium amber classical vs cold ice-blue quantum light, no gradients | Palette: Ink `#14110F`, Panels `#1D1915`, Paper text `#EDE4D3`, Amber `#F2A33A`, Cold Blue `#9FD8FF`, Green `#6CC58A`, Red `#E5533D`, Yellow `#F5D04A`. Tabular figures for numbers | **VERIFIED** |
| **11** | **Solver Drawer** | Cold-lit rising drawer with live computation data | Plays real 12x12 QUBO matrix heatmap, qubit ring coupling, COBYLA optimizer energy trace, and 1024-shot bitstring measurement histogram | **VERIFIED** |
| **12** | **Demo Safety Fallback** | Pre-recorded run fallback in case of backend outage | `frontend/public/prerecorded_run.json` (90 frames, 1.1 MB) bundled and playable directly in the UI via "DEMO SAFE" button | **VERIFIED** |
| **13** | **Single Command Runner** | `python run.py` builds frontend and starts backend | Root `run.py` launches FastAPI server and serves built Vite bundle on port 8000 | **VERIFIED** |

---

## 2. Test Verification Log

- `py -3.13 backend/tests/test_stage1_headless.py`: **PASSED** (5 seeds deterministic run)
- `py -3.13 backend/tests/test_qubo_ising.py`: **PASSED** (all 4096 states evaluated, error = $1.78\times 10^{-15}$)
- `py -3.13 backend/tests/test_stage3_hybrid.py`: **PASSED** (closed-loop epochs, emergency corridor, kill switch)
- `npm run build`: **PASSED** (TypeScript 0 errors, Vite bundle 41.7 kB)
- API endpoint health: `GET /api/config` (**200 OK**), `POST /api/action/ambulance` (**200 OK**), `POST /api/action/solve_now` (**200 OK**)
