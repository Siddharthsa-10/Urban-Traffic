import { camera, worldToScreen, screenToWorld } from "./iso";
import { JunctionState, LinkState, CorridorState, JunctionPrediction } from "../types";

export class OverlayLayer {
  public hoveredJunctionId: string | null = null;
  public selectedJunctionId: string | null = null;
  public hoveredLinkId: string | null = null;

  // Ambulance click-on-map picking state
  public dispatchMode: "IDLE" | "PICK_ORIGIN" | "PICK_DEST" | "CONFIRM" = "IDLE";
  public pickedOrigin: string | null = null;
  public pickedDestination: string | null = null;
  public previewRoute: string[] = [];
  public previewEta: number = 0;

  public render(
    ctx: CanvasRenderingContext2D,
    junctions: Record<string, JunctionState>,
    links: LinkState[],
    corridor: CorridorState,
    animTime: number,
    predictions?: Record<string, JunctionPrediction>
  ) {
    // 1. Hover / Selected / Base rings, countdowns, and labels on all junctions
    for (const [jId, j] of Object.entries(junctions)) {
      const p = worldToScreen(j.world_x, j.world_y, 0);
      const radius = 24 * camera.scale;

      // Platform Ring for all junctions
      if (jId === this.selectedJunctionId) {
        ctx.strokeStyle = "#9FD8FF";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius * 1.15, radius * 0.58, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (jId === this.hoveredJunctionId) {
        ctx.strokeStyle = "#EDE4D3";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius * 1.1, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(100, 110, 120, 0.4)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const pred = predictions ? predictions[jId] : undefined;

      // Junction Header Plate (Name + ID)
      this.drawJunctionHeader(ctx, p.x, p.y - radius * 0.5 - 18, j, pred);

      // Signal Phase Countdown badge with mini-metrics
      this.drawCountdownBadge(ctx, p.x, p.y + radius * 0.5 + 12, j, pred);

      // In dispatch mode, pulse clickable origin/dest nodes
      if (this.dispatchMode === "PICK_ORIGIN" || this.dispatchMode === "PICK_DEST") {
        const pulse = Math.sin(animTime * 6) * 4;
        ctx.strokeStyle = "#9FD8FF";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius + pulse, (radius + pulse) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 2. Special site pulses during dispatch mode
    if (this.dispatchMode === "PICK_ORIGIN" || this.dispatchMode === "PICK_DEST") {
      const hospP = worldToScreen(-30, 300, 0);
      const siteP = worldToScreen(450, 100, 0);
      const pulse = Math.sin(animTime * 6) * 5;

      ctx.strokeStyle = "#9FD8FF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(hospP.x, hospP.y, 25 + pulse, (25 + pulse) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(siteP.x, siteP.y, 25 + pulse, (25 + pulse) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Dispatch preview pins and route
    if (this.pickedOrigin) {
      const pos = this.getNodePos(this.pickedOrigin, junctions);
      if (pos) {
        const p = worldToScreen(pos.world_x, pos.world_y, 10);
        this.drawPin(ctx, p.x, p.y, "ORIGIN", "#F2A33A");
      }
    }

    if (this.pickedDestination) {
      const pos = this.getNodePos(this.pickedDestination, junctions);
      if (pos) {
        const p = worldToScreen(pos.world_x, pos.world_y, 10);
        this.drawPin(ctx, p.x, p.y, "DEST", "#E5533D");
      }
    }

    // 4. Preview Route dashed line
    if (this.previewRoute.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#9FD8FF";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      for (let k = 0; k < this.previewRoute.length; k++) {
        const pos = this.getNodePos(this.previewRoute[k], junctions);
        if (!pos) continue;
        const p = worldToScreen(pos.world_x, pos.world_y, 4);
        if (k === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 5. Road Closure & Incident Badges
    for (const link of links) {
      if (link.is_closed || link.has_accident) {
        const fromPos = junctions[link.from] || this.getNodePos(link.from, junctions);
        const toPos = junctions[link.to] || this.getNodePos(link.to, junctions);
        if (!fromPos || !toPos) continue;

        const mx = (fromPos.world_x + toPos.world_x) / 2;
        const my = (fromPos.world_y + toPos.world_y) / 2;
        const p = worldToScreen(mx, my, 12);

        if (link.is_closed) {
          this.drawRoadClosureBadge(ctx, p.x, p.y, link.closure_reason || "ROAD CLOSED");
        } else if (link.has_accident) {
          this.drawAccidentBadge(ctx, p.x, p.y);
        }
      }
    }
  }

  private drawRoadClosureBadge(ctx: CanvasRenderingContext2D, x: number, y: number, reason: string) {
    const text = `🚧 ${reason.toUpperCase()}`;
    ctx.font = "bold 9px monospace";
    const tw = ctx.measureText(text).width;
    const w = tw + 16;
    const h = 20;

    ctx.fillStyle = "rgba(45, 12, 12, 0.95)";
    ctx.fillRect(x - w / 2, y - h / 2, w, h);

    ctx.strokeStyle = "#E5533D";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    ctx.fillStyle = "#FF8070";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  private drawAccidentBadge(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const text = "⚠ INCIDENT · 35% CAP";
    ctx.font = "bold 9px monospace";
    const tw = ctx.measureText(text).width;
    const w = tw + 16;
    const h = 20;

    ctx.fillStyle = "rgba(45, 25, 10, 0.95)";
    ctx.fillRect(x - w / 2, y - h / 2, w, h);

    ctx.strokeStyle = "#F2A33A";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    ctx.fillStyle = "#F2A33A";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  private drawJunctionHeader(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    j: JunctionState,
    pred?: JunctionPrediction
  ) {
    const title = `${j.name} · ${j.id}`;
    ctx.font = "bold 11px Inter, sans-serif";
    const tw = ctx.measureText(title).width;
    const pad = 8;
    const w = tw + pad * 2;
    const h = 20;

    // Solid backing plate
    ctx.fillStyle = "rgba(18, 15, 13, 0.94)";
    ctx.fillRect(x - w / 2, y - h / 2, w, h);

    ctx.strokeStyle = "rgba(237, 228, 211, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    ctx.fillStyle = "#EDE4D3";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, x, y);
  }

  private drawCountdownBadge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    j: JunctionState,
    pred?: JunctionPrediction
  ) {
    const timeRem = Math.ceil(j.time_remaining_s);
    const color = j.is_green ? "#6CC58A" : (j.is_yellow ? "#F5D04A" : "#E5533D");
    const phaseText = `${j.axis} ${timeRem}s`;

    const qTotal = Math.max(0, (j.queues.N || 0) + (j.queues.S || 0) + (j.queues.E || 0) + (j.queues.W || 0));
    const predText = pred ? pred.prediction_label : "pred ok";

    ctx.font = "10px monospace";
    const tw1 = ctx.measureText(phaseText).width;
    ctx.font = "9px monospace";
    const tw2 = ctx.measureText(`Q:${qTotal} · ${predText}`).width;

    const w = Math.max(tw1, tw2) + 14;
    const h = 26;

    ctx.fillStyle = "rgba(20, 17, 15, 0.94)";
    ctx.fillRect(x - w / 2, y - 4, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - 4, w, h);

    // Line 1: Phase & Countdown
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(phaseText, x, y + 8);

    // Line 2: Queue & Prediction
    ctx.font = "9px monospace";
    ctx.fillStyle = "rgba(237, 228, 211, 0.75)";
    ctx.fillText(`Q:${qTotal} · ${predText}`, x, y + 19);
  }

  private drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 8, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#14110F";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 8, y - 16, 16, 16);

    ctx.font = "9px monospace";
    ctx.fillStyle = "#EDE4D3";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - 18);
  }

  private getNodePos(id: string, junctions: Record<string, JunctionState>): { world_x: number; world_y: number } | null {
    if (junctions[id]) return { world_x: junctions[id].world_x, world_y: junctions[id].world_y };
    if (id === "HOSP") return { world_x: -30.0, world_y: 300.0 };
    if (id === "SITE") return { world_x: 450.0, world_y: 100.0 };
    return null;
  }
}
