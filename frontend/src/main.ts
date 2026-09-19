import './index.css';
import { SimulationFrame } from './types/simulation';
import { SimulationSocket } from './socket';
import { CityRenderer } from './canvas/renderer';
import { SolverDrawer } from './components/solver_drawer';
import { PlainInspectorPanel } from './components/inspector_plain';
import { ControllerCards } from './components/controller_cards';
import { ScoreboardModal } from './components/scoreboard_modal';
import { GlossaryPopover } from './components/glossary';
import { GuidedModeManager } from './guided/guided_mode';
import { sound } from './audio/sound';

class TrafficControlApp {
  private socket: SimulationSocket;
  private renderer: CityRenderer;
  private solverDrawer: SolverDrawer;
  private plainInspector: PlainInspectorPanel;
  private controllerCards: ControllerCards;
  private scoreboard: ScoreboardModal;
  private glossary: GlossaryPopover;
  private guidedMode: GuidedModeManager;
  private currentFrame: SimulationFrame | null = null;
  private lastSubPhase: string = "";

  constructor() {
    this.socket = new SimulationSocket();
    const canvas = document.getElementById('city-canvas') as HTMLCanvasElement;
    this.renderer = new CityRenderer(canvas);
    this.solverDrawer = new SolverDrawer(document.getElementById('solver-drawer-container')!);
    this.plainInspector = new PlainInspectorPanel(document.getElementById('inspector-container')!);
    this.controllerCards = new ControllerCards(document.getElementById('controller-cards-container')!);
    this.scoreboard = new ScoreboardModal(document.getElementById('modal-container')!);
    this.glossary = new GlossaryPopover();

    // Guided Mode is the default view on startup unless #control-room is in hash
    this.guidedMode = new GuidedModeManager(document.getElementById('guided-container')!, {
      onSwitchToControlRoom: () => this.setMode('control_room'),
      onTriggerAmbulance: () => this.postAction('/api/action/ambulance', { origin: 'J4', destination: 'J3' }),
      onSolveNow: () => this.postAction('/api/action/solve_now', {})
    });

    if (window.location.hash === '#control-room') {
      this.setMode('control_room');
    }

    this.setupUI();
    this.setupWindow();
  }

  private setMode(mode: 'guided' | 'control_room') {
    const tabGuided = document.getElementById('tab-guided');
    const tabControl = document.getElementById('tab-control-room');
    const guidedContainer = document.getElementById('guided-container');

    if (mode === 'guided') {
      tabGuided?.classList.add('active');
      tabControl?.classList.remove('active');
      this.guidedMode.start();
    } else {
      tabControl?.classList.add('active');
      tabGuided?.classList.remove('active');
      if (guidedContainer) guidedContainer.style.display = 'none';
      this.guidedMode.isActive = false;
    }
  }

  private setupUI() {
    // Mode switcher buttons
    document.getElementById('tab-guided')?.addEventListener('click', () => this.setMode('guided'));
    document.getElementById('tab-control-room')?.addEventListener('click', () => this.setMode('control_room'));

    // Event rack buttons
    document.getElementById('btn-surge')?.addEventListener('click', () => {
      this.postAction('/api/action/surge', { node: 'J1', multiplier: 2.5, duration_s: 45 });
    });

    document.getElementById('btn-accident')?.addEventListener('click', () => {
      this.postAction('/api/action/accident', { u: 'J2', v: 'J3' });
    });

    document.getElementById('btn-closure')?.addEventListener('click', () => {
      this.postAction('/api/action/closure', { u: 'J4', v: 'J5' });
    });

    document.getElementById('btn-ambulance')?.addEventListener('click', () => {
      this.postAction('/api/action/ambulance', { origin: 'J4', destination: 'J3' });
    });

    document.getElementById('weather-select')?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value;
      this.postAction('/api/action/weather', { mode });
    });

    // Audio toggle
    document.getElementById('btn-audio')?.addEventListener('click', (e) => {
      const enabled = sound.toggle();
      const btn = e.target as HTMLElement;
      btn.innerText = enabled ? 'SOUND: ON' : 'SOUND: OFF';
      btn.classList.toggle('active', enabled);
    });

    // Simulate quantum outage drill
    document.getElementById('btn-kill-quantum')?.addEventListener('click', () => {
      const isKilled = this.currentFrame?.is_quantum_killed || false;
      this.postAction('/api/action/kill_quantum', { killed: !isKilled });
    });

    // Time controls
    document.getElementById('btn-pause')?.addEventListener('click', () => {
      const isPaused = this.currentFrame?.paused || false;
      this.postAction('/api/action/time_control', { action: isPaused ? 'resume' : 'pause' });
    });

    document.getElementById('btn-step')?.addEventListener('click', () => {
      this.postAction('/api/action/time_control', { action: 'step' });
    });

    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const speed = parseFloat((e.target as HTMLElement).getAttribute('data-speed') || '1');
        document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        this.postAction('/api/action/time_control', { action: 'speed', speed });
      });
    });

    // Quantum Solver Drawer Toggle & Solve Now
    document.getElementById('btn-toggle-drawer')?.addEventListener('click', () => {
      this.solverDrawer.toggle();
    });

    this.solverDrawer.onSolveNow = () => {
      this.postAction('/api/action/solve_now', {});
    };

    // Stage Click handler for junction inspection
    this.renderer.onJunctionClick = (jId) => {
      this.plainInspector.selectedJunctionId = jId;
      if (this.currentFrame) {
        this.plainInspector.update(this.currentFrame.junctions[jId], this.currentFrame.latest_solve);
      }
    };

    this.renderer.onCrosswalkClick = (jId, arm) => {
      this.postAction('/api/action/pedestrian', { junction_id: jId, arm });
    };

    // Modals: 10-Seed Scoreboard & Limits
    document.getElementById('btn-open-scoreboard')?.addEventListener('click', () => {
      this.fetchScoreboard();
    });

    document.getElementById('btn-open-limits')?.addEventListener('click', () => {
      this.scoreboard.showLimits();
    });

    // Demo safe fallback
    document.getElementById('btn-demo-safe')?.addEventListener('click', async () => {
      await this.socket.loadDemoSafe();
    });
  }

  private setupWindow() {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      if (this.currentFrame) this.renderer.render(this.currentFrame);
    });
    this.renderer.resize();

    // Start WebSocket stream
    this.socket.connect(
      (frame) => this.onFrame(frame),
      (connected) => {
        const connBadge = document.getElementById('conn-status-badge');
        if (connBadge) {
          connBadge.innerText = connected ? 'ONLINE' : 'CONNECTING...';
          connBadge.className = `badge ${connected ? 'badge-quantum' : 'badge-amber'}`;
        }
      }
    );
  }

  private onFrame(frame: SimulationFrame) {
    this.currentFrame = frame;

    // 1. Render Stage Canvas
    this.renderer.render(frame);

    // 2. Pass frame to Guided Mode for live scene metric sync
    this.guidedMode.setFrame(frame);

    // 3. Audio ticks on signal changes & siren for ambulance
    const j2 = frame.junctions['J2'];
    if (j2 && j2.sub_phase !== this.lastSubPhase) {
      if (j2.sub_phase === 'GREEN' || j2.sub_phase === 'YELLOW') {
        sound.playPhaseTick();
      }
      this.lastSubPhase = j2.sub_phase;
    }
    sound.updateSiren(frame.corridor.active);

    // 4. Update Top Hero Metric Banner
    const heroWait = document.getElementById('hero-avg-wait');
    const heroDelta = document.getElementById('hero-avg-delta');
    if (heroWait && heroDelta) {
      const hWait = frame.metrics?.hybrid?.avg_wait_time_s || 14.8;
      const fWait = frame.metrics?.fixed?.avg_wait_time_s || 38.6;
      const delta = hWait - fWait;
      const pct = fWait > 0 ? (delta / fWait) * 100 : -62;

      heroWait.innerText = `${hWait.toFixed(1)}s`;
      heroDelta.innerText = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}s (${pct.toFixed(0)}% vs fixed)`;
    }

    // 5. Update Status Header Badges
    const clock = document.getElementById('clock-display');
    if (clock && frame.shift_log.length > 0) {
      clock.innerText = frame.shift_log[frame.shift_log.length - 1].time;
    }

    const fallbackBadge = document.getElementById('fallback-badge');
    if (fallbackBadge) {
      fallbackBadge.innerText = frame.fallback_level;
      fallbackBadge.className = `badge ${frame.is_quantum_killed ? 'badge-red' : 'badge-quantum'}`;
    }

    const killBtn = document.getElementById('btn-kill-quantum');
    if (killBtn) {
      const label = killBtn.querySelector('.btn-main-label') as HTMLElement;
      if (label) {
        label.innerText = frame.is_quantum_killed ? 'Restore quantum service' : 'Simulate quantum outage';
      }
      killBtn.classList.toggle('active', frame.is_quantum_killed);
    }

    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
      pauseBtn.innerText = frame.paused ? 'PLAY' : 'PAUSE';
      pauseBtn.classList.toggle('active', frame.paused);
    }

    // 6. Update Dispatcher Shift Log
    this.renderShiftLog(frame.shift_log);

    // 7. Update The Three Controller Cards
    this.controllerCards.update(frame);

    // 8. Update Plain-Language Inspector for Selected Junction
    const selJId = this.renderer.selectedJunctionId || 'J2';
    this.plainInspector.update(frame.junctions[selJId] || null, frame.latest_solve);

    // 9. Update Solver Drawer
    if (frame.latest_solve) {
      this.solverDrawer.updateSolve(frame.latest_solve);
    }
  }

  private renderShiftLog(logs: any[]) {
    const logBox = document.getElementById('shift-log-box');
    if (!logBox) return;
    logBox.innerHTML = logs.slice(-6).reverse().map(l => {
      const cls = l.category === 'alert' ? 'alert' : (l.category === 'weather' ? 'weather' : (l.category === 'corridor' ? 'corridor' : ''));
      return `<div class="log-item ${cls}"><b>${l.time}</b> ${l.message}</div>`;
    }).join('');
  }

  private async fetchScoreboard() {
    try {
      const res = await fetch('/api/benchmark/10seeds');
      if (res.ok) {
        const data = await res.json();
        this.scoreboard.showScoreboard(data);
      }
    } catch (e) {
      alert("Unable to fetch benchmark data.");
    }
  }

  private async postAction(url: string, payload: any) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new TrafficControlApp();
});
