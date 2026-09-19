export class GuidedDemo {
  private container: HTMLElement;
  private currentScene: number = 1;
  public onStepAction?: (step: number) => void;
  public onFinish?: () => void;

  private scenes = [
    {
      step: 1,
      label: "Step 1 of 11 · Normal Traffic",
      heading: "Municipal baseline with pre-timed cycles.",
      body: "District intersections (Clock Tower, Market Circle, Hospital Gate, Bus Stand) operate with rigid 35s splits. Free-flow traffic holds reasonable queue balance, but cannot adapt to surges.",
    },
    {
      step: 2,
      label: "Step 2 of 11 · Sudden Congestion",
      heading: "Sudden traffic surge detected.",
      body: "Inflow demand surges by +186% at Clock Tower (J1). Queues begin to accumulate rapidly along the North-South arterial approach.",
    },
    {
      step: 3,
      label: "Step 3 of 11 · Predictive Horizon",
      heading: "Prediction engine identifies future congestion.",
      body: "Forecasting engine analyzes upstream vehicle arrivals and detects impending queue growth (8 → 21 vehicles within 45s) and impending arterial spillback.",
    },
    {
      step: 4,
      label: "Step 4 of 11 · Optimization Triggered",
      heading: "Combinatorial state space generated.",
      body: "The optimizer formulates an 8-qubit upper-triangular QUBO cost matrix encoding queue wait penalties, spillback risk, and platoon progression rewards across 256 candidate plans.",
    },
    {
      step: 5,
      label: "Step 5 of 11 · Classical Strategy",
      heading: "Classical baselines evaluated.",
      body: "Exact brute force search evaluates all 256 states in 0.08ms; Simulated Annealing completes in ~5ms, establishing our ground-truth baseline.",
    },
    {
      step: 6,
      label: "Step 6 of 11 · QAOA Simulation",
      heading: "QAOA simulation on Qiskit Aer.",
      body: "The quantum approximate optimization algorithm (depth p=1, 8 qubits, transpiled into Hadamards, RZZ couplings, and RX mixers) samples the lowest-energy timing configuration.",
    },
    {
      step: 7,
      label: "Step 7 of 11 · Strategy Comparison",
      heading: "Objective and tradeoff evaluation.",
      body: "Candidate plans are compared side-by-side. The QAOA candidate places greater weight on network-wide queue balance and emergency readiness, achieving an objective score of 0.184.",
    },
    {
      step: 8,
      label: "Step 8 of 11 · Safety Validation",
      heading: "Fail-safe validation pipeline.",
      body: "Before any plan touches active controllers, it passes through 6 strict safety gates: minimum greens (>= 15s), pedestrian clearance (>= 7s), conflict elimination, and downstream capacity bounds.",
    },
    {
      step: 9,
      label: "Step 9 of 11 · Adaptive Plan Applied",
      heading: "Dynamic signal phase reallocation.",
      body: "North-South green duration is extended by +12s at Clock Tower. Signals transition smoothly through all-red clearance without jarring cycle-snaps.",
    },
    {
      step: 10,
      label: "Step 10 of 11 · Traffic Recovery",
      heading: "Queue dissipation & green wave alignment.",
      body: "Approaching platoon clears before spillback occurs. Average vehicle wait time drops by 28%, and network throughput increases by 34%.",
    },
    {
      step: 11,
      label: "Step 11 of 11 · Decision Stored",
      heading: "Explainability recorded in MongoDB audit log.",
      body: "The complete 11-point decision explanation, before/after metrics, resilience index, and confidence score are permanently recorded into the MongoDB audit trail.",
    },
  ];

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }

  public start() {
    this.currentScene = 1;
    this.container.classList.add("active");
    this.updateCard();
    if (this.onStepAction) this.onStepAction(1);
  }

  public close() {
    this.container.classList.remove("active");
    if (this.onFinish) this.onFinish();
  }

  private render() {
    this.container.innerHTML = `
      <div class="guided-demo-card" style="width: 580px; background: #14110F; border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 22px; box-shadow: 0 16px 40px rgba(0,0,0,0.85); color: var(--color-paper);">
        <div class="guided-demo-scene-label" id="demo-scene-label" style="font-size: 11px; font-family: var(--font-mono); color: var(--color-quantum); letter-spacing: 0.08em;"></div>
        <div class="guided-demo-heading" id="demo-scene-heading" style="font-size: 18px; font-weight: 700; color: var(--color-paper); margin-top: 6px;"></div>
        <div class="guided-demo-body" id="demo-scene-body" style="font-size: 13px; color: var(--color-paper-muted); margin-top: 10px; line-height: 1.5;"></div>

        <div class="guided-demo-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; border-top: 1px solid var(--color-panel-border); padding-top: 14px;">
          <div class="guided-demo-dots" id="demo-dots" style="display: flex; gap: 4px;"></div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-cancel" id="btn-demo-skip" style="padding: 6px 14px;">Skip</button>
            <button class="btn-confirm" id="btn-demo-next" style="padding: 6px 14px;">Next →</button>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector("#btn-demo-skip")!.addEventListener("click", () => this.close());
    this.container.querySelector("#btn-demo-next")!.addEventListener("click", () => {
      if (this.currentScene < this.scenes.length) {
        this.currentScene++;
        if (this.onStepAction) this.onStepAction(this.currentScene);
        this.updateCard();
      } else {
        this.close();
      }
    });
  }

  private updateCard() {
    const s = this.scenes[this.currentScene - 1];
    document.getElementById("demo-scene-label")!.textContent = s.label;
    document.getElementById("demo-scene-heading")!.textContent = s.heading;
    document.getElementById("demo-scene-body")!.textContent = s.body;

    const nextBtn = document.getElementById("btn-demo-next")!;
    nextBtn.textContent = this.currentScene === this.scenes.length ? "Finish Walkthrough" : "Next Step →";

    const dotsContainer = document.getElementById("demo-dots")!;
    dotsContainer.innerHTML = this.scenes
      .map(
        (_, idx) => `
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${
          idx + 1 === this.currentScene ? 'var(--color-quantum)' : 'rgba(237,228,211,0.2)'
        };"></div>
      `
      )
      .join('');
  }
}
