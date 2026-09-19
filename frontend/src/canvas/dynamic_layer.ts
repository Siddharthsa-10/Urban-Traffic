import { camera, worldToScreen } from "./iso";
import { VehicleState, JunctionState, LinkState, CorridorState } from "../types";

export class DynamicLayer {
  private rainDrops: Array<{ x: number; y: number; length: number; speed: number }> = [];
  public isGhostViewActive: boolean = false;
  public ghostVehicles: Array<{ id: string; original_id: string; link: string; world_x: number; world_y: number; projected_pos: number; is_congested: boolean }> = [];

  constructor() {
    for (let i = 0; i < 180; i++) {
      this.rainDrops.push({
        x: Math.random() * 1920,
        y: Math.random() * 1080,
        length: 8 + Math.random() * 14,
        speed: 12 + Math.random() * 10,
      });
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    vehicles: VehicleState[],
    junctions: Record<string, JunctionState>,
    links: LinkState[],
    corridor: CorridorState,
    weather: string,
    width: number,
    height: number,
    animTime: number
  ) {
    const linkMap = new Map<string, LinkState>();
    for (const l of links) linkMap.set(l.id, l);

    // 1. Signal Light Glow Casts on Road
    this.renderSignalGlows(ctx, junctions);

    // 2. Cold Light Wave along Emergency Corridor
    if (corridor.is_active && corridor.route) {
      this.renderCorridorWave(ctx, corridor, junctions, animTime);
    }

    // 3. Vehicles Rendering (3D extruded boxes with elliptical shadows)
    for (const veh of vehicles) {
      const link = linkMap.get(veh.link);
      if (!link) continue;

      const fromPos = this.getNodePos(link.from, junctions);
      const toPos = this.getNodePos(link.to, junctions);
      if (!fromPos || !toPos) continue;

      const frac = Math.min(1.0, Math.max(0.0, veh.pos / Math.max(1.0, link.length_m)));
      const wx = fromPos.world_x + (toPos.world_x - fromPos.world_x) * frac;
      const wy = fromPos.world_y + (toPos.world_y - fromPos.world_y) * frac;

      const dx = toPos.world_x - fromPos.world_x;
      const dy = toPos.world_y - fromPos.world_y;
      const angle = Math.atan2(dy, dx);

      this.drawVehicle(ctx, wx, wy, angle, veh, animTime);
    }

    // 3b. Ghost Vehicles (Predicted trajectory under unoptimized plan)
    if (this.isGhostViewActive && this.ghostVehicles.length > 0) {
      this.renderGhostVehicles(ctx, this.ghostVehicles, animTime);
    }

    // 4. Pedestrian Crossings
    this.renderPedestrians(ctx, junctions, animTime);

    // 5. Weather Effects
    if (weather === "RAIN" || weather === "HEAVY_RAIN") {
      this.renderRain(ctx, width, height, weather === "HEAVY_RAIN");
    } else if (weather === "FOG") {
      this.renderFog(ctx, width, height);
    }
  }

  private drawVehicle(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wy: number,
    angle: number,
    veh: VehicleState,
    animTime: number
  ) {
    const pCenter = worldToScreen(wx, wy, 0);

    let len = 7.0;
    let wid = 3.5;
    let heightZ = 3.2;
    let baseColor = "#EDE4D3";

    if (veh.type === "two_wheeler") {
      len = 3.5; wid = 1.6; heightZ = 2.0; baseColor = "#F2A33A";
    } else if (veh.type === "auto") {
      len = 4.5; wid = 2.4; heightZ = 2.6; baseColor = "#F5D04A";
    } else if (veh.type === "car") {
      len = 7.5; wid = 3.6; heightZ = 3.0; baseColor = "#EDE4D3";
    } else if (veh.type === "bus") {
      len = 13.0; wid = 4.8; heightZ = 4.5; baseColor = "#6CC58A";
    } else if (veh.type === "ambulance") {
      len = 9.5; wid = 4.2; heightZ = 3.8; baseColor = "#9FD8FF";
    }

    // Elliptical shadow on ground
    ctx.fillStyle = "rgba(10, 8, 7, 0.45)";
    ctx.beginPath();
    ctx.ellipse(pCenter.x, pCenter.y + 1, len * 0.9 * camera.scale, wid * 0.6 * camera.scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3D Extruded Box
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const hL = len / 2.0;
    const hW = wid / 2.0;

    const corners = [
      { wx: wx + cosA * hL - sinA * hW, wy: wy + sinA * hL + cosA * hW },
      { wx: wx + cosA * hL + sinA * hW, wy: wy + sinA * hL - cosA * hW },
      { wx: wx - cosA * hL + sinA * hW, wy: wy - sinA * hL - cosA * hW },
      { wx: wx - cosA * hL - sinA * hW, wy: wy - sinA * hL + cosA * hW },
    ];

    const pBot = corners.map((c) => worldToScreen(c.wx, c.wy, 0));
    const pTop = corners.map((c) => worldToScreen(c.wx, c.wy, heightZ));

    // Left face
    ctx.fillStyle = this.adjustBrightness(baseColor, 0.75);
    ctx.beginPath();
    ctx.moveTo(pBot[3].x, pBot[3].y);
    ctx.lineTo(pBot[2].x, pBot[2].y);
    ctx.lineTo(pTop[2].x, pTop[2].y);
    ctx.lineTo(pTop[3].x, pTop[3].y);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = this.adjustBrightness(baseColor, 0.55);
    ctx.beginPath();
    ctx.moveTo(pBot[2].x, pBot[2].y);
    ctx.lineTo(pBot[1].x, pBot[1].y);
    ctx.lineTo(pTop[1].x, pTop[1].y);
    ctx.lineTo(pTop[2].x, pTop[2].y);
    ctx.closePath();
    ctx.fill();

    // Top face
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(pTop[0].x, pTop[0].y);
    ctx.lineTo(pTop[1].x, pTop[1].y);
    ctx.lineTo(pTop[2].x, pTop[2].y);
    ctx.lineTo(pTop[3].x, pTop[3].y);
    ctx.closePath();
    ctx.fill();

    // Ambulance pulsing siren light
    if (veh.type === "ambulance") {
      const isRed = Math.floor(animTime * 6) % 2 === 0;
      const sirenColor = isRed ? "#E5533D" : "#9FD8FF";
      const topCenter = worldToScreen(wx, wy, heightZ + 1.2);
      ctx.fillStyle = sirenColor;
      ctx.beginPath();
      ctx.arc(topCenter.x, topCenter.y, 4, 0, Math.PI * 2);
      ctx.fill();

      const aura = ctx.createRadialGradient(topCenter.x, topCenter.y, 1, topCenter.x, topCenter.y, 18);
      aura.addColorStop(0, sirenColor);
      aura.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(topCenter.x, topCenter.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderSignalGlows(ctx: CanvasRenderingContext2D, junctions: Record<string, JunctionState>) {
    for (const j of Object.values(junctions)) {
      const p = worldToScreen(j.world_x, j.world_y, 0);
      const color = j.is_green ? "#6CC58A" : (j.is_yellow ? "#F5D04A" : "#E5533D");

      const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 35 * camera.scale);
      glow.addColorStop(0, color);
      glow.addColorStop(0.35, this.hexToRgba(color, 0.45));
      glow.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 35 * camera.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderCorridorWave(
    ctx: CanvasRenderingContext2D,
    corridor: CorridorState,
    junctions: Record<string, JunctionState>,
    animTime: number
  ) {
    ctx.save();
    ctx.strokeStyle = "#9FD8FF";
    ctx.lineWidth = 3 * camera.scale;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -animTime * 25;

    ctx.beginPath();
    for (let k = 0; k < corridor.route.length; k++) {
      const node = corridor.route[k];
      const pos = this.getNodePos(node, junctions);
      if (!pos) continue;
      const p = worldToScreen(pos.world_x, pos.world_y, 2);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private renderPedestrians(
    ctx: CanvasRenderingContext2D,
    junctions: Record<string, JunctionState>,
    animTime: number
  ) {
    for (const j of Object.values(junctions)) {
      for (const [arm, pData] of Object.entries(j.pedestrians)) {
        if (pData.status === "CROSSING") {
          const offsetDist = 18;
          let wx = j.world_x;
          let wy = j.world_y;
          if (arm === "N") wy -= offsetDist;
          else if (arm === "S") wy += offsetDist;
          else if (arm === "E") wx += offsetDist;
          else if (arm === "W") wx -= offsetDist;

          const pCross = worldToScreen(wx, wy, 0);
          ctx.fillStyle = "#6CC58A";
          ctx.beginPath();
          ctx.arc(pCross.x, pCross.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private renderRain(ctx: CanvasRenderingContext2D, width: number, height: number, heavy: boolean) {
    ctx.strokeStyle = heavy ? "rgba(159, 216, 255, 0.45)" : "rgba(159, 216, 255, 0.25)";
    ctx.lineWidth = heavy ? 1.5 : 1.0;
    ctx.beginPath();
    for (const drop of this.rainDrops) {
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - 3, drop.y + drop.length);
      drop.y += drop.speed * (heavy ? 1.4 : 1.0);
      drop.x -= 3;
      if (drop.y > height) {
        drop.y = -10;
        drop.x = Math.random() * width;
      }
    }
    ctx.stroke();
  }

  private renderFog(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.fillStyle = "rgba(20, 17, 15, 0.40)";
    ctx.fillRect(0, 0, width, height);
  }

  private getNodePos(id: string, junctions: Record<string, JunctionState>): { world_x: number; world_y: number } | null {
    if (junctions[id]) return { world_x: junctions[id].world_x, world_y: junctions[id].world_y };
    if (id === "HOSP") return { world_x: -30.0, world_y: 300.0 };
    if (id === "SITE") return { world_x: 450.0, world_y: 100.0 };
    return null;
  }

  private adjustBrightness(hex: string, factor: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    let r = Math.floor(((num >> 16) & 255) * factor);
    let g = Math.floor(((num >> 8) & 255) * factor);
    let b = Math.floor((num & 255) * factor);
    return `rgb(${r},${g},${b})`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  private renderGhostVehicles(
    ctx: CanvasRenderingContext2D,
    ghosts: Array<{ id: string; original_id: string; link: string; world_x: number; world_y: number; projected_pos: number; is_congested: boolean }>,
    animTime: number
  ) {
    ctx.save();
    for (const g of ghosts) {
      const p = worldToScreen(g.world_x, g.world_y, 1.5);
      const pulse = Math.sin(animTime * 4) * 0.15;

      ctx.fillStyle = g.is_congested ? "rgba(229, 83, 61, 0.25)" : "rgba(159, 216, 255, 0.25)";
      ctx.strokeStyle = g.is_congested ? "rgba(229, 83, 61, 0.75)" : "rgba(159, 216, 255, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);

      ctx.beginPath();
      ctx.ellipse(p.x, p.y, (8 + pulse * 2) * camera.scale, (4 + pulse) * camera.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
