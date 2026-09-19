export class TimeControls {
  private container: HTMLElement;
  public onTimeChange?: (paused: boolean, speed: number, step1s: boolean) => void;
  public onToggleSolverDrawer?: () => void;
  public onToggleScoreboardModal?: () => void;
  public onToggleLimitsModal?: () => void;
  public onToggleDemoSafe?: () => void;

  private isPaused: boolean = false;
  private currentSpeed: number = 1.0;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div class="time-controls">
        <button class="btn-ctrl" id="btn-pause-play">Pause</button>
        <button class="btn-ctrl" id="btn-step-1s">Step 1s</button>
        <div style="width: 1px; height: 20px; background: var(--color-panel-border); margin: 0 4px;"></div>
        <button class="btn-ctrl active" data-speed="1">1×</button>
        <button class="btn-ctrl" data-speed="2">2×</button>
        <button class="btn-ctrl" data-speed="4">4×</button>
        <button class="btn-ctrl" data-speed="8">8×</button>
      </div>

      <div class="bottom-actions">
        <button class="btn-ctrl" id="btn-open-solver" style="color: var(--color-quantum); border-color: var(--color-quantum-deep);">
          ⚡ Solver Drawer
        </button>
        <button class="btn-ctrl" id="btn-open-10seeds">10-Seed Scoreboard</button>
        <button class="btn-ctrl" id="btn-open-limits">Limits & Architecture</button>
        <button class="btn-ctrl" id="btn-open-demo-safe">Demo Safe</button>
      </div>
    `;

    this.setupListeners();
  }

  private setupListeners() {
    const btnPause = this.container.querySelector<HTMLButtonElement>("#btn-pause-play")!;
    btnPause.addEventListener("click", () => {
      this.isPaused = !this.isPaused;
      btnPause.textContent = this.isPaused ? "Play" : "Pause";
      btnPause.classList.toggle("active", this.isPaused);
      if (this.onTimeChange) this.onTimeChange(this.isPaused, this.currentSpeed, false);
    });

    this.container.querySelector("#btn-step-1s")!.addEventListener("click", () => {
      if (this.onTimeChange) this.onTimeChange(true, this.currentSpeed, true);
    });

    const speedBtns = this.container.querySelectorAll<HTMLButtonElement>("[data-speed]");
    speedBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        speedBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentSpeed = parseFloat(btn.getAttribute("data-speed") || "1");
        if (this.onTimeChange) this.onTimeChange(this.isPaused, this.currentSpeed, false);
      });
    });

    this.container.querySelector("#btn-open-solver")!.addEventListener("click", () => {
      if (this.onToggleSolverDrawer) this.onToggleSolverDrawer();
    });

    this.container.querySelector("#btn-open-10seeds")!.addEventListener("click", () => {
      if (this.onToggleScoreboardModal) this.onToggleScoreboardModal();
    });

    this.container.querySelector("#btn-open-limits")!.addEventListener("click", () => {
      if (this.onToggleLimitsModal) this.onToggleLimitsModal();
    });

    this.container.querySelector("#btn-open-demo-safe")!.addEventListener("click", () => {
      if (this.onToggleDemoSafe) this.onToggleDemoSafe();
    });
  }
}
