import { SolvePayload } from '../types/simulation';

export class SolverDrawer {
  private container: HTMLElement;
  public isOpen: boolean = false;
  private currentSolve: SolvePayload | null = null;
  public onSolveNow: (() => void) | null = null;
  private playbackPhase: number = 4; // 1: Matrix, 2: Circuit, 3: Optimizer, 4: Results
  private playbackSpeed: number = 1.0;
  private playbackTimer: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderSkeleton();
  }

  private renderSkeleton() {
    this.container.className = 'solver-drawer';
    this.container.innerHTML = `
      <div class="drawer-header">
        <div style="display: flex; align-items: center; gap: 14px;">
          <span style="font-weight: 700; font-size: 15px; color: var(--accent-quantum);">QUANTUM SOLVER PIPELINE (QAOA / ISING)</span>
          <span id="drawer-epoch-badge" class="badge badge-quantum">EPOCH --</span>
          <span id="drawer-method-badge" class="badge badge-amber">METHOD --</span>
          <span id="drawer-narrator" style="font-size: 13.5px; color: var(--text-paper); font-style: italic;">
            Phase 4/4: Measurement complete. Optimal bitstring selected.
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <button id="btn-drawer-skip" class="btn-action" style="padding: 4px 10px; font-size: 12px; color: var(--text-muted);">
            SKIP TO RESULT &rarr;|
          </button>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-muted);">
            <span>PLAYBACK:</span>
            <button class="btn-ctrl btn-drawer-speed active" data-spd="1.0" style="padding: 2px 6px; font-size: 11px;">1x (8s)</button>
            <button class="btn-ctrl btn-drawer-speed" data-spd="2.0" style="padding: 2px 6px; font-size: 11px;">2x</button>
          </div>
          <button id="btn-drawer-solve-now" class="btn-action" style="padding: 4px 10px; font-size: 12px; border-color: var(--accent-quantum); color: var(--accent-quantum);">
            SOLVE NOW
          </button>
          <button id="btn-drawer-close" class="btn-action" style="padding: 4px 10px; font-size: 12px;">
            &times; CLOSE
          </button>
        </div>
      </div>
      <div class="drawer-grid">
        <!-- Col 1: QUBO Matrix Heatmap -->
        <div class="drawer-col" id="drawer-col-1">
          <div class="drawer-title">1. QUBO MATRIX HEATMAP</div>
          <div id="qubo-heatmap-container" style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
            <canvas id="qubo-canvas" width="240" height="210" style="display: block;"></canvas>
          </div>
        </div>

        <!-- Col 2: Qubit Circuit & Gates -->
        <div class="drawer-col" id="drawer-col-2">
          <div class="drawer-title">2. QAOA ANSATZ & QUBIT RING</div>
          <div id="circuit-summary" class="num" style="font-size: 12px; margin-bottom: 6px; color: var(--text-paper);">
            Qubits: <span id="val-qubits" style="color: var(--accent-quantum);">12</span> | Depth: <span id="val-depth">1</span> | Circuit Gates: <span id="val-gates">--</span>
          </div>
          <canvas id="qubit-ring-canvas" width="280" height="190" style="display: block;"></canvas>
        </div>

        <!-- Col 3: Optimizer Trace -->
        <div class="drawer-col" id="drawer-col-3">
          <div class="drawer-title">3. OPTIMIZER ENERGY TRACE (COBYLA)</div>
          <div id="optimizer-status" class="num" style="font-size: 12px; margin-bottom: 6px; color: var(--text-paper);">
            Best QAOA Cost: <span id="val-qaoa-cost" style="color: var(--accent-quantum);">--</span> | Iterations: <span id="val-iters">--</span>
          </div>
          <canvas id="optimizer-canvas" width="280" height="190" style="display: block;"></canvas>
        </div>

        <!-- Col 4: Measurement Bitstring Histogram & Comparison -->
        <div class="drawer-col" id="drawer-col-4">
          <div class="drawer-title">4. MEASURED STATES & VALIDATION</div>
          <div class="num" style="font-size: 12px; margin-bottom: 6px; color: var(--text-muted);">
            Approx Ratio: <span id="val-approx-ratio" style="color: var(--signal-green); font-weight: 700;">--</span> | BF Opt: <span id="val-bf-cost">--</span> (<span id="val-bf-time">--</span>ms)
          </div>
          <div id="histogram-list" style="flex: 1; overflow-y: auto; font-family: var(--font-mono); font-size: 11.5px; line-height: 1.4;"></div>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-drawer-close')?.addEventListener('click', () => {
      this.toggle(false);
    });

    this.container.querySelector('#btn-drawer-solve-now')?.addEventListener('click', () => {
      if (this.onSolveNow) {
        this.onSolveNow();
        this.startPacedPlayback();
      }
    });

    this.container.querySelector('#btn-drawer-skip')?.addEventListener('click', () => {
      this.skipToResult();
    });

    this.container.querySelectorAll('.btn-drawer-speed').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.container.querySelectorAll('.btn-drawer-speed').forEach(b => b.classList.remove('active'));
        const target = e.target as HTMLElement;
        target.classList.add('active');
        this.playbackSpeed = parseFloat(target.getAttribute('data-spd') || '1.0');
      });
    });
  }

  public toggle(force?: boolean) {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    if (this.isOpen) {
      this.container.classList.add('open');
      if (this.currentSolve) this.renderSolve(this.currentSolve);
    } else {
      this.container.classList.remove('open');
      if (this.playbackTimer) clearInterval(this.playbackTimer);
    }
  }

  public updateSolve(solveData: SolvePayload) {
    this.currentSolve = solveData;
    if (this.isOpen) {
      this.renderSolve(solveData);
    }
  }

  public startPacedPlayback() {
    if (this.playbackTimer) clearInterval(this.playbackTimer);
    this.playbackPhase = 1;
    this.updatePhaseVisuals();

    const phaseDuration = 2000 / this.playbackSpeed; // 2s per phase = 8s total
    this.playbackTimer = window.setInterval(() => {
      if (this.playbackPhase < 4) {
        this.playbackPhase++;
        this.updatePhaseVisuals();
      } else {
        if (this.playbackTimer) clearInterval(this.playbackTimer);
      }
    }, phaseDuration);
  }

  public skipToResult() {
    if (this.playbackTimer) clearInterval(this.playbackTimer);
    this.playbackPhase = 4;
    this.updatePhaseVisuals();
  }

  private updatePhaseVisuals() {
    const narrator = document.getElementById('drawer-narrator');
    const captions = [
      "",
      "Phase 1/4: Sensor readings formulate 12x12 QUBO cost matrix...",
      "Phase 2/4: Parameterized QAOA cost and mixer gates sweep across 12-qubit ring...",
      "Phase 3/4: Classical COBYLA optimizer traces descending energy landscape...",
      "Phase 4/4: Measurement complete. Optimal bitstring selected and safety-validated."
    ];

    if (narrator) narrator.innerText = captions[this.playbackPhase] || captions[4];

    // Highlight active column
    for (let c = 1; c <= 4; c++) {
      const col = document.getElementById(`drawer-col-${c}`);
      if (col) {
        col.style.opacity = c <= this.playbackPhase ? '1.0' : '0.35';
      }
    }
  }

  private renderSolve(s: SolvePayload) {
    const epochBadge = document.getElementById('drawer-epoch-badge');
    if (epochBadge) epochBadge.innerText = `EPOCH #${s.epoch}`;

    const methodBadge = document.getElementById('drawer-method-badge');
    if (methodBadge) methodBadge.innerText = s.used_method;

    // Col 2 values
    const qEl = document.getElementById('val-qubits');
    if (qEl) qEl.innerText = `${s.qaoa.num_qubits || 12}`;
    const dEl = document.getElementById('val-depth');
    if (dEl) dEl.innerText = `${s.qaoa.circuit_depth || 2}`;
    const gEl = document.getElementById('val-gates');
    if (gEl) {
      const g = s.qaoa.gate_counts || {};
      gEl.innerText = Object.entries(g).map(([k, v]) => `${k}:${v}`).join(' ') || 'H:12 RZ:12 CX:18';
    }

    // Col 3 values
    const cEl = document.getElementById('val-qaoa-cost');
    if (cEl) cEl.innerText = `${s.qaoa.best_cost.toFixed(1)}`;
    const itEl = document.getElementById('val-iters');
    if (itEl) itEl.innerText = `${s.qaoa.optimizer_iterations || s.qaoa.optimizer_trace.length}`;

    // Col 4 values
    const arEl = document.getElementById('val-approx-ratio');
    if (arEl) arEl.innerText = `${(s.qaoa.approximation_ratio || 1.0).toFixed(2)}`;
    const bfCost = document.getElementById('val-bf-cost');
    if (bfCost) bfCost.innerText = `${s.brute_force.best_cost.toFixed(1)}`;
    const bfTime = document.getElementById('val-bf-time');
    if (bfTime) bfTime.innerText = `${s.brute_force.wall_clock_ms.toFixed(1)}`;

    this.drawQuboHeatmap(s.qubo_matrix);
    this.drawQubitRing(s.qaoa.num_qubits || 12);
    this.drawOptimizerTrace(s.qaoa.optimizer_trace);
    this.renderHistogram(s.qaoa.histogram, s.qaoa.best_bitstring, s.brute_force.best_bitstring);
  }

  private drawQuboHeatmap(matrix: number[][]) {
    const canvas = document.getElementById('qubo-canvas') as HTMLCanvasElement;
    if (!canvas || !matrix || !matrix.length) return;
    const ctx = canvas.getContext('2d')!;
    const n = matrix.length;
    const cellSize = Math.floor(canvas.width / n);

    ctx.fillStyle = '#14110F';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let maxAbs = 1.0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        maxAbs = Math.max(maxAbs, Math.abs(matrix[i][j] || 0));
      }
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const val = matrix[i][j] || 0;
        const norm = Math.min(1.0, Math.abs(val) / maxAbs);
        if (val > 0) {
          ctx.fillStyle = `rgba(242, 163, 58, ${0.15 + norm * 0.85})`; // Amber penalty
        } else if (val < 0) {
          ctx.fillStyle = `rgba(159, 216, 255, ${0.15 + norm * 0.85})`; // Ice-blue reward
        } else {
          ctx.fillStyle = '#1D1915';
        }
        ctx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }

  private drawQubitRing(numQubits: number) {
    const canvas = document.getElementById('qubit-ring-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#14110F';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = 70;

    // Draw coupling ring lines
    ctx.strokeStyle = 'rgba(159, 216, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Cross coupling entanglements
    ctx.strokeStyle = 'rgba(79, 163, 217, 0.35)';
    ctx.setLineDash([2, 4]);
    for (let i = 0; i < numQubits; i += 2) {
      const a1 = (i / numQubits) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 3) / numQubits) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw individual Qubit nodes
    for (let i = 0; i < numQubits; i++) {
      const angle = (i / numQubits) * Math.PI * 2 - Math.PI / 2;
      const qx = cx + Math.cos(angle) * r;
      const qy = cy + Math.sin(angle) * r;

      ctx.fillStyle = '#1D1915';
      ctx.strokeStyle = '#9FD8FF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(qx, qy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#EDE4D3';
      ctx.font = 'bold 9px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`q${i}`, qx, qy);
    }
  }

  private drawOptimizerTrace(trace: { iteration: number; energy: number }[]) {
    const canvas = document.getElementById('optimizer-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#14110F';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!trace || !trace.length) return;

    const pad = 24;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;

    const energies = trace.map(t => t.energy);
    const minE = Math.min(...energies);
    const maxE = Math.max(...energies, minE + 1.0);

    // Axes
    ctx.strokeStyle = '#383028';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, canvas.height - pad);
    ctx.lineTo(canvas.width - pad, canvas.height - pad);
    ctx.stroke();

    // Trace line
    ctx.strokeStyle = '#9FD8FF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < trace.length; i++) {
      const x = pad + (i / Math.max(1, trace.length - 1)) * w;
      const y = canvas.height - pad - ((trace[i].energy - minE) / (maxE - minE)) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Data points
    for (let i = 0; i < trace.length; i++) {
      const x = pad + (i / Math.max(1, trace.length - 1)) * w;
      const y = canvas.height - pad - ((trace[i].energy - minE) / (maxE - minE)) * h;
      ctx.fillStyle = '#EDE4D3';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderHistogram(histogram: any[], bestBit: string, optBit: string) {
    const listEl = document.getElementById('histogram-list');
    if (!listEl) return;

    if (!histogram || !histogram.length) {
      listEl.innerHTML = '<div style="color: var(--text-dim); padding: 10px;">No sampled states available.</div>';
      return;
    }

    listEl.innerHTML = histogram.slice(0, 7).map(h => {
      const isChosen = h.bitstring === bestBit;
      const isGlobalOpt = h.bitstring === optBit;
      const tag = isGlobalOpt ? '<span style="color: var(--signal-green); font-weight: 700;"> [GLOBAL OPT]</span>' : '';
      const chosenTag = isChosen ? '<span style="color: var(--accent-quantum); font-weight: 700;"> [CHOSEN]</span>' : '';

      return `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1D1915;">
          <span>${h.bitstring}${chosenTag}${tag}</span>
          <span style="color: var(--text-muted);">${(h.probability * 100).toFixed(1)}% | ${h.cost.toFixed(1)}</span>
        </div>
      `;
    }).join('');
  }
}
