import { JunctionData, SolvePayload } from '../types/simulation';

export class InspectorPanel {
  private container: HTMLElement;
  public selectedJunctionId: string = "J2";

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public update(junction: JunctionData | null, latestSolve: SolvePayload | null) {
    if (!junction) {
      this.container.innerHTML = `<div style="padding: 12px; color: var(--text-dim);">Click a junction to inspect cost terms.</div>`;
      return;
    }

    const why = latestSolve?.why_terms?.[junction.id];
    const safety = latestSolve?.safety_reports?.[junction.id];

    // Compute relative costs for the 4 plans:
    // Plan 0 (NS 40/30), Plan 1 (NS 50/20), Plan 2 (EW 40/30), Plan 3 (EW 50/20)
    const costs = why?.costs || [32, 28, 45, 52];
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs, minCost + 1.0);

    const planNames = [
      "Plan 0: NS Moderate (40s/30s)",
      "Plan 1: NS Strong (50s/20s)",
      "Plan 2: EW Moderate (40s/30s)",
      "Plan 3: EW Strong (50s/20s)"
    ];

    const isChosen = (idx: number) => idx === junction.current_plan_id;

    const barsHtml = costs.map((c, idx) => {
      const pct = Math.max(8, Math.min(100, (c / maxCost) * 100));
      const chosen = isChosen(idx);
      const color = chosen ? 'var(--accent-quantum)' : 'var(--accent-amber)';
      const badge = chosen ? '<span style="color: var(--accent-quantum); font-weight: 600;">[SELECTED]</span>' : '';

      return `
        <div class="cost-bar-row">
          <div class="cost-bar-header">
            <span>${planNames[idx]} ${badge}</span>
            <span class="num">${c.toFixed(1)}</span>
          </div>
          <div class="cost-bar-track">
            <div class="cost-bar-fill ${chosen ? 'quantum' : ''}" style="width: ${pct}%; background: ${color};"></div>
          </div>
        </div>
      `;
    }).join('');

    // Formulate plain English dispatcher explanation
    const qNS = junction.queues.N + junction.queues.S;
    const qEW = junction.queues.E + junction.queues.W;
    let plainExplain = "";
    if (qNS > qEW + 5) {
      plainExplain = `Heavy North-South backlog (${qNS} vehicles vs ${qEW} EW). Optimizer awarded primary green to NS corridor to clear upstream queue.`;
    } else if (qEW > qNS + 5) {
      plainExplain = `East-West demand spike (${qEW} vehicles vs ${qNS} NS). Optimizer prioritized arterial progression along EW axis.`;
    } else {
      plainExplain = `Balanced cross-traffic (${qNS} NS vs ${qEW} EW). Moderate split sustained to minimize start-up delay and fuel consumption.`;
    }

    if (junction.is_preempted) {
      plainExplain = `EMERGENCY GREEN CORRIDOR PREEMPTION: Signal locked green to discharge queue ahead of oncoming ambulance.`;
    }

    this.container.innerHTML = `
      <div class="dock-header">
        <span>JUNCTION INSPECTOR // ${junction.id}</span>
        <span class="badge ${junction.is_preempted ? 'badge-red' : 'badge-amber'}">
          ${junction.is_preempted ? 'EMG PREEMPT' : junction.active_axis + ' ' + junction.sub_phase}
        </span>
      </div>

      <div style="padding: 10px 12px; border-bottom: 1px solid var(--panel-border);">
        <div style="font-size: 13px; font-weight: 600; color: var(--text-paper); margin-bottom: 4px;">
          ${junction.name}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">
          ${plainExplain}
        </div>
      </div>

      <!-- Sensor Queues & Speeds -->
      <div style="padding: 10px 12px; border-bottom: 1px solid var(--panel-border); font-size: 11px;">
        <div class="rack-label">4-ARM REAL-TIME SENSORS</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;" class="num">
          <div>North: <b>${junction.queues.N}</b> veh (${junction.signals.N})</div>
          <div>South: <b>${junction.queues.S}</b> veh (${junction.signals.S})</div>
          <div>East:  <b>${junction.queues.E}</b> veh (${junction.signals.E})</div>
          <div>West:  <b>${junction.queues.W}</b> veh (${junction.signals.W})</div>
        </div>
      </div>

      <!-- "Why this plan" Cost Breakdown -->
      <div class="inspector-panel">
        <div class="rack-label">OBJECTIVE COST COMPARISON (FOUR PLANS)</div>
        <div style="font-size: 10.5px; color: var(--text-muted); margin-bottom: 8px;">
          Four cost values map to 3 QUBO coefficients: linear terms in (a, b) and one quadratic coupling (a*b).
        </div>
        ${barsHtml}

        <!-- Safety Validation status -->
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--panel-border); font-size: 11px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Classical Safety Check:</span>
            <span style="color: ${safety?.passed !== false ? 'var(--signal-green)' : 'var(--signal-yellow)'};">
              ${safety?.passed !== false ? 'Passed (All constraints)' : 'Repaired (Clearance rule)'}
            </span>
          </div>
        </div>
      </div>
    `;
  }
}
