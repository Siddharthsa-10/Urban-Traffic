import { camera, worldToScreen } from "./iso";
import { LinkState, JunctionState } from "../types";

export class StaticLayer {
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private needsRedraw: boolean = true;

  private lastOriginX: number = -99999;
  private lastOriginY: number = -99999;
  private lastScale: number = -99999;
  private lastLinksKey: string = "";

  // City buildings placed away from roads/junctions
  private buildings: Array<{ wx: number; wy: number; w: number; h: number; height_z: number; color: string; type?: string }> = [];

  constructor() {
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d")!;
    this.generateCityBuildings();
  }

  public invalidate() {
    this.needsRedraw = true;
  }

  public render(
    destCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    links: LinkState[],
    junctions: Record<string, JunctionState>
  ) {
    const linksKey = links.map(l => `${l.id}:${l.is_closed ? 1 : 0}:${l.has_accident ? 1 : 0}`).join(",");
    const linksChanged = linksKey !== this.lastLinksKey;

    const cameraChanged =
      camera.originX !== this.lastOriginX ||
      camera.originY !== this.lastOriginY ||
      camera.scale !== this.lastScale;

    if (
      this.needsRedraw ||
      linksChanged ||
      cameraChanged ||
      this.offscreenCanvas.width !== width ||
      this.offscreenCanvas.height !== height
    ) {
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
      this.lastOriginX = camera.originX;
      this.lastOriginY = camera.originY;
      this.lastScale = camera.scale;
      this.lastLinksKey = linksKey;

      this.drawToOffscreen(width, height, links, junctions);
      this.needsRedraw = false;
    }

    destCtx.drawImage(this.offscreenCanvas, 0, 0);
  }

  private generateCityBuildings() {
    this.buildings = [];
    // City Hospital West at (-45, 260)
    this.buildings.push({ wx: -65, wy: 250, w: 40, h: 45, height_z: 26, color: "#2B2620", type: "hospital" });
    // Accident Site East connected to J2 at (435, 70)
    this.buildings.push({ wx: 435, wy: 70, w: 32, h: 32, height_z: 16, color: "#38231C", type: "site" });

    // Scattered blocks placed in open parcels between 2x2 grid (not overlapping roads)
    const blocks = [
      // Top row open parcels (north of J1-J2 arterial)
      { wx: 160, wy: 20, w: 50, h: 40, bz: 24 },
      { wx: 240, wy: 20, w: 45, h: 35, bz: 28 },
      // Interior block between J1, J2, J3, J4
      { wx: 160, wy: 160, w: 55, h: 50, bz: 36 },
      { wx: 230, wy: 170, w: 50, h: 45, bz: 30 },
      // Bottom open parcels (south of J3-J4 link)
      { wx: 160, wy: 370, w: 55, h: 45, bz: 25 },
      { wx: 240, wy: 370, w: 50, h: 40, bz: 28 },
    ];

    for (const b of blocks) {
      this.buildings.push({
        wx: b.wx,
        wy: b.wy,
        w: b.w,
        h: b.h,
        height_z: b.bz,
        color: "#221D18",
      });
    }
  }

  private drawToOffscreen(
    width: number,
    height: number,
    links: LinkState[],
    junctions: Record<string, JunctionState>
  ) {
    const ctx = this.offscreenCtx;
    ctx.fillStyle = "#14110F";
    ctx.fillRect(0, 0, width, height);

    // 1. Subtle ground grid
    ctx.strokeStyle = "#1B1713";
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = -100; x <= 800; x += step) {
      const p1 = worldToScreen(x, -100, 0);
      const p2 = worldToScreen(x, 500, 0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let y = -100; y <= 500; y += step) {
      const p1 = worldToScreen(-100, y, 0);
      const p2 = worldToScreen(800, y, 0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 2. Extruded 3D Building Blocks (drawn on ground behind/between roads)
    for (const b of this.buildings) {
      this.drawBuilding(ctx, b);
    }

    // 3. Extruded Road Segments (8px depth, 3-tone shading)
    const roadDepth = 8;
    for (const link of links) {
      if (link.is_8_junction_only) continue;
      const fromJ = junctions[link.from] || this.getSpecialSitePos(link.from);
      const toJ = junctions[link.to] || this.getSpecialSitePos(link.to);
      if (!fromJ || !toJ) continue;

      const rw = link.lanes * 5.0; // half road width
      const dx = toJ.world_x - fromJ.world_x;
      const dy = toJ.world_y - fromJ.world_y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-3) continue;

      const nx = (-dy / len) * rw;
      const ny = (dx / len) * rw;

      // 4 corners of top face
      const p1 = worldToScreen(fromJ.world_x + nx, fromJ.world_y + ny, 0);
      const p2 = worldToScreen(toJ.world_x + nx, toJ.world_y + ny, 0);
      const p3 = worldToScreen(toJ.world_x - nx, toJ.world_y - ny, 0);
      const p4 = worldToScreen(fromJ.world_x - nx, fromJ.world_y - ny, 0);

      // Extruded side face (8px deep along z)
      const p2_bot = worldToScreen(toJ.world_x + nx, toJ.world_y + ny, -roadDepth);
      const p3_bot = worldToScreen(toJ.world_x - nx, toJ.world_y - ny, -roadDepth);

      // Side face tone
      if (link.is_closed) {
        ctx.fillStyle = "#260B0B";
      } else if (link.has_accident) {
        ctx.fillStyle = "#2B1A0D";
      } else {
        ctx.fillStyle = "#181411";
      }
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p3_bot.x, p3_bot.y);
      ctx.lineTo(p2_bot.x, p2_bot.y);
      ctx.closePath();
      ctx.fill();

      // Top road face
      if (link.is_closed) {
        ctx.fillStyle = "#3F1313";
      } else if (link.has_accident) {
        ctx.fillStyle = "#352214";
      } else {
        ctx.fillStyle = link.is_underpass ? "#1E1A16" : (link.is_arterial ? "#2A241E" : "#241F1A");
      }
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();

      // Border outline for closed or incident road
      if (link.is_closed) {
        ctx.strokeStyle = "rgba(229, 83, 61, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw diagonal hazard stripes across closed road
        ctx.save();
        ctx.strokeStyle = "rgba(229, 83, 61, 0.25)";
        ctx.lineWidth = 2;
        const steps = 6;
        for (let s = 1; s < steps; s++) {
          const t1 = s / steps;
          const t2 = (s + 0.5) / steps;
          const sx1 = p1.x + (p2.x - p1.x) * t1;
          const sy1 = p1.y + (p2.y - p1.y) * t1;
          const sx2 = p4.x + (p3.x - p4.x) * Math.min(1.0, t2);
          const sy2 = p4.y + (p3.y - p4.y) * Math.min(1.0, t2);
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        }
        ctx.restore();
      } else if (link.has_accident) {
        ctx.strokeStyle = "rgba(242, 163, 58, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Dashed lane divider line (only when open)
      if (!link.is_closed) {
        const mid1 = worldToScreen(fromJ.world_x, fromJ.world_y, 0.5);
        const mid2 = worldToScreen(toJ.world_x, toJ.world_y, 0.5);
        ctx.strokeStyle = "rgba(237, 228, 211, 0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(mid1.x, mid1.y);
        ctx.lineTo(mid2.x, mid2.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 4. Raised Beveled Junction Platforms (exact screen position = worldToScreen(j.x, j.y, 0))
    for (const j of Object.values(junctions)) {
      const pCenter = worldToScreen(j.world_x, j.world_y, 0);
      const radius = 24 * camera.scale;

      // Platform shadow
      ctx.fillStyle = "rgba(10, 8, 7, 0.6)";
      ctx.beginPath();
      ctx.ellipse(pCenter.x, pCenter.y + 6, radius * 1.05, radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // Extruded cylinder wall (base * 0.65)
      ctx.fillStyle = "#1E1A16";
      ctx.beginPath();
      ctx.ellipse(pCenter.x, pCenter.y + 4, radius, radius * 0.5, 0, 0, Math.PI);
      ctx.lineTo(pCenter.x - radius, pCenter.y);
      ctx.ellipse(pCenter.x, pCenter.y, radius, radius * 0.5, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();

      // Beveled top circle
      ctx.fillStyle = "#2D2620";
      ctx.beginPath();
      ctx.ellipse(pCenter.x, pCenter.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#3D342C";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawBuilding(ctx: CanvasRenderingContext2D, b: any) {
    const p1 = worldToScreen(b.wx, b.wy, 0);
    const p2 = worldToScreen(b.wx + b.w, b.wy, 0);
    const p3 = worldToScreen(b.wx + b.w, b.wy + b.h, 0);
    const p4 = worldToScreen(b.wx, b.wy + b.h, 0);

    const t1 = worldToScreen(b.wx, b.wy, b.height_z);
    const t2 = worldToScreen(b.wx + b.w, b.wy, b.height_z);
    const t3 = worldToScreen(b.wx + b.w, b.wy + b.h, b.height_z);
    const t4 = worldToScreen(b.wx, b.wy + b.h, b.height_z);

    // Left face
    ctx.fillStyle = b.type === "hospital" ? "#221E19" : (b.type === "site" ? "#2C1B16" : "#1B1713");
    ctx.beginPath();
    ctx.moveTo(p4.x, p4.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.lineTo(t4.x, t4.y);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = b.type === "hospital" ? "#1A1713" : (b.type === "site" ? "#221511" : "#161310");
    ctx.beginPath();
    ctx.moveTo(p3.x, p3.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();

    // Top face
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.lineTo(t4.x, t4.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3A3128";
    ctx.stroke();

    // Hospital roof symbol: red cross on white square
    if (b.type === "hospital") {
      const cx = (t1.x + t3.x) / 2;
      const cy = (t1.y + t3.y) / 2;
      ctx.fillStyle = "#EDE4D3";
      ctx.fillRect(cx - 7, cy - 7, 14, 14);
      ctx.fillStyle = "#E5533D";
      ctx.fillRect(cx - 2, cy - 6, 4, 12);
      ctx.fillRect(cx - 6, cy - 2, 12, 4);
    }
    // Incident site roof symbol: hazard marker
    if (b.type === "site") {
      const cx = (t1.x + t3.x) / 2;
      const cy = (t1.y + t3.y) / 2;
      ctx.fillStyle = "#E5533D";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("!", cx, cy + 4);
    }
  }

  private getSpecialSitePos(id: string): { world_x: number; world_y: number } | null {
    if (id === "HOSP") return { world_x: -30.0, world_y: 300.0 };
    if (id === "SITE") return { world_x: 450.0, world_y: 100.0 };
    return null;
  }
}
