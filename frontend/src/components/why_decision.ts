import { ActiveExplanation } from "../types";

export class WhyThisDecision {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
  }

  public render(exp?: ActiveExplanation) {
    if (!exp) {
      this.container.innerHTML = `
        <div style="color: var(--color-paper-muted); font-size: 13px; font-style: italic; padding: 16px; text-align: center;">
          Generating decision rationale... Waiting for active optimization frame.
        </div>
      `;
      return;
    }

    const f = exp.factors || {
      vehicle_pressure_pct: 82,
      queue_growth_pct: 74,
      emergency_priority_pct: 35,
      east_west_demand_pct: 42,
      predicted_spillback: "LOW"
    };

    this.container.innerHTML = `
      <div style="padding: 12px; display: flex; flex-direction: column; gap: 12px; font-size: 12px;">
        <!-- Header -->
        <div style="border-bottom: 1px solid var(--color-panel-border); padding-bottom: 8px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted); letter-spacing: 0.08em;">
            EXPLAINABLE AI REASONING
          </div>
          <div style="font-size: 15px; font-weight: 700; color: var(--color-paper); margin-top: 2px;">
            WHY THIS DECISION?
          </div>
        </div>

        <!-- Metric Factors Bar -->
        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px;">
            <span style="color: var(--color-paper-muted);">Vehicle Pressure:</span>
            <strong style="color: var(--color-signal-red);">${f.vehicle_pressure_pct}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px;">
            <span style="color: var(--color-paper-muted);">Queue Growth Velocity:</span>
            <strong style="color: var(--color-sodium);">${f.queue_growth_pct}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px;">
            <span style="color: var(--color-paper-muted);">Emergency Priority:</span>
            <strong style="color: var(--color-quantum);">${f.emergency_priority_pct}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px;">
            <span style="color: var(--color-paper-muted);">East-West Demand:</span>
            <strong style="color: var(--color-paper);">${f.east_west_demand_pct}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px;">
            <span style="color: var(--color-paper-muted);">Predicted Spillback Risk:</span>
            <strong style="color: ${f.predicted_spillback === 'LOW' ? 'var(--color-signal-green)' : 'var(--color-signal-red)'};">${f.predicted_spillback}</strong>
          </div>
        </div>

        <!-- Decision & Reason Cards -->
        <div style="background: rgba(159,216,255,0.06); border: 1px solid rgba(159,216,255,0.25); border-radius: 4px; padding: 10px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-quantum); margin-bottom: 2px;">DECISION:</div>
          <div style="font-weight: 600; color: var(--color-paper); line-height: 1.4;">
            ${exp.decision_summary}
          </div>
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-sodium); margin-top: 8px; margin-bottom: 2px;">REASON:</div>
          <div style="color: var(--color-paper-muted); line-height: 1.4;">
            ${exp.reason_summary}
          </div>
        </div>

        <!-- 11-Point Detailed Cause-and-Effect Chain -->
        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 10px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-bottom: 8px;">
            11-POINT CAUSE-AND-EFFECT CHAIN
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11px; line-height: 1.4;">
            <div><strong style="color: var(--color-paper);">1. What happened:</strong> <span style="color: var(--color-paper-muted);">${exp["1_what_happened"]}</span></div>
            <div><strong style="color: var(--color-paper);">2. Where:</strong> <span style="color: var(--color-paper-muted);">${exp["2_where"]}</span></div>
            <div><strong style="color: var(--color-paper);">3. Why:</strong> <span style="color: var(--color-paper-muted);">${exp["3_why"]}</span></div>
            <div><strong style="color: var(--color-paper);">4. Prediction:</strong> <span style="color: var(--color-quantum);">${exp["4_prediction"]}</span></div>
            <div><strong style="color: var(--color-paper);">5. Strategies considered:</strong> <span style="color: var(--color-paper-muted);">${exp["5_strategies_considered"]}</span></div>
            <div><strong style="color: var(--color-paper);">6. Selected strategy:</strong> <span style="color: var(--color-quantum);">${exp["6_strategy_selected"]}</span></div>
            <div><strong style="color: var(--color-paper);">7. Why selected:</strong> <span style="color: var(--color-paper-muted);">${exp["7_why_selected"]}</span></div>
            <div><strong style="color: var(--color-paper);">8. What will happen:</strong> <span style="color: var(--color-paper-muted);">${exp["8_what_will_happen"]}</span></div>
            <div><strong style="color: var(--color-paper);">9. What changed:</strong> <span style="color: var(--color-paper-muted);">${exp["9_what_changed"]}</span></div>
            <div><strong style="color: var(--color-paper);">10. Safety validated:</strong> <span style="color: var(--color-signal-green);">${exp["10_safety_validated"]}</span></div>
            <div><strong style="color: var(--color-paper);">11. Expected impact:</strong> <span style="color: var(--color-signal-green);">${exp["11_expected_impact"]}</span></div>
          </div>
        </div>
      </div>
    `;
  }
}
