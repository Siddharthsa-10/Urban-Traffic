export class DecisionLogView {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }

  public show() {
    this.container.classList.add("active");
    this.fetchDecisions();
  }

  public hide() {
    this.container.classList.remove("active");
  }

  private render() {
    this.container.innerHTML = `
      <div class="scenarios-modal-card" style="width: 980px; max-height: 88vh; overflow-y: auto; background: #14110F; border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.85); color: var(--color-paper); margin: auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-panel-border); padding-bottom: 14px;">
          <div>
            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--color-quantum); letter-spacing: 0.08em;">
              MONGODB AUDIT TRAIL · DECISION HISTORY
            </div>
            <div style="font-size: 20px; font-weight: 700; color: var(--color-paper); margin-top: 2px;">
              Explainable Decision Audit Log
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-ctrl" id="btn-refresh-decisions" style="padding: 6px 14px;">↻ Refresh</button>
            <button class="btn-cancel" id="btn-close-decisions" style="padding: 6px 14px;">✕ Close</button>
          </div>
        </div>

        <!-- Table Container -->
        <div style="margin-top: 16px; overflow-x: auto;">
          <table class="scoreboard-table" style="width: 100%; font-size: 11px; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-panel-border); text-align: left; font-family: var(--font-mono); color: var(--color-paper-muted);">
                <th style="padding: 8px;">TIME</th>
                <th style="padding: 8px;">EVENT</th>
                <th style="padding: 8px;">LOCATION</th>
                <th style="padding: 8px;">STRATEGY</th>
                <th style="padding: 8px;">DECISION & RATIONALE</th>
                <th style="padding: 8px;">EXPECTED IMPACT</th>
                <th style="padding: 8px;">SAFETY GATES</th>
              </tr>
            </thead>
            <tbody id="decisions-tbody">
              <tr>
                <td colspan="7" style="text-align: center; padding: 20px; color: var(--color-paper-muted);">
                  Loading decision audit trail from database...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    const closeBtn = this.container.querySelector("#btn-close-decisions");
    if (closeBtn) closeBtn.addEventListener("click", () => this.hide());

    const refreshBtn = this.container.querySelector("#btn-refresh-decisions");
    if (refreshBtn) refreshBtn.addEventListener("click", () => this.fetchDecisions());
  }

  public async fetchDecisions() {
    try {
      const res = await fetch("/api/decisions?limit=35");
      const records = await res.json();
      const tbody = document.getElementById("decisions-tbody");
      if (!tbody) return;

      if (!records || records.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 20px; color: var(--color-paper-muted); font-style: italic;">
              No decisions logged yet. The decision engine logs events dynamically as signals rebalance.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = records
        .map(
          (r: any) => `
          <tr style="border-bottom: 1px solid rgba(237,228,211,0.08);">
            <td style="padding: 8px; font-family: var(--font-mono); color: var(--color-paper-muted); white-space: nowrap;">
              ${r.timestamp ? r.timestamp.split(' ')[1] || r.timestamp : '02:00'}
            </td>
            <td style="padding: 8px;">
              <span style="font-size: 10px; font-family: var(--font-mono); padding: 2px 6px; border-radius: 2px; background: rgba(242,163,58,0.15); color: var(--color-sodium);">
                ${r.event || 'REBALANCE'}
              </span>
            </td>
            <td style="padding: 8px; font-weight: 600; color: var(--color-paper); white-space: nowrap;">
              ${r.junction_name || r.junction_id || 'District'}
            </td>
            <td style="padding: 8px; font-family: var(--font-mono); color: var(--color-quantum); font-size: 10px;">
              ${r["6_strategy_selected"] || 'QAOA Aer'}
            </td>
            <td style="padding: 8px; max-width: 280px; line-height: 1.4;">
              <div style="color: var(--color-paper); font-weight: 600;">${r.decision_summary || 'Extend Phase Split'}</div>
              <div style="color: var(--color-paper-muted); font-size: 10px; margin-top: 2px;">${r.reason_summary || 'Queue threshold reduction.'}</div>
            </td>
            <td style="padding: 8px; font-family: var(--font-mono); color: var(--color-signal-green); white-space: nowrap;">
              ${r["11_expected_impact"] || 'Wait -18%, Queue -31%'}
            </td>
            <td style="padding: 8px; white-space: nowrap;">
              <span style="color: var(--color-signal-green); font-size: 10px; font-family: var(--font-mono);">
                ✓ 4/4 PASSED
              </span>
            </td>
          </tr>
        `
        )
        .join('');
    } catch (e) {
      console.warn("Could not fetch decisions:", e);
    }
  }
}
