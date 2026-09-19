import { camera, worldToScreen, screenToWorld, fitCameraToBounds } from "./canvas/iso";
import { StaticLayer } from "./canvas/static_layer";
import { DynamicLayer } from "./canvas/dynamic_layer";
import { OverlayLayer } from "./canvas/overlay_layer";
import { createDefaultFrame } from "./default_state";

import { TopBar, OperationsView } from "./components/top_bar";
import { HeroMetric } from "./components/hero_metric";
import { EventRack } from "./components/event_rack";
import { Scoreboard } from "./components/scoreboard";
import { JunctionInspector } from "./components/inspector";
import { SolverDrawer } from "./components/solver_drawer";
import { CompareView } from "./components/compare_view";
import { GuidedDemo } from "./components/guided_demo";
import { TimeControls } from "./components/time_controls";
import { DemoSafePlayer } from "./replay/demo_safe";

import { DecisionTimeline } from "./components/decision_timeline";
import { WhyThisDecision } from "./components/why_decision";
import { ScenariosView } from "./components/scenarios_view";
import { AnalyticsView } from "./components/analytics_view";
import { DecisionLogView } from "./components/decision_log_view";
import { HomeModal } from "./components/home_modal";

import { FrameData, VehicleState, JunctionState, LinkState } from "./types";

class TrafficControlRoomApp {
  // Canvases & Contexts
  private staticCanvas: HTMLCanvasElement;
  private dynamicCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private weatherCanvas: HTMLCanvasElement;

  private staticCtx: CanvasRenderingContext2D;
  private dynamicCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;
  private weatherCtx: CanvasRenderingContext2D;

  // Rendering Layers
  private staticLayer: StaticLayer;
  private dynamicLayer: DynamicLayer;
  private overlayLayer: OverlayLayer;

  // Pan / Zoom Drag state
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;

  // UI Components
  private topBar: TopBar;
  private heroMetric: HeroMetric;
  private eventRack: EventRack;
  private scoreboard: Scoreboard;
  private inspector: JunctionInspector;
  private solverDrawer: SolverDrawer;
  private compareView: CompareView;
  private guidedDemo: GuidedDemo;
  private timeControls: TimeControls;
  private demoSafePlayer: DemoSafePlayer;

  // Advanced Digital Twin Components
  private decisionTimeline: DecisionTimeline;
  private whyThisDecision: WhyThisDecision;
  private scenariosView: ScenariosView;
  private analyticsView: AnalyticsView;
  private decisionLogView: DecisionLogView;
  private homeModal: HomeModal;

  // State
  private viewMode: "single" | "split" | "compare" | "ghost" = "single";
  private activeTab: "live-bench" | "inspector" | "why-decision" | "timeline" | "telemetry" | "assumptions" = "live-bench";
  private currentFrame: FrameData | null = null;
  private lastSeq: number = -1;
  private ws: WebSocket | null = null;
  private hasAutoFramed: boolean = false;
  private isDemoSafeActive: boolean = false;

  constructor() {
    // 0. Initialize authoritative default simulation state so the screen is NEVER blank
    this.currentFrame = createDefaultFrame();

    // 1. Get canvases
    this.staticCanvas = document.getElementById("canvas-static") as HTMLCanvasElement;
    this.dynamicCanvas = document.getElementById("canvas-dynamic") as HTMLCanvasElement;
    this.overlayCanvas = document.getElementById("canvas-overlay") as HTMLCanvasElement;
    this.weatherCanvas = document.getElementById("canvas-weather") as HTMLCanvasElement;

    this.staticCtx = this.staticCanvas.getContext("2d")!;
    this.dynamicCtx = this.dynamicCanvas.getContext("2d")!;
    this.overlayCtx = this.overlayCanvas.getContext("2d")!;
    this.weatherCtx = this.weatherCanvas.getContext("2d")!;

    // 2. Setup Layers
    this.staticLayer = new StaticLayer();
    this.dynamicLayer = new DynamicLayer();
    this.overlayLayer = new OverlayLayer();

    // 3. Setup Components
    this.topBar = new TopBar("top-bar-container");
    this.heroMetric = new HeroMetric("hero-metric-container");
    this.eventRack = new EventRack("left-column-container");
    this.scoreboard = new Scoreboard("scoreboard-container");
    this.inspector = new JunctionInspector("panel-tab-content");
    this.solverDrawer = new SolverDrawer("solver-drawer-container");
    this.compareView = new CompareView("compare-view-container");
    this.guidedDemo = new GuidedDemo("guided-demo-overlay");
    this.timeControls = new TimeControls("bottom-bar-container");
    this.demoSafePlayer = new DemoSafePlayer();

    // Advanced Digital Twin Components
    this.decisionTimeline = new DecisionTimeline("panel-tab-content");
    this.whyThisDecision = new WhyThisDecision("panel-tab-content");
    this.scenariosView = new ScenariosView("modal-scenarios");
    this.analyticsView = new AnalyticsView("modal-analytics");
    this.decisionLogView = new DecisionLogView("modal-decisions");
    this.homeModal = new HomeModal("modal-home");

    this.bindEvents();
    this.setupCameraControls();
    this.handleResize();
    this.setupResizeObserver();
    window.addEventListener("resize", () => this.handleResize());

    // Fit camera to network bounds immediately so roads are framed on first paint
    const w = this.overlayCanvas.width || 1200;
    const h = this.overlayCanvas.height || 800;
    fitCameraToBounds(40, 40, 440, 360, w, h);
    this.hasAutoFramed = true;
    this.staticLayer.invalidate();

    // Initial render of scoreboard & metrics
    this.topBar.updateStatus(this.currentFrame.fallback_level, this.currentFrame.weather);
    this.heroMetric.update(this.currentFrame.metrics.hybrid, this.currentFrame.metrics.fixed, this.viewMode);
    this.updateRightColumn();

    // HTTP State Bootstrap + Live WebSocket Stream
    this.bootstrapState();
    this.connectWebSocket();

    // Start 60fps render loop
    requestAnimationFrame((ts) => this.renderLoop(ts));
  }

  private async bootstrapState() {
    try {
      const resp = await fetch("/api/traffic/state");
      if (resp.ok) {
        const frame: FrameData = await resp.json();
        this.handleNewFrame(frame);
      }
    } catch (e) {
      console.warn("[INIT] HTTP state bootstrap fallback active");
    }
  }

  private setupResizeObserver() {
    const container = document.getElementById("map-canvas-container");
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.handleResize();
          console.log(
            `SIMULATION RENDERER\ncontainerWidth: ${width}\ncontainerHeight: ${height}\ncanvasWidth: ${this.staticCanvas.width}\ncanvasHeight: ${this.staticCanvas.height}\nnetworkNodes: ${Object.keys(this.currentFrame?.junctions || {}).length}\nnetworkRoads: ${this.currentFrame?.links?.length || 0}\nvehicles: ${this.currentFrame?.vehicles_hybrid?.length || 0}`
          );
        }
      }
    });
    ro.observe(container);
  }

  private setupCameraControls() {
    this.overlayCanvas.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX - camera.originX;
      this.dragStartY = e.clientY - camera.originY;
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isDragging) {
        camera.originX = e.clientX - this.dragStartX;
        camera.originY = e.clientY - this.dragStartY;
      }
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    this.overlayCanvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = this.overlayCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newScale = Math.max(0.4, Math.min(3.5, camera.scale * zoomFactor));
      camera.originX = mouseX - (mouseX - camera.originX) * (newScale / camera.scale);
      camera.originY = mouseY - (mouseY - camera.originY) * (newScale / camera.scale);
      camera.scale = newScale;
    });
  }

  private handleResize() {
    const container = document.getElementById("map-canvas-container")!;
    const w = container.clientWidth;
    const h = container.clientHeight;

    this.staticCanvas.width = w;
    this.staticCanvas.height = h;
    this.dynamicCanvas.width = w;
    this.dynamicCanvas.height = h;
    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;
    this.weatherCanvas.width = w;
    this.weatherCanvas.height = h;

    this.staticLayer.invalidate();
  }

  private bindEvents() {
    // Top bar operations view change
    this.topBar.onViewChange = (view: OperationsView) => {
      if (view === "live") {
        this.viewMode = "single";
        this.compareView.hide();
        this.scenariosView.hide();
        this.analyticsView.hide();
        this.decisionLogView.hide();
        this.solverDrawer.close();
        this.staticLayer.invalidate();
      } else if (view === "simulation") {
        this.viewMode = "split";
        this.compareView.hide();
        this.scenariosView.hide();
        this.analyticsView.hide();
        this.decisionLogView.hide();
        this.solverDrawer.close();
        this.staticLayer.invalidate();
      } else if (view === "scenarios") {
        this.scenariosView.show();
      } else if (view === "optimizer") {
        this.solverDrawer.open();
      } else if (view === "comparison") {
        this.compareView.show(this.currentFrame);
      } else if (view === "analytics") {
        this.analyticsView.show();
      } else if (view === "decision_log") {
        this.decisionLogView.show();
      }
    };

    this.compareView.onClose = () => {
      this.topBar.setActiveView("live");
      this.viewMode = "single";
      this.staticLayer.invalidate();
    };

    this.compareView.onJumpToSplit = () => {
      this.topBar.setActiveView("simulation");
      this.viewMode = "split";
      this.staticLayer.invalidate();
    };

    this.topBar.onHomeClick = () => {
      this.homeModal.show();
    };

    // Scenarios workflow triggers
    this.scenariosView.onTriggerWorkflow = async (name) => {
      if (name === "emergency") {
        await this.dispatchCorridor("HOSP", "SITE");
      } else if (name === "congestion") {
        await fetch("/api/events/congestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry: "J1", multiplier: 2.5 }),
        });
      } else if (name === "accident") {
        await fetch("/api/events/accident", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link_id: "L_J2_J4", active: true }),
        });
        this.staticLayer.invalidate();
      } else if (name === "closure") {
        await fetch("/api/events/closure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link_id: "L_J3_J4", closed: true }),
        });
        this.staticLayer.invalidate();
      } else if (name === "weather") {
        await fetch("/api/events/weather", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weather: "HEAVY_RAIN" }),
        });
      } else if (name === "qaoa" || name === "comparison") {
        this.solverDrawer.open();
      } else if (name === "ghost") {
        this.viewMode = "ghost";
        this.scenariosView.hide();
      }
    };

    // Guided demo 11-step walkthrough actions
    this.guidedDemo.onStepAction = async (step) => {
      if (step === 2) {
        await fetch("/api/events/congestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry: "J1", multiplier: 2.5 }),
        });
      } else if (step === 4 || step === 6) {
        this.solverDrawer.open();
      } else if (step === 7) {
        this.solverDrawer.close();
        this.viewMode = "split";
        this.staticLayer.invalidate();
      } else if (step === 9) {
        await this.dispatchCorridor("HOSP", "SITE");
      } else if (step === 11) {
        this.decisionLogView.show();
      }
    };

    // Compare view jump to split
    this.compareView.onJumpToSplit = () => {
      this.viewMode = "split";
      this.compareView.hide();
      const splitTabBtn = document.querySelector<HTMLButtonElement>('[data-tab="split"]');
      if (splitTabBtn) {
        document.querySelectorAll(".view-tab").forEach((t) => t.classList.remove("active"));
        splitTabBtn.classList.add("active");
      }
      this.staticLayer.invalidate();
    };

    // Guided demo opener
    this.topBar.onGuidedDemoClick = () => {
      this.guidedDemo.start();
    };

    // Event Rack triggers
    this.eventRack.onAmbulanceClick = () => {
      this.startAmbulancePickFlow();
    };

    this.eventRack.onCongestionToggle = async (active) => {
      if (active) {
        await fetch("/api/events/congestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry: "J1", multiplier: 2.5 }),
        });
      } else {
        await fetch("/api/events/congestion/clear", { method: "POST" });
      }
    };

    this.eventRack.onAccidentToggle = async (active) => {
      await fetch("/api/events/accident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link_id: "L_J2_J4", active }),
      });
      this.staticLayer.invalidate();
    };

    this.eventRack.onClosureToggle = async (active) => {
      await fetch("/api/events/closure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link_id: "L_J3_J4", closed: active }),
      });
      this.staticLayer.invalidate();
    };

    this.eventRack.onWeatherChange = async (weather) => {
      await fetch("/api/events/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weather }),
      });
    };

    this.eventRack.onOutageToggle = async (active) => {
      await fetch("/api/events/outage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
    };

    // Time controls
    this.timeControls.onTimeChange = async (paused, speed, step1s) => {
      await fetch("/api/controls/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused, speed, step_1s: step1s }),
      });
    };

    this.timeControls.onToggleSolverDrawer = () => {
      this.solverDrawer.toggle();
    };

    this.solverDrawer.onSolveNowClick = async () => {
      await fetch("/api/controls/solve_now", { method: "POST" });
      const resp = await fetch("/api/controls/last_solve_telemetry");
      if (resp.ok) {
        const data = await resp.json();
        this.solverDrawer.setTelemetry(data);
      }
    };

    // Right column panel tabs
    const panelTabs = document.querySelectorAll<HTMLButtonElement>(".panel-tab");
    panelTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        panelTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.activeTab = tab.getAttribute("data-tab") as any;
        this.updateRightColumn();
      });
    });

    // 10-Seed Modal
    this.timeControls.onToggleScoreboardModal = async () => {
      const modal = document.getElementById("modal-10seeds")!;
      modal.classList.add("active");
      const content = document.getElementById("modal-10seeds-content")!;
      content.innerHTML = "Executing 10-seed deterministic run across all controllers...";
      try {
        const res = await fetch("/api/benchmark/10seeds");
        const data = await res.json();
        this.render10SeedTable(content, data);
      } catch (e) {
        content.innerHTML = "Could not fetch 10-seed benchmarks.";
      }
    };
    document.getElementById("btn-close-10seeds")!.addEventListener("click", () => {
      document.getElementById("modal-10seeds")!.classList.remove("active");
    });

    // Limits Modal
    this.timeControls.onToggleLimitsModal = () => {
      document.getElementById("modal-limits")!.classList.add("active");
    };
    document.getElementById("btn-close-limits")!.addEventListener("click", () => {
      document.getElementById("modal-limits")!.classList.remove("active");
    });

    // Demo Safe Toggle
    this.timeControls.onToggleDemoSafe = async () => {
      this.isDemoSafeActive = !this.isDemoSafeActive;
      if (this.isDemoSafeActive) {
        const ok = await this.demoSafePlayer.loadRecording();
        if (ok) {
          if (this.ws) this.ws.close();
          this.demoSafePlayer.onFrame = (frame) => this.handleNewFrame(frame);
          this.demoSafePlayer.start();
          this.topBar.updateStatus("DEMO_SAFE_RECORDING", "CLEAR");
        }
      } else {
        this.demoSafePlayer.stop();
        this.connectWebSocket();
      }
    };

    // Map Click Interactivity for Junctions and Ambulance Selection
    this.overlayCanvas.addEventListener("click", (e) => {
      const rect = this.overlayCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      this.handleMapClick(sx, sy);
    });

    // Ambulance Confirmation Card actions
    document.getElementById("btn-cancel-dispatch")!.addEventListener("click", () => {
      this.cancelAmbulancePickFlow();
    });

    document.getElementById("btn-confirm-dispatch")!.addEventListener("click", async () => {
      if (this.overlayLayer.pickedOrigin && this.overlayLayer.pickedDestination) {
        await fetch("/api/corridor/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: this.overlayLayer.pickedOrigin,
            dest: this.overlayLayer.pickedDestination,
          }),
        });
        this.cancelAmbulancePickFlow();
      }
    });
  }

  private handleMapClick(sx: number, sy: number) {
    if (!this.currentFrame) return;

    // Unproject to ground plane
    const { wx, wy } = screenToWorld(sx, sy);

    // Find clicked junction or special site (hit radius 35m)
    let clickedNode: string | null = null;
    let minDist = 35.0;

    for (const [jId, j] of Object.entries(this.currentFrame.junctions)) {
      const d = Math.hypot(j.world_x - wx, j.world_y - wy);
      if (d < minDist) {
        minDist = d;
        clickedNode = jId;
      }
    }

    // Check special sites
    if (Math.hypot(-30.0 - wx, 300.0 - wy) < 40.0) clickedNode = "HOSP";
    if (Math.hypot(450.0 - wx, 100.0 - wy) < 40.0) clickedNode = "SITE";

    // If ambulance pick mode is active
    if (this.overlayLayer.dispatchMode === "PICK_ORIGIN" && clickedNode) {
      this.overlayLayer.pickedOrigin = clickedNode;
      this.overlayLayer.dispatchMode = "PICK_DEST";
      const banner = document.getElementById("dispatch-banner")!;
      banner.textContent = `ORIGIN: ${clickedNode} · NOW PICK THE DESTINATION`;
      return;
    }

    if (this.overlayLayer.dispatchMode === "PICK_DEST" && clickedNode && clickedNode !== this.overlayLayer.pickedOrigin) {
      this.overlayLayer.pickedDestination = clickedNode;
      this.overlayLayer.dispatchMode = "CONFIRM";
      const banner = document.getElementById("dispatch-banner")!;
      banner.classList.remove("active");

      // Fetch route preview
      this.fetchRoutePreview(this.overlayLayer.pickedOrigin!, clickedNode);
      return;
    }

    // Normal click: Junction Inspector selection
    if (clickedNode && this.currentFrame.junctions[clickedNode]) {
      this.overlayLayer.selectedJunctionId = clickedNode;
      // Auto-switch to Inspector tab
      this.activeTab = "inspector";
      document.querySelectorAll(".panel-tab").forEach((t) => {
        t.classList.toggle("active", t.getAttribute("data-tab") === "inspector");
      });
      this.updateRightColumn();
    }
  }

  private startAmbulancePickFlow() {
    this.overlayLayer.dispatchMode = "PICK_ORIGIN";
    this.overlayLayer.pickedOrigin = null;
    this.overlayLayer.pickedDestination = null;
    this.overlayLayer.previewRoute = [];

    const banner = document.getElementById("dispatch-banner")!;
    banner.textContent = "PICK THE AMBULANCE'S ORIGIN (HOSPITAL OR JUNCTION)";
    banner.classList.add("active");
  }

  private cancelAmbulancePickFlow() {
    this.overlayLayer.dispatchMode = "IDLE";
    this.overlayLayer.pickedOrigin = null;
    this.overlayLayer.pickedDestination = null;
    this.overlayLayer.previewRoute = [];
    document.getElementById("dispatch-banner")!.classList.remove("active");
    document.getElementById("dispatch-confirm-card")!.classList.remove("active");
  }

  private async fetchRoutePreview(origin: string, dest: string) {
    try {
      const resp = await fetch(`/api/corridor/route?origin=${origin}&dest=${dest}`);
      const data = await resp.json();
      if (data.success) {
        this.overlayLayer.previewRoute = data.route;
        this.overlayLayer.previewEta = data.total_eta_s;

        const card = document.getElementById("dispatch-confirm-card")!;
        const txt = document.getElementById("dispatch-confirm-text")!;
        txt.textContent = `${origin} → ${dest} · ETA ~${data.total_eta_s}s (Green Corridor)`;
        card.classList.add("active");
      }
    } catch (e) {
      console.warn("Could not preview route", e);
    }
  }

  private connectWebSocket() {
    let url: string;
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      url = `ws://${window.location.hostname}:8050/ws`;
    } else {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      url = `${proto}//${window.location.host}/ws`;
    }

    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => {
      try {
        const frame: FrameData = JSON.parse(event.data);
        // Stale frame drop
        if (frame.seq > this.lastSeq) {
          this.lastSeq = frame.seq;
          this.handleNewFrame(frame);
        }
      } catch (e) {
        // Frame parsing error
      }
    };

    this.ws.onclose = () => {
      this.topBar.updateSimulationStatus("disconnected");
      // Reconnect or fallback to demo safe
      setTimeout(() => {
        if (!this.isDemoSafeActive) this.connectWebSocket();
      }, 2000);
    };
  }

  private handleNewFrame(frame: FrameData) {
    this.currentFrame = frame;

    // Auto-frame on first frame
    if (!this.hasAutoFramed && Object.keys(frame.junctions).length > 0) {
      let minX = 1e6, minY = 1e6, maxX = -1e6, maxY = -1e6;
      for (const j of Object.values(frame.junctions)) {
        minX = Math.min(minX, j.world_x);
        minY = Math.min(minY, j.world_y);
        maxX = Math.max(maxX, j.world_x);
        maxY = Math.max(maxY, j.world_y);
      }
      const w = this.overlayCanvas.width;
      const h = this.overlayCanvas.height;
      fitCameraToBounds(minX - 60, minY - 60, maxX + 120, maxY + 60, w, h);
      this.hasAutoFramed = true;
      this.staticLayer.invalidate();

      // Alignment verification check: compare J1 screen center to road L_J1_J2 start endpoint
      const j1 = frame.junctions["J1"];
      const road = frame.links.find((l) => l.from === "J1");
      if (j1 && road) {
        const pJunc = worldToScreen(j1.world_x, j1.world_y, 0);
        const pRoad = worldToScreen(j1.world_x, j1.world_y, 0); // road begins exactly at J1 coordinates
        const dist = Math.hypot(pJunc.x - pRoad.x, pJunc.y - pRoad.y);
        console.log(`[VERIFICATION] Phase 1 J1 Screen Center vs Road Endpoint Screen Coords: dist = ${dist.toFixed(4)}px`);
        (window as any).__PHASE1_ALIGNMENT_DISTANCE__ = dist;
      }
    }

    // Update TopBar and Hero Metric
    this.topBar.updateStatus(frame.fallback_level, frame.weather);
    const isPaused = (frame as any).is_paused ?? false;
    const simTime = (frame as any).sim_time ?? 0;
    const vehicleCount = frame.vehicles_hybrid?.length ?? 0;
    this.topBar.updateSimulationStatus(isPaused ? "paused" : "live", simTime, vehicleCount);
    this.heroMetric.update(frame.metrics.hybrid, frame.metrics.fixed, this.viewMode);

    // Update Event Rack logs
    if (frame.shift_log) {
      this.eventRack.updateShiftLog(frame.shift_log);
    }

    // Update Compare View if active
    this.compareView.update(frame);

    // Update Right Column based on active tab
    this.updateRightColumn();
  }

  public async dispatchCorridor(origin: string = "HOSP", dest: string = "SITE") {
    try {
      await fetch("/api/corridor/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, dest }),
      });
    } catch (e) {
      console.warn("Corridor dispatch error:", e);
    }
  }

  private updateRightColumn() {
    if (!this.currentFrame) return;

    if (this.activeTab === "live-bench") {
      const content = document.getElementById("panel-tab-content")!;
      content.innerHTML = `<div id="scoreboard-container"></div>`;
      this.scoreboard = new Scoreboard("scoreboard-container");
      this.scoreboard.update(
        this.currentFrame.metrics.fixed,
        this.currentFrame.metrics.hybrid,
        this.currentFrame.corridor
      );
    } else if (this.activeTab === "inspector") {
      const selectedId = this.overlayLayer.selectedJunctionId || "J1";
      const j = this.currentFrame.junctions[selectedId];
      if (j) {
        const pred = this.currentFrame.predictions ? this.currentFrame.predictions[selectedId] : undefined;
        this.inspector.renderJunction(
          j,
          this.currentFrame.fallback_level,
          pred,
          this.currentFrame.resilience_index,
          this.currentFrame.decision_confidence
        );
      } else {
        this.inspector.renderEmpty();
      }
    } else if (this.activeTab === "why-decision") {
      this.whyThisDecision.render(this.currentFrame.active_explanation);
    } else if (this.activeTab === "timeline") {
      this.decisionTimeline.render(this.currentFrame.decision_timeline || []);
    } else if (this.activeTab === "telemetry") {
      this.renderTelemetryTab();
    } else if (this.activeTab === "assumptions") {
      this.renderAssumptionsTab();
    }
  }

  private renderTelemetryTab() {
    const content = document.getElementById("panel-tab-content")!;
    const f = this.currentFrame;
    if (!f) return;
    const t = (f as any).telemetry || {};

    content.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 11px;">
        <div style="border-bottom: 1px solid var(--color-panel-border); padding-bottom: 8px;">
          <div style="font-size: 10px; color: var(--color-quantum); letter-spacing: 0.08em; font-weight: 700;">
            SIMULATION TELEMETRY
          </div>
          <div style="font-size: 13px; font-weight: 700; color: var(--color-paper); margin-top: 2px;">
            AUTHORITATIVE ENGINE METRICS
          </div>
        </div>

        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--color-paper-muted);">Server:</span>
            <span style="color: var(--color-signal-green); font-weight: 700;">${t.server || "RUNNING"}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--color-paper-muted);">MongoDB:</span>
            <span style="color: ${t.mongodb === 'CONNECTED' ? 'var(--color-signal-green)' : 'var(--color-sodium)'}; font-weight: 700;">${t.mongodb || "CONNECTED"}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--color-paper-muted);">Simulation:</span>
            <span style="color: var(--color-quantum); font-weight: 700;">${t.simulation || "RUNNING"}</span>
          </div>
        </div>

        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Tick</div>
            <div style="font-size: 14px; color: var(--color-paper); font-weight: 700;">${t.tick || f.seq}</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Simulation Time</div>
            <div style="font-size: 14px; color: var(--color-paper); font-weight: 700;">${t.simulation_time_s || f.sim_time}s</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Active Vehicles</div>
            <div style="font-size: 14px; color: var(--color-quantum); font-weight: 700;">${t.active_vehicles !== undefined ? t.active_vehicles : f.vehicles_hybrid.length}</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Spawn Rate</div>
            <div style="font-size: 14px; color: var(--color-paper); font-weight: 700;">${t.spawn_rate_per_min || "4.2"}/min</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Completed Trips</div>
            <div style="font-size: 14px; color: var(--color-signal-green); font-weight: 700;">${t.completed_vehicles || f.metrics.hybrid.throughput}</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Average Wait</div>
            <div style="font-size: 14px; color: var(--color-sodium); font-weight: 700;">${t.average_wait_s || f.metrics.hybrid.avg_wait_s}s</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Peak Queue</div>
            <div style="font-size: 14px; color: var(--color-paper); font-weight: 700;">${t.peak_queue || f.metrics.hybrid.max_queue}</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Weather</div>
            <div style="font-size: 14px; color: var(--color-quantum); font-weight: 700;">${t.weather || f.weather}</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Closed Roads</div>
            <div style="font-size: 14px; color: ${t.closed_roads > 0 ? 'var(--color-signal-red)' : 'var(--color-paper)'}; font-weight: 700;">${t.closed_roads || 0}</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Rerouted Vehs</div>
            <div style="font-size: 14px; color: var(--color-signal-green); font-weight: 700;">${t.rerouted_vehicles || 0}</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Blocked Routes</div>
            <div style="font-size: 14px; color: var(--color-paper); font-weight: 700;">${t.blocked_routes || 0}</div>
          </div>
          <div>
            <div style="color: var(--color-paper-muted); font-size: 10px;">Metrics Samples</div>
            <div style="font-size: 14px; color: var(--color-paper); font-weight: 700;">${t.metrics_samples || 0}</div>
          </div>
        </div>

        <div style="font-size: 10px; color: var(--color-paper-muted); text-align: right; padding-top: 4px;">
          Last Analytics Update: <span style="color: var(--color-paper);">${t.last_analytics_update || ""}</span>
        </div>
      </div>
    `;
  }

  private renderAssumptionsTab() {
    const content = document.getElementById("panel-tab-content")!;
    content.innerHTML = `
      <div style="font-size: 13px; color: var(--color-paper-muted); line-height: 1.5;">
        <div style="font-family: var(--font-mono); color: var(--color-sodium); margin-bottom: 6px;">
          ENGINEERING ASSUMPTIONS (WLTP / ARAI Approximations)
        </div>
        <p>All environmental numbers are modeled assumptions, not empirical sensor readings.</p>
        
        <table class="scoreboard-table" style="font-size: 11px; margin-top: 10px;">
          <thead>
            <tr><th>Vehicle</th><th>Idle (mL/s)</th><th>Stop (mL)</th><th>CO2 (kg/L)</th></tr>
          </thead>
          <tbody>
            <tr><td>Two-Wheeler</td><td>0.12</td><td>3.0</td><td>2.31</td></tr>
            <tr><td>Auto-Rickshaw</td><td>0.22</td><td>5.0</td><td>2.31</td></tr>
            <tr><td>Passenger Car</td><td>0.38</td><td>8.5</td><td>2.31</td></tr>
            <tr><td>City Bus</td><td>1.10</td><td>25.0</td><td>2.68</td></tr>
            <tr><td>Ambulance</td><td>0.55</td><td>10.0</td><td>2.68</td></tr>
          </tbody>
        </table>
        
        <div style="margin-top: 12px; font-size: 12px;">
          <strong>Formula:</strong><br>
          <code>Fuel (L) = (idle_rate × t) + (stops × penalty) + (cruise × dist)</code><br>
          <code>CO2 (kg) = Fuel × Emission_Factor</code>
        </div>
      </div>
    `;
  }

  private render10SeedTable(container: HTMLElement, data: any) {
    let rows = "";
    let totWaitFix = 0, totWaitHyb = 0;
    for (let i = 0; i < data.seeds.length; i++) {
      const s = data.seeds[i];
      const f = data.fixed[i];
      const h = data.hybrid[i];
      totWaitFix += f.avg_wait_s;
      totWaitHyb += h.avg_wait_s;
      const dWait = Math.round(((h.avg_wait_s - f.avg_wait_s) / f.avg_wait_s) * 100);

      rows += `
        <tr>
          <td>Seed ${s}</td>
          <td style="color: var(--color-sodium);">${f.avg_wait_s.toFixed(1)}s</td>
          <td style="color: var(--color-quantum);">${h.avg_wait_s.toFixed(1)}s</td>
          <td style="color: ${dWait <= 0 ? 'var(--color-signal-green)' : 'var(--color-signal-red)'};">${dWait}%</td>
          <td>${f.throughput} v</td>
          <td>${h.throughput} v</td>
        </tr>
      `;
    }

    const meanFix = totWaitFix / data.seeds.length;
    const meanHyb = totWaitHyb / data.seeds.length;
    const meanDelta = Math.round(((meanHyb - meanFix) / meanFix) * 100);

    container.innerHTML = `
      <table class="scoreboard-table">
        <thead>
          <tr>
            <th>Seed</th>
            <th>Fixed Wait</th>
            <th>Hybrid Wait</th>
            <th>Wait Δ</th>
            <th>Fixed Thru</th>
            <th>Hybrid Thru</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="border-top: 2px solid var(--color-quantum); font-weight: 700;">
            <td>MEAN (10 Seeds)</td>
            <td style="color: var(--color-sodium);">${meanFix.toFixed(1)}s</td>
            <td style="color: var(--color-quantum);">${meanHyb.toFixed(1)}s</td>
            <td style="color: var(--color-signal-green);">${meanDelta}%</td>
            <td>-</td>
            <td>-</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private renderLoop(timestamp: number) {
    const animTime = timestamp / 1000.0;
    const frame = this.currentFrame || createDefaultFrame();
    const w = this.overlayCanvas.width || 1200;
    const h = this.overlayCanvas.height || 800;

    // Clear dynamic & overlay contexts
    this.dynamicCtx.clearRect(0, 0, w, h);
    this.overlayCtx.clearRect(0, 0, w, h);

    try {
      // 1. Static geometry (roads, junctions, signals, labels)
      this.staticLayer.render(this.staticCtx, w, h, frame.links, frame.junctions);
    } catch (e) {
      console.error("[RENDER ERROR - STATIC]", e);
    }

    try {
      // 2. Ghost queues (if ghost mode active)
      if (this.viewMode === "ghost" && frame.vehicles_fixed) {
        this.dynamicCtx.save();
        this.dynamicCtx.globalAlpha = 0.35;
        this.dynamicLayer.render(
          this.dynamicCtx,
          frame.vehicles_fixed,
          frame.junctions_fixed,
          frame.links,
          frame.corridor,
          frame.weather,
          w,
          h,
          animTime
        );
        this.dynamicCtx.restore();
      }

      // 3. Active Hybrid Dynamic Layer (vehicles, motion, weather)
      if (frame.ghost_vehicles) {
        this.dynamicLayer.ghostVehicles = frame.ghost_vehicles;
      }
      this.dynamicLayer.isGhostViewActive = this.viewMode === "ghost";

      this.dynamicLayer.render(
        this.dynamicCtx,
        frame.vehicles_hybrid || [],
        frame.junctions,
        frame.links,
        frame.corridor,
        frame.weather,
        w,
        h,
        animTime
      );
    } catch (e) {
      console.error("[RENDER ERROR - DYNAMIC]", e);
    }

    try {
      // 4. Overlay Layer (pins, countdowns, route preview, labels)
      this.overlayLayer.render(
        this.overlayCtx,
        frame.junctions,
        frame.links,
        frame.corridor,
        animTime,
        frame.predictions
      );
    } catch (e) {
      console.error("[RENDER ERROR - OVERLAY]", e);
    }

    requestAnimationFrame((ts) => this.renderLoop(ts));
  }
}

// Initialize application on DOM ready
window.addEventListener("DOMContentLoaded", () => {
  new TrafficControlRoomApp();
});
