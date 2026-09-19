import { SimulationFrame, JunctionData, VehicleData } from '../types/simulation';

export class CityRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animFrameId: number | null = null;
  public viewMode: 'single' | 'split' | 'ghost' = 'single';
  public selectedJunctionId: string | null = "J2";
  public onJunctionClick: ((jId: string) => void) | null = null;
  public onRoadClick: ((u: string, v: string) => void) | null = null;
  public onCrosswalkClick: ((jId: string, arm: string) => void) | null = null;

  // Rain particle state
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.initRain();
    this.setupListeners();
  }

  private initRain() {
    this.rainDrops = [];
    for (let i = 0; i < 120; i++) {
      this.rainDrops.push({
        x: Math.random() * 1600,
        y: Math.random() * 900,
        speed: 8 + Math.random() * 8,
        len: 10 + Math.random() * 10
      });
    }
  }

  public resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
  }

  private setupListeners() {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Check click against junction centers
      if (this.lastFrame) {
        for (const [jId, j] of Object.entries(this.lastFrame.junctions)) {
          const dx = clickX - j.x;
          const dy = clickY - j.y;
          if (Math.hypot(dx, dy) <= 30) {
            this.selectedJunctionId = jId;
            if (this.onJunctionClick) this.onJunctionClick(jId);
            return;
          }
          // Check crosswalk arms around junction
          const arms: Record<string, [number, number]> = {
            N: [j.x, j.y - 35],
            S: [j.x, j.y + 35],
            W: [j.x - 35, j.y],
            E: [j.x + 35, j.y]
          };
          for (const [arm, [ax, ay]] of Object.entries(arms)) {
            if (Math.hypot(clickX - ax, clickY - ay) <= 15) {
              if (this.onCrosswalkClick) this.onCrosswalkClick(jId, arm);
              return;
            }
          }
        }
      }
    });
  }

  private lastFrame: SimulationFrame | null = null;

  public render(frame: SimulationFrame) {
    this.lastFrame = frame;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    this.ctx.fillStyle = '#14110F';
    this.ctx.fillRect(0, 0, w, h);

    if (this.viewMode === 'split') {
      this.renderSplitView(frame, w, h);
    } else {
      this.renderFullStage(frame, w, h, this.viewMode === 'ghost');
    }

    // Weather atmospheric overlay
    if (frame.weather === 'rain' || frame.weather === 'heavy_rain') {
      this.renderRain(w, h, frame.weather === 'heavy_rain');
    } else if (frame.weather === 'fog') {
      this.renderFog(w, h);
    }

    // Compass and scale bar
    this.renderCompassAndScale(w, h);
  }

  private renderFullStage(frame: SimulationFrame, w: number, h: number, isGhostMode: boolean) {
    const scale = Math.min((w - 80) / 1150, (h - 60) / 640);
    this.ctx.save();
    this.ctx.translate((w - 1060 * scale) / 2, (h - 640 * scale) / 2);
    this.ctx.scale(scale, scale);

    this.drawRoads(frame);
    this.drawEmergencyCorridorWave(frame);
    this.drawJunctions(frame);
    this.drawVehicles(frame.vehicles);

    if (isGhostMode && frame.ghost_queues) {
      this.drawGhostCues(frame);
    }

    this.ctx.restore();
  }

  private renderSplitView(frame: SimulationFrame, w: number, h: number) {
    const colW = w / 3;
    const titles = ['1. Fixed-Time (Baseline)', '2. Rule-Based (Heuristic)', '3. Hybrid QAOA (Quantum)'];
    const scale = Math.min(colW / 1100, h / 700);

    for (let i = 0; i < 3; i++) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(i * colW, 0, colW, h);
      this.ctx.clip();

      // Divider line
      if (i > 0) {
        this.ctx.strokeStyle = '#322A23';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(i * colW, 0);
        this.ctx.lineTo(i * colW, h);
        this.ctx.stroke();
      }

      // Title Header
      this.ctx.fillStyle = i === 2 ? '#9FD8FF' : (i === 1 ? '#F2A33A' : '#EDE4D3');
      this.ctx.font = '12px "IBM Plex Sans", sans-serif';
      this.ctx.fillText(titles[i], i * colW + 16, 24);

      // Mini metric badge
      const m = i === 0 ? frame.metrics.fixed : (i === 1 ? frame.metrics.rule : frame.metrics.hybrid);
      if (m) {
        this.ctx.fillStyle = '#9E917F';
        this.ctx.font = '11px "IBM Plex Mono", monospace';
        this.ctx.fillText(`Wait: ${m.avg_wait_time_s}s | MaxQ: ${m.max_queue} | Fuel: ${m.total_fuel_liters}L`, i * colW + 16, 42);
      }

      this.ctx.translate(i * colW + 20, 60);
      this.ctx.scale(scale * 0.9, scale * 0.9);

      this.drawRoads(frame);
      this.drawJunctions(frame);
      this.drawVehicles(frame.vehicles);

      this.ctx.restore();
    }
  }

  private drawRoads(frame: SimulationFrame) {
    const junctions = frame.junctions;
    const closedSet = new Set(frame.closed_roads.map(e => `${e[0]}_${e[1]}`));
    const accidentSet = new Set(frame.accidents.map(e => `${e[0]}_${e[1]}`));

    // Draw connected road links
    const links = [
      ['J1', 'J2', 3], ['J2', 'J3', 2], ['J1', 'J4', 2], ['J2', 'J5', 1],
      ['J3', 'J6', 2], ['J4', 'J5', 2], ['J5', 'J6', 2]
    ];

    for (const [u, v, lanes] of links) {
      const ju = junctions[u as string];
      const jv = junctions[v as string];
      if (!ju || !jv) continue;

      const isClosed = closedSet.has(`${u}_${v}`) || closedSet.has(`${v}_${u}`);
      const hasAccident = accidentSet.has(`${u}_${v}`) || accidentSet.has(`${v}_${u}`);

      // Road background (asphalt)
      const roadWidth = (lanes as number) * 16 + 6;
      this.ctx.strokeStyle = '#1D1915';
      this.ctx.lineWidth = roadWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(ju.x, ju.y);
      this.ctx.lineTo(jv.x, jv.y);
      this.ctx.stroke();

      // Road edge borders
      this.ctx.strokeStyle = '#322A23';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      // Center divider line (dual cue: dashed for normal, dotted/solid for colorblind)
      this.ctx.strokeStyle = '#3D342C';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([8, 8]);
      this.ctx.beginPath();
      this.ctx.moveTo(ju.x, ju.y);
      this.ctx.lineTo(jv.x, jv.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // If closed, draw barricade stripes
      if (isClosed) {
        this.drawBarricade(ju.x, ju.y, jv.x, jv.y);
      }

      // If accident, draw hazard flashing icon
      if (hasAccident) {
        this.drawAccidentHazard((ju.x + jv.x) / 2, (ju.y + jv.y) / 2);
      }
    }

    // Hospital Gate landmark
    this.ctx.fillStyle = '#1D1915';
    this.ctx.strokeStyle = '#E5533D';
    this.ctx.lineWidth = 1.5;
    this.ctx.fillRect(40, 455, 96, 44);
    this.ctx.strokeRect(40, 455, 96, 44);
    this.ctx.fillStyle = '#E5533D';
    this.ctx.font = 'bold 12px "IBM Plex Sans", sans-serif';
    this.ctx.fillText('[+] HOSPITAL', 48, 482);

    // Accident Site landmark
    this.ctx.fillRect(940, 155, 106, 44);
    this.ctx.strokeRect(940, 155, 106, 44);
    this.ctx.fillStyle = '#F5D04A';
    this.ctx.font = 'bold 12px "IBM Plex Sans", sans-serif';
    this.ctx.fillText('[!] ACCIDENT', 948, 182);
  }

  private drawBarricade(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    this.ctx.save();
    this.ctx.fillStyle = '#E5533D';
    this.ctx.strokeStyle = '#EDE4D3';
    this.ctx.lineWidth = 2;
    this.ctx.fillRect(mx - 14, my - 6, 28, 12);
    this.ctx.strokeRect(mx - 14, my - 6, 28, 12);
    this.ctx.fillStyle = '#EDE4D3';
    this.ctx.font = '9px "IBM Plex Mono", monospace';
    this.ctx.fillText('CLOSED', mx - 13, my + 3);
    this.ctx.restore();
  }

  private drawAccidentHazard(x: number, y: number) {
    this.ctx.save();
    const flash = Math.floor(Date.now() / 300) % 2 === 0;
    this.ctx.fillStyle = flash ? '#E5533D' : '#F5D04A';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 7, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#14110F';
    this.ctx.font = '9px bold sans-serif';
    this.ctx.fillText('!', x - 2, y + 3);
    this.ctx.restore();
  }

  private drawEmergencyCorridorWave(frame: SimulationFrame) {
    const corridor = frame.corridor;
    if (!corridor || !corridor.active || !corridor.route || corridor.route.length < 2) return;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(108, 197, 138, 0.4)';
    this.ctx.lineWidth = 14;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    for (let i = 0; i < corridor.route.length; i++) {
      const j = frame.junctions[corridor.route[i]];
      if (j) {
        if (i === 0) this.ctx.moveTo(j.x, j.y);
        else this.ctx.lineTo(j.x, j.y);
      }
    }
    this.ctx.stroke();

    // Pulse wave running ahead
    const pulse = (Date.now() / 600) % 1;
    this.ctx.strokeStyle = '#6CC58A';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([20, 20]);
    this.ctx.lineDashOffset = -pulse * 40;
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  private drawJunctions(frame: SimulationFrame) {
    for (const [jId, j] of Object.entries(frame.junctions)) {
      const isSelected = this.selectedJunctionId === jId;

      // Junction center island
      this.ctx.save();
      this.ctx.fillStyle = isSelected ? '#2A241F' : '#1D1915';
      this.ctx.strokeStyle = isSelected ? '#F2A33A' : '#322A23';
      this.ctx.lineWidth = isSelected ? 2 : 1.5;
      this.ctx.beginPath();
      this.ctx.arc(j.x, j.y, 24, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      // Proposed quantum plan outer ring (Cold Ice-Blue tinted)
      if (j.proposed_plan_id !== undefined) {
        this.ctx.strokeStyle = '#9FD8FF';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(j.x, j.y, 27, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Signal Head Phase Ring (Green / Yellow / Red arc)
      const countdownPct = j.countdown / 40.0;
      const color = j.sub_phase === 'YELLOW' ? '#F5D04A' : (j.sub_phase === 'GREEN' ? '#6CC58A' : '#E5533D');
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(j.x, j.y, 21, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(1.0, countdownPct)));
      this.ctx.stroke();

      // Junction Label & Countdown
      this.ctx.fillStyle = '#EDE4D3';
      this.ctx.font = 'bold 13px "IBM Plex Mono", monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(`${Math.ceil(j.countdown)}s`, j.x, j.y);

      // Junction Name below
      this.ctx.fillStyle = isSelected ? '#F2A33A' : '#EDE4D3';
      this.ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
      this.ctx.fillText(`${j.id}: ${j.name}`, j.x, j.y + 40);

      // Queue indicators on 4 approaches (radial glyphs)
      const glyphOffsets: Record<string, [number, number]> = {
        N: [j.x, j.y - 32],
        S: [j.x, j.y + 32],
        W: [j.x - 32, j.y],
        E: [j.x + 32, j.y]
      };

      for (const [arm, [gx, gy]] of Object.entries(glyphOffsets)) {
        const qCount = j.queues[arm as 'N' | 'S' | 'E' | 'W'] || 0;
        if (qCount > 0) {
          this.ctx.fillStyle = qCount > 8 ? '#E5533D' : (qCount > 4 ? '#F5D04A' : '#6CC58A');
          this.ctx.beginPath();
          this.ctx.arc(gx, gy, Math.min(8, 2 + qCount * 0.7), 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Pedestrian crosswalk button indicator
        const isPedReq = j.pedestrian_requests[arm as 'N' | 'S' | 'E' | 'W'];
        if (isPedReq) {
          this.ctx.strokeStyle = '#EDE4D3';
          this.ctx.strokeRect(gx - 4, gy - 4, 8, 8);
        }
      }

      this.ctx.restore();
    }
  }

  private drawVehicles(vehicles: VehicleData[]) {
    for (const veh of vehicles) {
      if (!veh.edge || !veh.edge.includes('->')) continue;
      const [u, v] = veh.edge.split('->');
      const ju = this.lastFrame?.junctions[u];
      const jv = this.lastFrame?.junctions[v];
      if (!ju || !jv) continue;

      const progress = Math.min(1.0, Math.max(0.0, veh.position / 300.0));
      const vx = ju.x + (jv.x - ju.x) * progress;
      const vy = ju.y + (jv.y - ju.y) * progress;
      const angle = Math.atan2(jv.y - ju.y, jv.x - ju.x);

      this.ctx.save();
      this.ctx.translate(vx, vy);
      this.ctx.rotate(angle);

      // Draw vehicle body
      this.ctx.fillStyle = veh.color || '#EDE4D3';
      const len = Math.max(4, veh.length * 1.5);
      const wid = veh.type === 'bus' ? 6 : (veh.type === 'two_wheeler' ? 2 : 4);

      if (veh.type === 'ambulance') {
        // Flashing emergency siren pulse
        const flash = Math.floor(Date.now() / 150) % 2 === 0;
        this.ctx.fillStyle = flash ? '#E5533D' : '#9FD8FF';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.fillRect(-len / 2, -wid / 2, len, wid);
      this.ctx.restore();
    }
  }

  private drawGhostCues(frame: SimulationFrame) {
    // Translucent ghost queues showing where fixed-time queues would be
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(237, 228, 211, 0.2)';
    this.ctx.strokeStyle = 'rgba(237, 228, 211, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([2, 2]);

    for (const [jId, qObj] of Object.entries(frame.ghost_queues)) {
      const j = frame.junctions[jId];
      if (!j) continue;
      for (const [arm, count] of Object.entries(qObj)) {
        if (count > 0) {
          const offsets: Record<string, [number, number]> = {
            N: [j.x, j.y - 45],
            S: [j.x, j.y + 45],
            W: [j.x - 45, j.y],
            E: [j.x + 45, j.y]
          };
          const [gx, gy] = offsets[arm] || [j.x, j.y];
          this.ctx.beginPath();
          this.ctx.arc(gx, gy, Math.min(10, 3 + count), 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.fillText(`${count} ghost`, gx, gy);
        }
      }
    }
    this.ctx.restore();
  }

  private renderRain(w: number, h: number, isHeavy: boolean) {
    this.ctx.save();
    this.ctx.strokeStyle = isHeavy ? 'rgba(159, 216, 255, 0.4)' : 'rgba(159, 216, 255, 0.2)';
    this.ctx.lineWidth = isHeavy ? 1.5 : 1.0;

    for (const d of this.rainDrops) {
      d.y += d.speed * (isHeavy ? 1.5 : 1.0);
      d.x += 1.5;
      if (d.y > h) {
        d.y = -20;
        d.x = Math.random() * w;
      }
      this.ctx.beginPath();
      this.ctx.moveTo(d.x, d.y);
      this.ctx.lineTo(d.x + 3, d.y + d.len);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private renderFog(w: number, h: number) {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(29, 25, 21, 0.45)';
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();
  }

  private renderCompassAndScale(w: number, h: number) {
    this.ctx.save();
    // Hand-drawn compass
    const cx = w - 40;
    const cy = h - 50;
    this.ctx.strokeStyle = '#6B6153';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    this.ctx.moveTo(cx, cy - 12);
    this.ctx.lineTo(cx, cy + 12);
    this.ctx.stroke();
    this.ctx.fillStyle = '#F2A33A';
    this.ctx.font = '9px "IBM Plex Mono", monospace';
    this.ctx.fillText('N', cx - 3, cy - 14);

    // Scale bar
    this.ctx.strokeStyle = '#6B6153';
    this.ctx.beginPath();
    this.ctx.moveTo(w - 120, h - 25);
    this.ctx.lineTo(w - 60, h - 25);
    this.ctx.moveTo(w - 120, h - 29);
    this.ctx.lineTo(w - 120, h - 21);
    this.ctx.moveTo(w - 60, h - 29);
    this.ctx.lineTo(w - 60, h - 21);
    this.ctx.stroke();
    this.ctx.fillStyle = '#9E917F';
    this.ctx.fillText('100 m', w - 100, h - 32);
    this.ctx.restore();
  }
}
