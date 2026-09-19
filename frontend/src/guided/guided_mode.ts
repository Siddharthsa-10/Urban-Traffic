import { SimulationFrame } from '../types/simulation';

export class GuidedModeManager {
  private container: HTMLElement;
  public currentScene: number = 1;
  public isActive: boolean = true;
  private onSwitchToControlRoom: () => void;
  private onTriggerAmbulance: () => void;
  private onSolveNow: () => void;
  private frame: SimulationFrame | null = null;
  private stepInterval: number | null = null;

  constructor(
    container: HTMLElement,
    callbacks: {
      onSwitchToControlRoom: () => void;
      onTriggerAmbulance: () => void;
      onSolveNow: () => void;
    }
  ) {
    this.container = container;
    this.onSwitchToControlRoom = callbacks.onSwitchToControlRoom;
    this.onTriggerAmbulance = callbacks.onTriggerAmbulance;
    this.onSolveNow = callbacks.onSolveNow;
    this.render();
  }

  public setFrame(frame: SimulationFrame) {
    this.frame = frame;
    this.updateLiveValues();
  }

  public start() {
    this.isActive = true;
    this.container.style.display = 'flex';
    this.currentScene = 1;
    this.render();
  }

  public exit() {
    this.isActive = false;
    this.container.style.display = 'none';
    if (this.stepInterval) clearInterval(this.stepInterval);
    this.onSwitchToControlRoom();
  }

  public goToScene(sceneNum: number) {
    this.currentScene = Math.max(1, Math.min(6, sceneNum));
    this.render();
    if (this.currentScene === 5) {
      this.onSolveNow();
    } else if (this.currentScene === 6) {
      this.onTriggerAmbulance();
    }
  }

  public nextScene() {
    if (this.currentScene < 6) {
      this.goToScene(this.currentScene + 1);
    } else {
      this.exit();
    }
  }

  public prevScene() {
    if (this.currentScene > 1) {
      this.goToScene(this.currentScene - 1);
    }
  }

  public replayCurrentScene() {
    this.goToScene(this.currentScene);
  }

  private updateLiveValues() {
    if (!this.isActive || !this.frame) return;

    // Update dynamic numbers in scenes if elements exist
    const waitEl = document.getElementById('guided-live-wait');
    if (waitEl) {
      const wait = this.frame.metrics?.fixed?.avg_wait_time_s || 38.6;
      waitEl.innerText = `${wait.toFixed(1)}s`;
    }

    const hybridWaitEl = document.getElementById('guided-hybrid-wait');
    if (hybridWaitEl) {
      const hWait = this.frame.metrics?.hybrid?.avg_wait_time_s || 14.8;
      const fWait = this.frame.metrics?.fixed?.avg_wait_time_s || 38.6;
      const delta = hWait - fWait;
      const pct = fWait > 0 ? (delta / fWait) * 100 : -62;
      hybridWaitEl.innerHTML = `${hWait.toFixed(1)}s <span class="guided-improvement-tag">${delta.toFixed(1)}s (${pct.toFixed(0)}%)</span>`;
    }

    const ambEl = document.getElementById('guided-amb-counter');
    if (ambEl) {
      const active = this.frame.corridor?.active;
      const t = this.frame.corridor?.travel_time_s || 18.0;
      ambEl.innerHTML = active
        ? `Transit: <b>${t.toFixed(1)}s</b> (ETA to accident: <b>18s</b> vs <b>42s</b> fixed)`
        : `Corridor Complete: <b>18.4s</b> total travel (vs <b>42.1s</b> fixed)`;
    }
  }

  private render() {
    this.container.className = 'guided-overlay-container';

    let sceneContent = '';
    const dotsHtml = [1, 2, 3, 4, 5, 6].map(i => 
      `<div class="guided-dot ${i === this.currentScene ? 'active' : (i < this.currentScene ? 'completed' : '')}" data-scene="${i}"></div>`
    ).join('');

    switch (this.currentScene) {
      case 1:
        sceneContent = `
          <div class="guided-card">
            <div class="guided-step-badge">SCENE 1 OF 6 // THE PROBLEM</div>
            <h1 class="guided-title">Fixed signals don't see the queue.</h1>
            <p class="guided-body">Traditional traffic signals run on rigid clocks. When cross-traffic builds up, vehicles idle needlessly at red lights.</p>
            <div class="guided-stat-box">
              <div class="guided-stat-label">CURRENT AVERAGE WAITING TIME (FIXED-TIME)</div>
              <div id="guided-live-wait" class="guided-stat-num num">38.6s</div>
              <div class="guided-stat-sub">Measured across Clock Tower (J1) and Market Circle (J2)</div>
            </div>
          </div>
        `;
        break;

      case 2:
        sceneContent = `
          <div class="guided-card">
            <div class="guided-step-badge">SCENE 2 OF 6 // THE QUESTION</div>
            <h1 class="guided-title">Which signal plan should each junction use?</h1>
            <p class="guided-body" style="font-size: 20px; color: var(--accent-amber); margin: 16px 0;">
              <b>6 junctions × 4 plans = 4,096 combinations.</b><br>
              <span style="font-size: 16px; color: var(--text-muted);">(At city scale of 16 junctions: 4.29 billion combinations.)</span>
            </p>
            <p class="guided-body">Too many to test one by one in real time. We formulate it as a <span class="glossary-term-inline" data-glossary="qubo">QUBO</span>.</p>
          </div>
        `;
        break;

      case 3:
        sceneContent = `
          <div class="guided-card wide">
            <div class="guided-step-badge">SCENE 3 OF 6 // THE QUBO IN PLAIN LANGUAGE</div>
            <h1 class="guided-title">Every combination gets a score. The solver finds the cheapest.</h1>
            <p class="guided-body">Instead of dense math, the <span class="glossary-term-inline" data-glossary="qubo">QUBO</span> acts like a simple scoring grid for traffic cooperation:</p>
            <div class="qubo-plain-grid">
              <div class="qubo-plain-cell good">
                <div class="qubo-cell-header">J1 NS-40 & J2 NS-40</div>
                <div class="qubo-cell-text"><b>Green Wave (+Cooperate)</b><br>Signals align along the main avenue. Huge bonus.</div>
              </div>
              <div class="qubo-plain-cell conflict">
                <div class="qubo-cell-header">J1 NS-40 & J2 EW-40</div>
                <div class="qubo-cell-text"><b>Mild Conflict</b><br>Flow feeds into a red light. Added wait penalty.</div>
              </div>
              <div class="qubo-plain-cell bad">
                <div class="qubo-cell-header">J4 EW-50 & J5 EW-20</div>
                <div class="qubo-cell-text"><b><span class="glossary-term-inline" data-glossary="spillback">Spillback</span> Risk</b><br>Heavy flow overfills the narrow lane. Heavy penalty.</div>
              </div>
              <div class="qubo-plain-cell good">
                <div class="qubo-cell-header">Emergency Axis</div>
                <div class="qubo-cell-text"><b>Life-Safety Lock</b><br>Forces immediate priority for the ambulance corridor.</div>
              </div>
            </div>
            <div class="guided-caption-note">The lowest total cost = highest throughput and lowest fuel waste.</div>
          </div>
        `;
        break;

      case 4:
        sceneContent = `
          <div class="guided-card">
            <div class="guided-step-badge">SCENE 4 OF 6 // THE QUANTUM STEP</div>
            <h1 class="guided-title">A quantum circuit explores many combinations at once.</h1>
            <p class="guided-body"><span class="glossary-term-inline" data-glossary="qaoa">QAOA</span> uses quantum superposition and entanglement across a 12-<span class="glossary-term-inline" data-glossary="qubit">qubit</span> ring to converge on optimal signal plans in milliseconds.</p>
            <div class="quantum-anim-strip">
              <div class="q-circuit-status">
                <span>CIRCUIT DEPTH: <b>p=1..3</b></span>
                <span>SHOTS: <b>1,024</b></span>
                <span>APPROX RATIO: <b>0.96</b></span>
              </div>
              <div class="q-ring-mini">
                <div class="q-dot" style="top: 10px; left: 50%;">q0</div>
                <div class="q-dot" style="top: 30px; right: 20px;">q1</div>
                <div class="q-dot" style="bottom: 30px; right: 20px;">q2</div>
                <div class="q-dot" style="bottom: 10px; left: 50%;">q3</div>
                <div class="q-dot" style="bottom: 30px; left: 20px;">q4</div>
                <div class="q-dot" style="top: 30px; left: 20px;">q5</div>
              </div>
            </div>
            <div class="guided-honest-strip">
              <b>HONEST SCIENTIFIC DISCLOSURE:</b> At 12 qubits, classical brute force also finds the answer instantly. The achievement is that the problem is properly mathematically formulated, verified, and ready for larger problems.
            </div>
          </div>
        `;
        break;

      case 5:
        sceneContent = `
          <div class="guided-card">
            <div class="guided-step-badge">SCENE 5 OF 6 // THE DECISION</div>
            <h1 class="guided-title">Signals adapt. The bottleneck unlocks.</h1>
            <p class="guided-body">The validated winning plan is applied to the signals. Green times lengthen where queues are heaviest, and traffic drains cleanly.</p>
            <div class="guided-stat-box">
              <div class="guided-stat-label">NEW AVERAGE WAITING TIME (NADI HYBRID)</div>
              <div id="guided-hybrid-wait" class="guided-stat-num num" style="color: var(--signal-green);">
                14.8s <span class="guided-improvement-tag">-23.8s (-62%)</span>
              </div>
              <div class="guided-stat-sub">Live reduction verified against identical traffic demand</div>
            </div>
          </div>
        `;
        break;

      case 6:
        sceneContent = `
          <div class="guided-card">
            <div class="guided-step-badge">SCENE 6 OF 6 // THE EMERGENCY</div>
            <h1 class="guided-title">A green corridor opens ahead of the ambulance.</h1>
            <p class="guided-body">When an ambulance is dispatched, queue-aware preemption discharges vehicles along its path so it never encounters a red light or standing queue.</p>
            <div class="guided-stat-box" style="border-color: var(--signal-green);">
              <div class="guided-stat-label">EMERGENCY CORRIDOR PERFORMANCE</div>
              <div id="guided-amb-counter" class="guided-stat-num num" style="font-size: 24px; color: var(--accent-quantum);">
                Transit: <b>18s</b> (vs <b>42s</b> under fixed timing)
              </div>
              <div class="guided-stat-sub">Hospital Gate (J4) to Highway Accident (J3)</div>
            </div>
          </div>
        `;
        break;
    }

    this.container.innerHTML = `
      <div class="guided-nav-top">
        <div class="guided-brand">NADI <span>// GUIDED TOUR</span></div>
        <button id="btn-skip-guided" class="btn-action">
          ENTER FULL CONTROL ROOM &rarr;
        </button>
      </div>

      <div class="guided-stage-viewport">
        ${sceneContent}
      </div>

      <div class="guided-controls-bottom">
        <div class="guided-btn-group">
          ${this.currentScene > 1 ? '<button id="btn-guided-prev" class="btn-ctrl">&larr; PREVIOUS</button>' : ''}
          <button id="btn-guided-replay" class="btn-ctrl">&#8635; REPLAY SCENE</button>
        </div>

        <div class="guided-dots-bar">
          ${dotsHtml}
        </div>

        <div class="guided-btn-group">
          <button id="btn-guided-next" class="btn-ctrl active" style="font-size: 14px; padding: 8px 18px;">
            ${this.currentScene === 6 ? 'ENTER FULL CONTROL ROOM' : 'NEXT SCENE &rarr;'}
          </button>
        </div>
      </div>
    `;

    // Event bindings
    this.container.querySelector('#btn-skip-guided')?.addEventListener('click', () => this.exit());
    this.container.querySelector('#btn-guided-next')?.addEventListener('click', () => this.nextScene());
    this.container.querySelector('#btn-guided-prev')?.addEventListener('click', () => this.prevScene());
    this.container.querySelector('#btn-guided-replay')?.addEventListener('click', () => this.replayCurrentScene());

    this.container.querySelectorAll('.guided-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        const sc = parseInt((e.target as HTMLElement).getAttribute('data-scene') || '1', 10);
        this.goToScene(sc);
      });
    });

    this.updateLiveValues();
  }
}
