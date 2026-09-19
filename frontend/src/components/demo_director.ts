export interface DemoScriptStep {
  timeSec: number;
  title: string;
  caption: string;
  action?: () => void;
}

export class DemoDirector {
  public isRunning: boolean = false;
  private currentStepIndex: number = 0;
  private timerId: number | null = null;
  private bannerEl: HTMLElement | null = null;
  private apiCallbacks: {
    triggerSurge: () => void;
    triggerAccident: () => void;
    dispatchAmbulance: () => void;
    setWeather: (w: string) => void;
    killQuantum: (k: boolean) => void;
    openSolverDrawer: () => void;
    openScoreboard: () => void;
  };

  constructor(bannerContainer: HTMLElement, callbacks: any) {
    this.bannerEl = bannerContainer;
    this.apiCallbacks = callbacks;
  }

  public start() {
    this.isRunning = true;
    this.currentStepIndex = 0;
    this.runStep();
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId) clearTimeout(this.timerId);
    if (this.bannerEl) this.bannerEl.style.display = 'none';
  }

  private getScript(): DemoScriptStep[] {
    return [
      {
        timeSec: 0,
        title: "PHASE 1: BASELINE DYNAMICS",
        caption: "District running under deterministic IDM traffic. Six junctions coordinating via hybrid quantum-classical epochs.",
        action: () => {}
      },
      {
        timeSec: 15,
        title: "PHASE 2: TRAFFIC SURGE (DEMAND X2.5)",
        caption: "Sudden evening rush injected at Clock Tower (J1). Queues build rapidly along Tower-Market Arterial.",
        action: () => this.apiCallbacks.triggerSurge()
      },
      {
        timeSec: 35,
        title: "PHASE 3: QUANTUM SOLVER DRAWER",
        caption: "Inspecting live 12-qubit QAOA solve: sensor readings formulate QUBO matrix, COBYLA optimizer traces energy descent.",
        action: () => this.apiCallbacks.openSolverDrawer()
      },
      {
        timeSec: 55,
        title: "PHASE 4: ROAD ACCIDENT & HAZARD",
        caption: "Accident reported on Market-Bus Stand (J2-J3). Capacity halved, traffic rerouting around congestion.",
        action: () => this.apiCallbacks.triggerAccident()
      },
      {
        timeSec: 75,
        title: "PHASE 5: EMERGENCY GREEN CORRIDOR",
        caption: "Ambulance dispatched from Hospital Gate (J4) to Highway Accident (J3). Wave of green lights runs ahead clearing queues.",
        action: () => this.apiCallbacks.dispatchAmbulance()
      },
      {
        timeSec: 105,
        title: "PHASE 6: MONSOON RAIN & UNDERPASS FLOOD",
        caption: "Heavy rain strikes district. Mill Underpass floods and closes. QUBO weights automatically adapt to safety-first mode.",
        action: () => this.apiCallbacks.setWeather("heavy_rain")
      },
      {
        timeSec: 135,
        title: "PHASE 7: KILL QUANTUM SERVICE DRILL",
        caption: "Simulating sudden QPU outage. Classical safety fallback chain instantly takes over with zero vehicle disruption.",
        action: () => this.apiCallbacks.killQuantum(true)
      },
      {
        timeSec: 160,
        title: "PHASE 8: SCOREBOARD & HONEST LIMITS",
        caption: "Multi-seed benchmark summary showing measured gains in queue lengths, wait times, fuel, and CO2.",
        action: () => this.apiCallbacks.openScoreboard()
      }
    ];
  }

  private runStep() {
    if (!this.isRunning) return;
    const script = this.getScript();
    if (this.currentStepIndex >= script.length) {
      this.stop();
      return;
    }

    const step = script[this.currentStepIndex];
    if (this.bannerEl) {
      this.bannerEl.style.display = 'flex';
      this.bannerEl.innerHTML = `
        <span class="badge badge-amber" style="font-weight: 600;">DIRECTOR: ${step.title}</span>
        <span>${step.caption}</span>
        <button id="btn-director-skip" class="btn-action" style="padding: 2px 8px; margin-left: 12px;">STOP TOUR</button>
      `;
      this.bannerEl.querySelector('#btn-director-skip')?.addEventListener('click', () => this.stop());
    }

    if (step.action) step.action();

    const nextStep = script[this.currentStepIndex + 1];
    const duration = nextStep ? (nextStep.timeSec - step.timeSec) * 1000 : 20000;

    this.currentStepIndex++;
    this.timerId = window.setTimeout(() => {
      this.runStep();
    }, duration);
  }
}
