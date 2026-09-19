import { SimulationFrame, JunctionData, VehicleData } from '../types/simulation';
import { frontendTelemetry } from '../telemetry';

export interface Point2D {
  x: number;
  y: number;
}

export function toIso(wx: number, wy: number, wz: number = 0): Point2D {
  const cos30 = 0.8660254037844386;
  const sin30 = 0.5;
  return {
    x: (wx - wy) * cos30,
    y: (wx + wy) * sin30 - wz
  };
}

export function shadeColor(hex: string, factor: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return hex;
  const r = Math.min(255, Math.max(0, Math.floor(((num >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.floor(((num >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.floor((num & 0xff) * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

interface BuildingDef {
  wx: number;
  wy: number;
  w: number;
  d: number;
  h: number;
  color: string;
  tag?: string;
}

export class CityRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private staticCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private staticDirty: boolean = true;

  public viewMode: 'single' | 'split' | 'compare' | 'ghost' = 'single';
  public selectedJunctionId: string | null = "J2";
  public onJunctionClick: ((jId: string) => void) | null = null;
  public onRoadClick: ((u: string, v: string) => void) | null = null;
  public onCrosswalkClick: ((jId: string, arm: string) => void) | null = null;

  // Camera state (pan and zoom)
  public camera = {
    x: 0,
    y: 0,
    zoom: 1.0,
    initialized: false
  };

  private isDragging: boolean = false;
  private dragStart = { x: 0, y: 0 };
  private lastFrame: SimulationFrame | null = null;

  // Rain particle state
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];

  // Deterministic cityscape buildings
  private buildings: BuildingDef[] = [
    // Hospital Medical Complex (West)
    { wx: 50, wy: 435, w: 75, d: 75, h: 44, color: '#322B25', tag: 'hospital' },
    { wx: 135, wy: 450, w: 45, d: 55, h: 26, color: '#29231E' },
    // North Residential & Commercial
    { wx: 75, wy: 105, w: 70, d: 50, h: 32, color: '#2B2520' },
    { wx: 155, wy: 105, w: 45, d: 50, h: 28, color: '#26201B' },
    { wx: 275, wy: 95, w: 55, d: 50, h: 58, color: '#383029' }, // Clock Tower civic block
    { wx: 345, wy: 100, w: 65, d: 45, h: 44, color: '#2E2721' },
    { wx: 425, wy: 95, w: 70, d: 50, h: 50, color: '#342C25' },
    // Central Market stalls north of J2
    { wx: 535, wy: 105, w: 60, d: 45, h: 22, color: '#28231E' },
    { wx: 610, wy: 100, w: 65, d: 50, h: 38, color: '#2D2721' },
    // East Bus terminal & logistics
    { wx: 735, wy: 95, w: 65, d: 50, h: 35, color: '#302923' },
    { wx: 890, wy: 95, w: 70, d: 55, h: 24, color: '#28221D' },
    { wx: 980, wy: 110, w: 60, d: 45, h: 20, color: '#332822', tag: 'accident' },
    // Central Core blocks
    { wx: 105, wy: 250, w: 85, d: 65, h: 30, color: '#252923' },
    { wx: 105, wy: 335, w: 85, d: 65, h: 34, color: '#2A241F' },
    { wx: 340, wy: 245, w: 65, d: 60, h: 62, color: '#3A322A' },
    { wx: 425, wy: 245, w: 65, d: 60, h: 52, color: '#332B24' },
    { wx: 340, wy: 335, w: 65, d: 60, h: 46, color: '#302922' },
    { wx: 425, wy: 335, w: 65, d: 60, h: 66, color: '#3C332B' },
    // East Logistics corridor
    { wx: 635, wy: 245, w: 70, d: 65, h: 28, color: '#28221D' },
    { wx: 725, wy: 245, w: 65, d: 65, h: 32, color: '#2C251F' },
    { wx: 635, wy: 335, w: 70, d: 65, h: 26, color: '#26201B' },
    { wx: 725, wy: 335, w: 65, d: 65, h: 30, color: '#2A241E' },
    // South perimeter
    { wx: 340, wy: 550, w: 75, d: 55, h: 32, color: '#29231E' },
    { wx: 735, wy: 550, w: 85, d: 55, h: 25, color: '#28221D' }
  ];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const rawCtx = canvas.getContext('2d', { alpha: false })!;
    this.ctx = this.instrumentContext(rawCtx);

    this.staticCanvas = document.createElement('canvas');
    this.staticCtx = this.staticCanvas.getContext('2d', { alpha: false })!;

    this.initRain();
    this.setupListeners();
  }

  private instrumentContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
    const drawMethods = ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage'];
    for (const method of drawMethods) {
      const orig = (ctx as any)[method];
      if (typeof orig === 'function') {
        (ctx as any)[method] = function(...args: any[]) {
          frontendTelemetry.incrementDraw();
          return orig.apply(this, args);
        };
      }
    }
    return ctx;
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
    if (rect && rect.width > 0 && rect.height > 0) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.scale(dpr, dpr);

      this.staticCanvas.width = this.canvas.width;
      this.staticCanvas.height = this.canvas.height;
      this.staticCtx.scale(dpr, dpr);

      this.staticDirty = true;
      if (!this.camera.initialized) {
        this.resetCamera(rect.width, rect.height);
      }
    }
  }

  public resetCamera(viewportW: number, viewportH: number) {
    const spanX = 1180;
    const spanY = 700;
    const zoom = Math.min((viewportW - 60) / spanX, (viewportH - 60) / spanY);
    this.camera.zoom = Math.max(0.6, Math.min(1.4, zoom));
    this.camera.x = viewportW / 2 - 235 * this.camera.zoom;
    this.camera.y = viewportH / 2 - 465 * this.camera.zoom;
    this.camera.initialized = true;
    this.staticDirty = true;
  }

  private setupListeners() {
    // Mouse drag for pan
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.camera.x += dx;
        this.camera.y += dy;
        this.staticDirty = true;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Mouse wheel for zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = Math.min(2.5, Math.max(0.4, this.camera.zoom * factor));
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      this.camera.x = mx - (mx - this.camera.x) * (newZoom / this.camera.zoom);
      this.camera.y = my - (my - this.camera.y) * (newZoom / this.camera.zoom);
      this.camera.zoom = newZoom;
      this.staticDirty = true;
    }, { passive: false });

    // Double click to center junction
    this.canvas.addEventListener('dblclick', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const [isoX, isoY] = this.screenToIso(clickX, clickY);

      if (this.lastFrame) {
        for (const [jId, j] of Object.entries(this.lastFrame.junctions)) {
          const pt = toIso(j.x, j.y, 8);
          if (Math.hypot(isoX - pt.x, isoY - pt.y) <= 35) {
            // Center camera on this junction
            this.camera.x = (this.canvas.clientWidth / 2) - pt.x * this.camera.zoom;
            this.camera.y = (this.canvas.clientHeight / 2) - pt.y * this.camera.zoom;
            this.staticDirty = true;
            return;
          }
        }
      }
    });

    // Single click for junction selection
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const [isoX, isoY] = this.screenToIso(clickX, clickY);

      if (this.lastFrame) {
        for (const [jId, j] of Object.entries(this.lastFrame.junctions)) {
          const pt = toIso(j.x, j.y, 8);
          if (Math.hypot(isoX - pt.x, isoY - pt.y) <= 35) {
            this.selectedJunctionId = jId;
            if (this.onJunctionClick) this.onJunctionClick(jId);
            return;
          }
        }
      }
    });
  }

  private screenToIso(sx: number, sy: number): [number, number] {
    return [
      (sx - this.camera.x) / this.camera.zoom,
      (sy - this.camera.y) / this.camera.zoom
    ];
  }

  public render(frame: SimulationFrame) {
    const t0 = performance.now();
    frontendTelemetry.startDrawCount();

    this.lastFrame = frame;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    if (!this.camera.initialized && w > 0 && h > 0) {
      this.resetCamera(w, h);
    }

    // 1. Render Static Layer to Offscreen Canvas if dirty
    if (this.staticDirty) {
      this.renderStaticLayer(frame, w, h);
      this.staticDirty = false;
    }

    // 2. Clear stage with warm near-black ink #14110F
    this.ctx.fillStyle = '#14110F';
    this.ctx.fillRect(0, 0, w, h);

    // 3. Blit pre-rendered static layer (< 0.05ms)
    this.ctx.drawImage(this.staticCanvas, 0, 0, w, h);

    // 4. Apply camera transform for dynamic elements
    this.ctx.save();
    this.ctx.translate(this.camera.x, this.camera.y);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);

    // 5. Draw dynamic signal glows and phase rings
    this.drawDynamicJunctions(frame);

    // 6. Draw emergency green wave corridor if active
    this.drawEmergencyCorridorWave(frame);

    // 7. Draw 3D extruded vehicles with shadows and motion trails
    this.drawVehicles(frame.vehicles);

    // 8. Draw ghost cues if in Ghost view
    if (this.viewMode === 'ghost' && frame.ghost_queues) {
      this.drawGhostCues(frame);
    }

    this.ctx.restore();

    // 9. Weather atmospheric overlay
    if (frame.weather === 'rain' || frame.weather === 'heavy_rain') {
      this.renderRain(w, h, frame.weather === 'heavy_rain');
    } else if (frame.weather === 'fog') {
      this.renderFog(w, h);
    }

    // 10. Compass and scale indicator
    this.renderCompassAndScale(w, h);

    frontendTelemetry.endDrawCount();
    const duration = performance.now() - t0;
    frontendTelemetry.recordRender(duration);
    frontendTelemetry.recordVehicleCount(frame.vehicles ? frame.vehicles.length : 0);
  }

  // -------------------------------------------------------------
  // STATIC LAYER: Ground Grid, Extruded Roads, Junction Bases, Buildings
  // -------------------------------------------------------------
  private renderStaticLayer(frame: SimulationFrame, w: number, h: number) {
    const sCtx = this.staticCtx;
    sCtx.clearRect(0, 0, w, h);

    // Dark background
    sCtx.fillStyle = '#14110F';
    sCtx.fillRect(0, 0, w, h);

    sCtx.save();
    sCtx.translate(this.camera.x, this.camera.y);
    sCtx.scale(this.camera.zoom, this.camera.zoom);

    // 1. Isometric Ground Plane Grid
    this.drawGroundGrid(sCtx);

    // 2. Extruded Roads & Bevels
    this.drawExtrudedRoads(sCtx, frame);

    // 3. Raised Junction Cylinder Platforms
    this.drawJunctionBases(sCtx, frame);

    // 4. Extruded 3D Context Buildings (Hospital, Warehouses, Towers)
    this.drawContextBuildings(sCtx);

    // 5. Street Light Posts with Ground Warm Glows
    this.drawStreetLights(sCtx, frame);

    sCtx.restore();
  }

  private drawGroundGrid(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = 'rgba(237, 228, 211, 0.04)';
    ctx.lineWidth = 1;

    // Grid lines along X axis
    for (let wx = -100; wx <= 1200; wx += 60) {
      const p0 = toIso(wx, -100, 0);
      const p1 = toIso(wx, 700, 0);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Grid lines along Y axis
    for (let wy = -100; wy <= 700; wy += 60) {
      const p0 = toIso(-100, wy, 0);
      const p1 = toIso(1200, wy, 0);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  private drawExtrudedRoads(ctx: CanvasRenderingContext2D, frame: SimulationFrame) {
    const junctions = frame.junctions;
    const closedSet = new Set(frame.closed_roads.map(e => `${e[0]}_${e[1]}`));
    const accidentSet = new Set(frame.accidents.map(e => `${e[0]}_${e[1]}`));

    const links = [
      ['J1', 'J2', 3], ['J2', 'J3', 2], ['J1', 'J4', 2], ['J2', 'J5', 1],
      ['J3', 'J6', 2], ['J4', 'J5', 2], ['J5', 'J6', 2]
    ];

    const H = 8; // Extrusion height in px

    for (const [u, v, lanes] of links) {
      const ju = junctions[u as string];
      const jv = junctions[v as string];
      if (!ju || !jv) continue;

      const isClosed = closedSet.has(`${u}_${v}`) || closedSet.has(`${v}_${u}`);
      const hasAccident = accidentSet.has(`${u}_${v}`) || accidentSet.has(`${v}_${u}`);

      const roadWidth = (lanes as number) * 12 + 8;
      const dx = jv.x - ju.x;
      const dy = jv.y - ju.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;

      const nx = (-dy / len) * (roadWidth / 2);
      const ny = (dx / len) * (roadWidth / 2);

      // Top face world corners (z = H)
      const P0 = { x: ju.x - nx, y: ju.y - ny };
      const P1 = { x: jv.x - nx, y: jv.y - ny };
      const P2 = { x: jv.x + nx, y: jv.y + ny };
      const P3 = { x: ju.x + nx, y: ju.y + ny };

      const p0 = toIso(P0.x, P0.y, H);
      const p1 = toIso(P1.x, P1.y, H);
      const p2 = toIso(P2.x, P2.y, H);
      const p3 = toIso(P3.x, P3.y, H);

      // Bottom face isometric points (z = 0, y shifts by +H)
      const b0 = { x: p0.x, y: p0.y + H };
      const b1 = { x: p1.x, y: p1.y + H };
      const b2 = { x: p2.x, y: p2.y + H };
      const b3 = { x: p3.x, y: p3.y + H };

      // Side faces (downward extrusion for raised platform look)
      const drawSide = (topA: Point2D, topB: Point2D, botB: Point2D, botA: Point2D, color: string) => {
        if (topB.x < topA.x || (topB.y > topA.y && topB.x <= topA.x)) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(topA.x, topA.y);
          ctx.lineTo(topB.x, topB.y);
          ctx.lineTo(botB.x, botB.y);
          ctx.lineTo(botA.x, botA.y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#14110F';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      };

      drawSide(p0, p1, b1, b0, '#181410');
      drawSide(p1, p2, b2, b1, '#110E0C');
      drawSide(p2, p3, b3, b2, '#14100E');
      drawSide(p3, p0, b0, b3, '#191511');

      // Top face (asphalt platform)
      ctx.fillStyle = isClosed ? '#241E1A' : '#1E1915';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#322A23';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Center dashed lane divider
      const c0 = toIso(ju.x, ju.y, H + 0.2);
      const c1 = toIso(jv.x, jv.y, H + 0.2);
      ctx.strokeStyle = 'rgba(237, 228, 211, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Barricade on closed roads
      if (isClosed) {
        this.drawBarricadeIso(ctx, (p0.x + p2.x) / 2, (p0.y + p2.y) / 2);
      }

      // Accident site marker
      if (hasAccident) {
        this.drawAccidentHazardIso(ctx, (p0.x + p2.x) / 2, (p0.y + p2.y) / 2);
      }
    }
  }

  private drawJunctionBases(ctx: CanvasRenderingContext2D, frame: SimulationFrame) {
    const H = 8;
    const rx = 32;
    const ry = 18;

    for (const [jId, j] of Object.entries(frame.junctions)) {
      const topCenter = toIso(j.x, j.y, H);
      const botCenter = toIso(j.x, j.y, 0);

      // Beveled circular platform bottom & side
      ctx.fillStyle = '#171310';
      ctx.beginPath();
      ctx.ellipse(botCenter.x, botCenter.y, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(topCenter.x - rx, topCenter.y);
      ctx.ellipse(topCenter.x, topCenter.y, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(botCenter.x + rx, botCenter.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2A231C';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Platform Top Face
      const isSelected = this.selectedJunctionId === jId;
      ctx.fillStyle = isSelected ? '#2C251F' : '#221D18';
      ctx.beginPath();
      ctx.ellipse(topCenter.x, topCenter.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#F2A33A' : '#3E342B';
      ctx.lineWidth = isSelected ? 2 : 1.2;
      ctx.stroke();

      // Outer quantum plan coordination ring
      if (j.proposed_plan_id !== undefined) {
        ctx.strokeStyle = 'rgba(159, 216, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(topCenter.x, topCenter.y, rx + 4, ry + 2.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawContextBuildings(ctx: CanvasRenderingContext2D) {
    for (const b of this.buildings) {
      const P0 = { x: b.wx, y: b.wy };
      const P1 = { x: b.wx + b.w, y: b.wy };
      const P2 = { x: b.wx + b.w, y: b.wy + b.d };
      const P3 = { x: b.wx, y: b.wy + b.d };

      const t0 = toIso(P0.x, P0.y, b.h);
      const t1 = toIso(P1.x, P1.y, b.h);
      const t2 = toIso(P2.x, P2.y, b.h);
      const t3 = toIso(P3.x, P3.y, b.h);

      const b0 = toIso(P0.x, P0.y, 0);
      const b1 = toIso(P1.x, P1.y, 0);
      const b2 = toIso(P2.x, P2.y, 0);
      const b3 = toIso(P3.x, P3.y, 0);

      // Left-facing side [b3, b2, t2, t3] (base * 0.75)
      ctx.fillStyle = shadeColor(b.color, 0.75);
      ctx.beginPath();
      ctx.moveTo(b3.x, b3.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#120F0D';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Right-facing side [b2, b1, t1, t2] (base * 0.55)
      ctx.fillStyle = shadeColor(b.color, 0.55);
      ctx.beginPath();
      ctx.moveTo(b2.x, b2.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#120F0D';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Roof top face [t0, t1, t2, t3]
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shadeColor(b.color, 1.3);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Hospital Roof Cross Landmark
      if (b.tag === 'hospital') {
        const cx = (t0.x + t2.x) / 2;
        const cy = (t0.y + t2.y) / 2;

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#E5533D';
        ctx.fillRect(cx - 2, cy - 6, 4, 12);
        ctx.fillRect(cx - 7, cy - 2, 14, 4);

        ctx.fillStyle = '#EDE4D3';
        ctx.font = 'bold 11px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('HOSPITAL', cx, cy - 14);
      }

      // Accident Hazard Pylon Marker
      if (b.tag === 'accident') {
        const cx = (t0.x + t2.x) / 2;
        const cy = (t0.y + t2.y) / 2;
        ctx.fillStyle = '#F5D04A';
        ctx.font = 'bold 10px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('[!] HAZARD ZONE', cx, cy - 8);
      }
    }
  }

  private drawStreetLights(ctx: CanvasRenderingContext2D, frame: SimulationFrame) {
    for (const j of Object.values(frame.junctions)) {
      const offsets = [
        { wx: j.x - 24, wy: j.y - 24 },
        { wx: j.x + 24, wy: j.y + 24 }
      ];

      for (const off of offsets) {
        const basePt = toIso(off.wx, off.wy, 0);
        const lampPt = toIso(off.wx, off.wy, 24);

        // Ground warm glow
        const glow = ctx.createRadialGradient(basePt.x, basePt.y, 0, basePt.x, basePt.y, 16);
        glow.addColorStop(0, 'rgba(242, 163, 58, 0.22)');
        glow.addColorStop(1, 'rgba(242, 163, 58, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(basePt.x, basePt.y, 16, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Thin amber post
        ctx.strokeStyle = '#3E342B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(basePt.x, basePt.y);
        ctx.lineTo(lampPt.x, lampPt.y);
        ctx.stroke();

        // Lantern amber glowing dot
        ctx.fillStyle = '#F2A33A';
        ctx.beginPath();
        ctx.arc(lampPt.x, lampPt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // -------------------------------------------------------------
  // DYNAMIC LAYER: Signal Glows, Phase Arcs, Queue Bubbles, Countdowns
  // -------------------------------------------------------------
  private drawDynamicJunctions(frame: SimulationFrame) {
    const H = 8;
    const rx = 32;
    const ry = 18;

    for (const [jId, j] of Object.entries(frame.junctions)) {
      const isSelected = this.selectedJunctionId === jId;
      const topPt = toIso(j.x, j.y, H);

      // 1. Traffic lights cast colored glow on road below (radial gradient)
      const color = j.sub_phase === 'YELLOW' ? '#F5D04A' : (j.sub_phase === 'GREEN' ? '#6CC58A' : '#E5533D');
      const glowRgba = j.sub_phase === 'YELLOW'
        ? 'rgba(245, 208, 74, 0.35)'
        : (j.sub_phase === 'GREEN' ? 'rgba(108, 197, 138, 0.32)' : 'rgba(229, 83, 61, 0.30)');

      const glow = this.ctx.createRadialGradient(topPt.x, topPt.y, 0, topPt.x, topPt.y, 50);
      glow.addColorStop(0, glowRgba);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = glow;
      this.ctx.beginPath();
      this.ctx.ellipse(topPt.x, topPt.y, 52, 28, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // 2. Active Signal Phase Ring on platform
      const countdownPct = Math.min(1.0, Math.max(0.0, j.countdown / 40.0));
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.ellipse(
        topPt.x, topPt.y, rx - 4, ry - 2.5, 0,
        -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * countdownPct
      );
      this.ctx.stroke();

      // 3. Tabular Mono Countdown Badge in dark plate
      this.ctx.fillStyle = '#14110F';
      this.ctx.strokeStyle = '#322A23';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(topPt.x - 18, topPt.y - 8, 36, 16, 4);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#EDE4D3';
      this.ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(`${Math.ceil(j.countdown)}s`, topPt.x, topPt.y);

      // 4. Junction Name with dark backing plate below
      this.ctx.fillStyle = 'rgba(20, 17, 15, 0.88)';
      this.ctx.strokeStyle = isSelected ? '#F2A33A' : '#322A23';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(topPt.x - 45, topPt.y + 24, 90, 18, 4);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = isSelected ? '#F2A33A' : '#EDE4D3';
      this.ctx.font = 'bold 11px "IBM Plex Sans", sans-serif';
      this.ctx.fillText(`${j.id}: ${j.name}`, topPt.x, topPt.y + 33);

      // 5. Approach Queues in isometric perspective
      const armOffsets: Record<string, [number, number]> = {
        N: [j.x, j.y - 28],
        S: [j.x, j.y + 28],
        W: [j.x - 28, j.y],
        E: [j.x + 28, j.y]
      };

      for (const [arm, [wx, wy]] of Object.entries(armOffsets)) {
        const qCount = j.queues[arm as 'N' | 'S' | 'E' | 'W'] || 0;
        if (qCount > 0) {
          const qPt = toIso(wx, wy, H + 2);
          this.ctx.fillStyle = qCount > 8 ? '#E5533D' : (qCount > 4 ? '#F5D04A' : '#6CC58A');
          this.ctx.beginPath();
          this.ctx.arc(qPt.x, qPt.y, Math.min(7, 2 + qCount * 0.6), 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }
  }

  // -------------------------------------------------------------
  // VEHICLES: 3D Extruded Boxes, Shadows, Lights, Motion Trails
  // -------------------------------------------------------------
  private drawVehicles(vehicles: VehicleData[]) {
    if (!vehicles || vehicles.length === 0) return;

    for (const veh of vehicles) {
      if (!veh.edge || !veh.edge.includes('->')) continue;
      const [u, v] = veh.edge.split('->');
      const ju = this.lastFrame?.junctions[u];
      const jv = this.lastFrame?.junctions[v];
      if (!ju || !jv) continue;

      const progress = Math.min(1.0, Math.max(0.0, veh.position / 300.0));
      const dx = jv.x - ju.x;
      const dy = jv.y - ju.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;

      const udirX = dx / len;
      const udirY = dy / len;
      const unormX = -udirY;
      const unormY = udirX;

      // Lateral lane offset
      const laneOffset = ((veh.lane || 0) - 0.5) * 6;
      const cx = ju.x + dx * progress + unormX * laneOffset;
      const cy = ju.y + dy * progress + unormY * laneOffset;

      // Sizes by type (world space)
      let L = 9;
      let W = 4.5;
      let H = 3.5;
      if (veh.type === 'two_wheeler') {
        L = 5; W = 2.5; H = 2.5;
      } else if (veh.type === 'bus') {
        L = 16; W = 5.5; H = 5.5;
      } else if (veh.type === 'ambulance') {
        L = 13; W = 5.5; H = 4.5;
      }

      // Base corners on road top platform (z = 8)
      const roadZ = 8;
      const C0 = { x: cx + udirX * (L / 2) + unormX * (W / 2), y: cy + udirY * (L / 2) + unormY * (W / 2) };
      const C1 = { x: cx - udirX * (L / 2) + unormX * (W / 2), y: cy - udirY * (L / 2) + unormY * (W / 2) };
      const C2 = { x: cx - udirX * (L / 2) - unormX * (W / 2), y: cy - udirY * (L / 2) - unormY * (W / 2) };
      const C3 = { x: cx + udirX * (L / 2) - unormX * (W / 2), y: cy + udirY * (L / 2) - unormY * (W / 2) };

      const b0 = toIso(C0.x, C0.y, roadZ);
      const b1 = toIso(C1.x, C1.y, roadZ);
      const b2 = toIso(C2.x, C2.y, roadZ);
      const b3 = toIso(C3.x, C3.y, roadZ);

      // Top corners at z = roadZ + H (y decreases by H)
      const t0 = { x: b0.x, y: b0.y - H };
      const t1 = { x: b1.x, y: b1.y - H };
      const t2 = { x: b2.x, y: b2.y - H };
      const t3 = { x: b3.x, y: b3.y - H };

      // 1. Elliptical shadow under vehicle
      const shadowPt = toIso(cx, cy, roadZ - 0.2);
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      this.ctx.beginPath();
      this.ctx.ellipse(shadowPt.x, shadowPt.y + 1, L * 0.65, W * 0.55, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // 2. Soft motion trail behind vehicle
      const rearPt = toIso(cx - udirX * (L / 2), cy - udirY * (L / 2), roadZ + 1);
      const trailEnd = toIso(cx - udirX * (L / 2 + 14), cy - udirY * (L / 2 + 14), roadZ + 1);
      const trailGrad = this.ctx.createLinearGradient(rearPt.x, rearPt.y, trailEnd.x, trailEnd.y);
      const baseCol = veh.color || '#EDE4D3';
      trailGrad.addColorStop(0, 'rgba(237, 228, 211, 0.28)');
      trailGrad.addColorStop(1, 'rgba(237, 228, 211, 0)');
      this.ctx.strokeStyle = trailGrad;
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.moveTo(rearPt.x, rearPt.y);
      this.ctx.lineTo(trailEnd.x, trailEnd.y);
      this.ctx.stroke();

      // 3. Extruded 3D Box Side Faces
      const drawSide = (topA: Point2D, topB: Point2D, botB: Point2D, botA: Point2D, col: string) => {
        if (botB.x <= botA.x) {
          this.ctx.fillStyle = col;
          this.ctx.beginPath();
          this.ctx.moveTo(topA.x, topA.y);
          this.ctx.lineTo(topB.x, topB.y);
          this.ctx.lineTo(botB.x, botB.y);
          this.ctx.lineTo(botA.x, botA.y);
          this.ctx.closePath();
          this.ctx.fill();
        }
      };

      const leftShade = shadeColor(baseCol, 0.75);
      const rightShade = shadeColor(baseCol, 0.55);

      drawSide(t0, t1, b1, b0, leftShade);
      drawSide(t1, t2, b2, b1, rightShade);
      drawSide(t2, t3, b3, b2, rightShade);
      drawSide(t3, t0, b0, b3, leftShade);

      // 4. Top Face
      this.ctx.fillStyle = baseCol;
      this.ctx.beginPath();
      this.ctx.moveTo(t0.x, t0.y);
      this.ctx.lineTo(t1.x, t1.y);
      this.ctx.lineTo(t2.x, t2.y);
      this.ctx.lineTo(t3.x, t3.y);
      this.ctx.closePath();
      this.ctx.fill();

      // 5. Special Ambulance Siren Flash
      if (veh.type === 'ambulance') {
        const flash = Math.floor(Date.now() / 120) % 2 === 0;
        const sirenCol = flash ? '#E5533D' : '#4FA3D9';
        const midTop = { x: (t0.x + t2.x) / 2, y: (t0.y + t2.y) / 2 };

        // Siren glow
        const sirenGlow = this.ctx.createRadialGradient(midTop.x, midTop.y, 0, midTop.x, midTop.y, 14);
        sirenGlow.addColorStop(0, flash ? 'rgba(229, 83, 61, 0.65)' : 'rgba(79, 163, 217, 0.65)');
        sirenGlow.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = sirenGlow;
        this.ctx.beginPath();
        this.ctx.arc(midTop.x, midTop.y, 14, 0, Math.PI * 2);
        this.ctx.fill();

        // Beacon dot
        this.ctx.fillStyle = sirenCol;
        this.ctx.beginPath();
        this.ctx.arc(midTop.x, midTop.y, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawEmergencyCorridorWave(frame: SimulationFrame) {
    const corridor = frame.corridor;
    if (!corridor || !corridor.active || !corridor.route || corridor.route.length < 2) return;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(108, 197, 138, 0.45)';
    this.ctx.lineWidth = 10;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    for (let i = 0; i < corridor.route.length; i++) {
      const j = frame.junctions[corridor.route[i]];
      if (j) {
        const pt = toIso(j.x, j.y, 8);
        if (i === 0) this.ctx.moveTo(pt.x, pt.y);
        else this.ctx.lineTo(pt.x, pt.y);
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

  private drawGhostCues(frame: SimulationFrame) {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(242, 163, 58, 0.25)';
    this.ctx.strokeStyle = 'rgba(242, 163, 58, 0.6)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([3, 3]);

    for (const [jId, qObj] of Object.entries(frame.ghost_queues)) {
      const j = frame.junctions[jId];
      if (!j) continue;

      const armOffsets: Record<string, [number, number]> = {
        N: [j.x, j.y - 34],
        S: [j.x, j.y + 34],
        W: [j.x - 34, j.y],
        E: [j.x + 34, j.y]
      };

      for (const [arm, [wx, wy]] of Object.entries(armOffsets)) {
        const gQ = (qObj as any)[arm] || 0;
        if (gQ > 0) {
          const pt = toIso(wx, wy, 10);
          this.ctx.beginPath();
          this.ctx.arc(pt.x, pt.y, Math.min(10, 3 + gQ * 0.7), 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
      }
    }
    this.ctx.restore();
  }

  private drawBarricadeIso(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.fillStyle = '#E5533D';
    ctx.strokeStyle = '#EDE4D3';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 14, y - 6, 28, 12);
    ctx.strokeRect(x - 14, y - 6, 28, 12);
    ctx.fillStyle = '#EDE4D3';
    ctx.font = 'bold 9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CLOSED', x, y + 3);
    ctx.restore();
  }

  private drawAccidentHazardIso(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    const flash = Math.floor(Date.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#E5533D' : '#F5D04A';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14110F';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y + 3);
    ctx.restore();
  }

  private renderRain(w: number, h: number, isHeavy: boolean) {
    this.ctx.save();
    this.ctx.strokeStyle = isHeavy ? 'rgba(159, 216, 255, 0.45)' : 'rgba(159, 216, 255, 0.22)';
    this.ctx.lineWidth = isHeavy ? 1.5 : 1;

    for (const drop of this.rainDrops) {
      this.ctx.beginPath();
      this.ctx.moveTo(drop.x, drop.y);
      this.ctx.lineTo(drop.x - 3, drop.y + drop.len);
      this.ctx.stroke();

      drop.y += drop.speed;
      drop.x -= 1.5;
      if (drop.y > h) {
        drop.y = -10;
        drop.x = Math.random() * w;
      }
    }
    this.ctx.restore();
  }

  private renderFog(w: number, h: number) {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(29, 25, 21, 0.38)';
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();
  }

  private renderCompassAndScale(w: number, h: number) {
    this.ctx.save();
    const cx = 35;
    const cy = h - 35;
    this.ctx.strokeStyle = '#3E342B';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    this.ctx.stroke();

    const nPt = toIso(0, -20, 0);
    const nLen = Math.hypot(nPt.x, nPt.y);
    const nx = (nPt.x / nLen) * 14;
    const ny = (nPt.y / nLen) * 14;

    this.ctx.strokeStyle = '#F2A33A';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(cx + nx, cy + ny);
    this.ctx.stroke();

    this.ctx.fillStyle = '#F2A33A';
    this.ctx.font = 'bold 9px "IBM Plex Mono", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('N', cx + nx * 1.3, cy + ny * 1.3);

    // Scale bar
    this.ctx.fillStyle = 'rgba(20, 17, 15, 0.7)';
    this.ctx.fillRect(cx + 30, cy - 8, 70, 16);
    this.ctx.strokeStyle = '#EDE4D3';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cx + 35, cy + 4);
    this.ctx.lineTo(cx + 95, cy + 4);
    this.ctx.stroke();

    this.ctx.fillStyle = '#9E917F';
    this.ctx.font = '9px "IBM Plex Mono", monospace';
    this.ctx.fillText('300m', cx + 65, cy - 1);

    this.ctx.restore();
  }
}
