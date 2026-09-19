export class HomeModal {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }

  public show() {
    this.container.classList.add("active");
  }

  public hide() {
    this.container.classList.remove("active");
  }

  private render() {
    this.container.innerHTML = `
      <div class="scenarios-modal-card" style="width: 1000px; max-height: 88vh; overflow-y: auto; background: #14110F; border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 28px; box-shadow: 0 20px 50px rgba(0,0,0,0.9); color: var(--color-paper); margin: auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--color-panel-border); padding-bottom: 16px;">
          <div>
            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--color-quantum); letter-spacing: 0.1em;">
              OPERATIONAL COMMAND CENTER & DIGITAL TWIN
            </div>
            <div style="font-size: 24px; font-weight: 700; color: var(--color-paper); margin-top: 4px;">
              THE NIGHT SHIFT
            </div>
            <div style="font-size: 13px; color: var(--color-paper-muted); margin-top: 2px;">
              Predictive Urban Traffic Digital Twin for Adaptive, Explainable, and Constraint-Safe Signal Optimization
            </div>
          </div>
          <button class="btn-cancel" id="btn-close-home" style="padding: 6px 14px;">✕ Close</button>
        </div>

        <!-- 11 Architecture Cards Grid -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 20px;">
          <!-- 1. The Problem -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-signal-red); margin-bottom: 4px;">1. THE PROBLEM</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">Rigid Municipal Timers</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Municipal pre-timed signals operate blind to real queues, causing arterial spillback, delayed ambulances, and wasted fuel at empty cross-streets.
            </div>
          </div>

          <!-- 2. The Solution -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-signal-green); margin-bottom: 4px;">2. THE SOLUTION</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">Adaptive Digital Twin</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Simulates district intersections in real time, coupling micro-traffic kinematics with predictive forecasting and quantum-inspired combinatorial optimization.
            </div>
          </div>

          <!-- 3. Digital Twin -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-quantum); margin-bottom: 4px;">3. DIGITAL TWIN</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">2.5D Isometric Control Room</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Pure Canvas 2D isometric projection running at 60 FPS. Visualizes multi-class vehicles, pressure gauges, countdown rings, and hazard blockages.
            </div>
          </div>

          <!-- 4. Predictive Engine -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-sodium); margin-bottom: 4px;">4. PREDICTIVE ENGINE</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">+45s Congestion Horizons</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Tracks link inflow rates and vehicle dispersion waves to anticipate queue growth and compute time-to-spillback before gridlock occurs.
            </div>
          </div>

          <!-- 5. Classical Optimization -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-bottom: 4px;">5. CLASSICAL BASELINE</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">Brute Force & Annealing</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Transparent benchmark baselines: exact classical search evaluates all 256 states in 0.08ms; Simulated Annealing in ~5ms.
            </div>
          </div>

          <!-- 6. QAOA Simulation -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-quantum); margin-bottom: 4px;">6. QAOA SIMULATION</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">Qiskit Aer Simulator</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              8 qubits on ring topology, depth p=1 with COBYLA variational optimization. Solves traffic Hamiltonian with 1.000 approximation ratio in ~260ms.
            </div>
          </div>

          <!-- 7. Emergency Corridor -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-signal-red); margin-bottom: 4px;">7. EMERGENCY CORRIDOR</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">Pre-emptive Green Waves</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Dijkstra routing clears signals ahead of ambulances via safety yellow/all-red clearance phases, cutting emergency transit time by up to 62%.
            </div>
          </div>

          <!-- 8. Scenario Simulation -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-sodium); margin-bottom: 4px;">8. SCENARIO SIMULATION</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">What-If Sandbox</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Operators test permutations of inflow demand (+40%), road capacity, weather friction, pedestrian density, and accidents with instant impact projections.
            </div>
          </div>

          <!-- 9. Explainable Decisions -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-quantum); margin-bottom: 4px;">9. EXPLAINABILITY</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">11-Point Decision Explainer</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Every signal split change details: What happened? Where? Why? What was predicted? What strategies were considered? Why chosen? Expected impact?
            </div>
          </div>

          <!-- 10. Analytics -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-bottom: 4px;">10. ANALYTICS & AUDIT</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">Resilience & MongoDB</div>
            <div style="font-size: 11px; color: var(--color-paper-muted); line-height: 1.4; margin-top: 4px;">
              Traffic Resilience Index (0–100) derived from 5 simulation criteria. Full audit trail of decisions and telemetry persisted into MongoDB.
            </div>
          </div>

          <!-- 11. Technology Stack -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px; grid-column: span 2;">
            <div style="font-size: 12px; font-family: var(--font-mono); color: var(--color-signal-green); margin-bottom: 4px;">11. TECHNOLOGY STACK</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-paper);">Full-Stack Python + Qiskit + TypeScript Architecture</div>
            <div style="display: flex; gap: 16px; margin-top: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--color-paper-muted);">
              <div>• Backend: FastAPI / Uvicorn (Py 3.13)</div>
              <div>• Quantum: Qiskit Aer 0.17</div>
              <div>• DB: MongoDB 27017</div>
              <div>• Frontend: TypeScript / Vite / Canvas 2D</div>
              <div>• Realtime: WebSockets 10 Hz</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeBtn = this.container.querySelector("#btn-close-home");
    if (closeBtn) closeBtn.addEventListener("click", () => this.hide());
  }
}
