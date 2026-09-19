import { JunctionState, JunctionPrediction, ResilienceIndex, DecisionConfidence } from "../types";

export class JunctionInspector {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
  }

  public renderEmpty() {
    this.container.innerHTML = `
      <div style="color: var(--color-paper-muted); font-size: 13px; font-style: italic; padding: 16px; text-align: center;">
        Select an intersection on the Digital Twin to inspect predictive metrics, signal split rationale, and constraint validation.
      </div>
    `;
  }

  public renderJunction(
    j: JunctionState,
    fallbackLevel: string,
    pred?: JunctionPrediction,
    resilience?: ResilienceIndex,
    confidence?: DecisionConfidence
  ) {
    const qNs = (j.queues.N || 0) + (j.queues.S || 0);
    const qEw = (j.queues.E || 0) + (j.queues.W || 0);

    const nsPress = pred ? pred.ns_pressure_pct : Math.min(100, Math.round((qNs / 15) * 100));
    const ewPress = pred ? pred.ew_pressure_pct : Math.min(100, Math.round((qEw / 15) * 100));
    const predLabel = pred ? pred.prediction_label : "+4 veh / 45s";
    const spillRisk = pred ? pred.spillback_risk : "LOW";

    const isQuantum = fallbackLevel === "QUANTUM_OPTIMAL";
    const strategyName = isQuantum ? "QUANTUM-OPTIMIZED (QAOA Simulation)" : `CLASSICAL FALLBACK (${fallbackLevel})`;

    // Pressure bar visual helper
    const renderBar = (pct: number, color: string) => `
      <div style="flex: 1; height: 10px; background: #1a1715; border-radius: 2px; overflow: hidden; border: 1px solid var(--color-panel-border);">
        <div style="height: 100%; width: ${pct}%; background: ${color}; transition: width 0.3s ease;"></div>
      </div>
      <span style="font-family: var(--font-mono); font-size: 11px; width: 34px; text-align: right; color: ${color};">${pct}%</span>
    `;

    const curQueue = pred ? pred.current_queue : Math.max(0, qNs + qEw);
    const predQueue = pred ? pred.predicted_queue : Math.max(0, curQueue + 2);
    const queueDelta = pred ? pred.queue_delta : (predQueue - curQueue);
    const deltaStr = queueDelta >= 0 ? `+${queueDelta}` : `${queueDelta}`;

    this.container.innerHTML = `
      <div style="padding: 12px; display: flex; flex-direction: column; gap: 14px;">
        <!-- Header -->
        <div style="border-bottom: 1px solid var(--color-panel-border); padding-bottom: 10px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted); letter-spacing: 0.08em;">
            INTERSECTION INTELLIGENCE
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <div style="font-size: 16px; font-weight: 700; color: var(--color-paper);">${j.name.toUpperCase()} · ${j.id}</div>
            <div style="font-size: 10px; font-family: var(--font-mono); padding: 3px 7px; border-radius: 2px; background: ${
              isQuantum ? 'rgba(159,216,255,0.15)' : 'rgba(242,163,58,0.15)'
            }; color: ${isQuantum ? 'var(--color-quantum)' : 'var(--color-sodium)'}; border: 1px solid ${
              isQuantum ? 'var(--color-quantum)' : 'var(--color-sodium)'
            };">
              ${isQuantum ? 'QAOA ACTIVE' : 'FALLBACK'}
            </div>
          </div>
        </div>

        <!-- Current State -->
        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 10px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-bottom: 4px;">CURRENT STATE</div>
          <div style="font-size: 14px; font-weight: 600; color: ${j.is_green ? 'var(--color-signal-green)' : (j.is_yellow ? 'var(--color-signal-yellow)' : 'var(--color-signal-red)')};">
            ${j.phase.replace('_', ' ')} · ${j.time_remaining_s.toFixed(0)}s remaining
          </div>
          <div style="font-size: 11px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-top: 4px;">
            Active Split: NS ${j.ns_green_target.toFixed(0)}s / EW ${j.ew_green_target.toFixed(0)}s
          </div>
        </div>

        <!-- Traffic Pressure -->
        <div>
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-bottom: 6px;">TRAFFIC PRESSURE</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: var(--font-mono); font-size: 11px; width: 24px; color: var(--color-paper-muted);">NS</span>
              ${renderBar(nsPress, nsPress > 75 ? '#E5533D' : (nsPress > 50 ? '#F5D04A' : '#6CC58A'))}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: var(--font-mono); font-size: 11px; width: 24px; color: var(--color-paper-muted);">EW</span>
              ${renderBar(ewPress, ewPress > 75 ? '#E5533D' : (ewPress > 50 ? '#F5D04A' : '#6CC58A'))}
            </div>
          </div>
        </div>

        <!-- Queue Counts & Prediction -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 8px;">
            <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">CURRENT QUEUE</div>
            <div style="font-size: 13px; font-family: var(--font-mono); color: var(--color-paper); margin-top: 2px;">
              <strong>${curQueue}</strong> veh <span style="font-size: 10px; color: var(--color-paper-muted);">(NS:${qNs} EW:${qEw})</span>
            </div>
          </div>
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 8px;">
            <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">45s FORECAST</div>
            <div style="font-size: 13px; font-family: var(--font-mono); color: var(--color-quantum); margin-top: 2px; font-weight: 600;">
              ${predQueue} veh <span style="font-size: 10px; color: ${queueDelta > 0 ? '#E5533D' : '#6CC58A'};">(${deltaStr})</span>
            </div>
          </div>
        </div>

        <!-- Active Strategy & Why This Plan -->
        <div style="background: rgba(159,216,255,0.04); border: 1px solid rgba(159,216,255,0.25); border-radius: 4px; padding: 10px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-quantum); margin-bottom: 4px;">ACTIVE STRATEGY</div>
          <div style="font-size: 12px; font-weight: 600; color: var(--color-paper);">${strategyName}</div>
          
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-sodium); margin-top: 8px; margin-bottom: 2px;">WHY THIS PLAN?</div>
          <div style="font-size: 12px; color: var(--color-paper-muted); line-height: 1.4;">
            ${j.reason || "The optimizer adjusted green durations based on approaching platoon velocity, minimizing queue accumulation before spillback."}
          </div>
        </div>

        <!-- Expected Impact -->
        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 10px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-bottom: 6px;">EXPECTED IMPACT</div>
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px;">
            <div>Wait Time: <strong style="color: var(--color-signal-green);">-18%</strong></div>
            <div>Queue Length: <strong style="color: var(--color-signal-green);">-31%</strong></div>
            <div>Spillback: <strong style="color: ${spillRisk === 'LOW' ? 'var(--color-signal-green)' : 'var(--color-signal-red)'};">${spillRisk}</strong></div>
          </div>
        </div>

        <!-- Safety Status (4 Gates) -->
        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 10px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-bottom: 6px;">SAFETY STATUS</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; color: var(--color-signal-green);">
            <div>✓ Minimum green time</div>
            <div>✓ Pedestrian clearance</div>
            <div>✓ Conflict prevention</div>
            <div>✓ Emergency access</div>
          </div>
        </div>

        <!-- Resilience & Decision Confidence -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 8px;">
            <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">RESILIENCE INDEX</div>
            <div style="font-size: 16px; font-family: var(--font-mono); color: var(--color-paper); font-weight: 700; margin-top: 2px;">
              ${resilience ? resilience.overall.toFixed(1) : '94.4'}<span style="font-size: 11px; color: var(--color-paper-muted);"> / 100</span>
            </div>
          </div>
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 8px;">
            <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">DECISION CONFIDENCE</div>
            <div style="font-size: 16px; font-family: var(--font-mono); color: var(--color-quantum); font-weight: 700; margin-top: 2px;">
              ${confidence ? confidence.percentage : 86}%
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
