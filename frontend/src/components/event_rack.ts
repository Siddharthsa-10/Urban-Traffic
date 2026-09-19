export class EventRack {
  private container: HTMLElement;
  public onAmbulanceClick?: () => void;
  public onCongestionToggle?: (active: boolean) => void;
  public onAccidentToggle?: (active: boolean) => void;
  public onClosureToggle?: (active: boolean) => void;
  public onWeatherChange?: (weather: string) => void;
  public onOutageToggle?: (active: boolean) => void;

  private congestionActive: boolean = false;
  private accidentActive: boolean = false;
  private closureActive: boolean = false;
  private outageActive: boolean = false;
  private currentWeather: string = "CLEAR";

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div>
        <div class="event-group-title">EMERGENCY CORRIDOR</div>
        <div class="event-card">
          <button class="event-btn ambulance" id="btn-dispatch-amb">
            <span>DISPATCH AMBULANCE</span>
            <span>+</span>
          </button>
          <div class="event-desc">Click origin and destination on map to deploy green corridor.</div>
        </div>
      </div>

      <div>
        <div class="event-group-title">DYNAMIC EVENTS</div>
        <div class="event-card">
          <button class="event-btn" id="btn-congestion">
            <span>Sudden Congestion</span>
            <span id="txt-status-cong">OFF</span>
          </button>
          <div class="event-desc">Triples inflow at Clock Tower (J1) entry point.</div>
        </div>

        <div class="event-card">
          <button class="event-btn" id="btn-accident">
            <span>Accident Blockage</span>
            <span id="txt-status-acc">OFF</span>
          </button>
          <div class="event-desc">Reduces Market Narrow Lane (J2-J4) capacity by 65%.</div>
        </div>

        <div class="event-card">
          <button class="event-btn" id="btn-closure">
            <span>Road Closure</span>
            <span id="txt-status-close">OFF</span>
          </button>
          <div class="event-desc">Closes Underpass (J3-J4) edge; forces traffic reroute.</div>
        </div>
      </div>

      <div>
        <div class="event-group-title">WEATHER CONDITIONS</div>
        <div class="event-card">
          <button class="event-btn" id="btn-weather">
            <span id="btn-weather-label">Clear Sky</span>
            <span>CYCLE</span>
          </button>
          <div class="event-desc">Changes braking loss, pedestrian speed, and flooded links.</div>
        </div>
      </div>

      <div>
        <div class="event-group-title">FAIL-SAFE VALIDATION</div>
        <div class="event-card">
          <button class="event-btn" id="btn-outage">
            <span>Simulate Quantum Outage</span>
            <span id="txt-status-outage">OFF</span>
          </button>
          <div class="event-desc">Tests classical fallback chain live without traffic snap.</div>
        </div>
      </div>

      <div class="shift-log-box" id="shift-log-container">
        <div style="color: var(--color-paper-muted); margin-bottom: 6px; font-weight: 600;">DISPATCHER SHIFT LOG</div>
        <div id="shift-log-entries"></div>
      </div>
    `;

    this.setupListeners();
  }

  private setupListeners() {
    // Ambulance
    this.container.querySelector("#btn-dispatch-amb")!.addEventListener("click", () => {
      if (this.onAmbulanceClick) this.onAmbulanceClick();
    });

    // Congestion
    const btnCong = this.container.querySelector<HTMLButtonElement>("#btn-congestion")!;
    btnCong.addEventListener("click", () => {
      this.congestionActive = !this.congestionActive;
      btnCong.classList.toggle("active", this.congestionActive);
      this.container.querySelector("#txt-status-cong")!.textContent = this.congestionActive ? "ON (2.5x)" : "OFF";
      if (this.onCongestionToggle) this.onCongestionToggle(this.congestionActive);
    });

    // Accident
    const btnAcc = this.container.querySelector<HTMLButtonElement>("#btn-accident")!;
    btnAcc.addEventListener("click", () => {
      this.accidentActive = !this.accidentActive;
      btnAcc.classList.toggle("active", this.accidentActive);
      this.container.querySelector("#txt-status-acc")!.textContent = this.accidentActive ? "ACTIVE" : "OFF";
      if (this.onAccidentToggle) this.onAccidentToggle(this.accidentActive);
    });

    // Closure
    const btnClose = this.container.querySelector<HTMLButtonElement>("#btn-closure")!;
    btnClose.addEventListener("click", () => {
      this.closureActive = !this.closureActive;
      btnClose.classList.toggle("active", this.closureActive);
      this.container.querySelector("#txt-status-close")!.textContent = this.closureActive ? "CLOSED" : "OFF";
      if (this.onClosureToggle) this.onClosureToggle(this.closureActive);
    });

    // Weather
    const btnWeather = this.container.querySelector<HTMLButtonElement>("#btn-weather")!;
    btnWeather.addEventListener("click", () => {
      const weatherCycle = ["CLEAR", "RAIN", "HEAVY_RAIN", "FOG"];
      const nextIdx = (weatherCycle.indexOf(this.currentWeather) + 1) % weatherCycle.length;
      this.currentWeather = weatherCycle[nextIdx];
      this.container.querySelector("#btn-weather-label")!.textContent = this.currentWeather.replace("_", " ");
      if (this.onWeatherChange) this.onWeatherChange(this.currentWeather);
    });

    // Outage
    const btnOutage = this.container.querySelector<HTMLButtonElement>("#btn-outage")!;
    btnOutage.addEventListener("click", () => {
      this.outageActive = !this.outageActive;
      btnOutage.classList.toggle("active", this.outageActive);
      this.container.querySelector("#txt-status-outage")!.textContent = this.outageActive ? "OUTAGE" : "OFF";
      if (this.onOutageToggle) this.onOutageToggle(this.outageActive);
    });
  }

  public updateShiftLog(entries: Array<{ time: string; text: string }>) {
    const list = document.getElementById("shift-log-entries");
    if (!list) return;
    list.innerHTML = entries
      .map(
        (e) => `
        <div class="shift-log-entry">
          <span class="shift-log-time">${e.time}</span>
          <span>${e.text}</span>
        </div>`
      )
      .join("");
  }
}
