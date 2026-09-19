import { DecisionTimelineEvent } from "../types";

export class DecisionTimeline {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
  }

  public render(events: DecisionTimelineEvent[]) {
    if (!events || events.length === 0) {
      this.container.innerHTML = `
        <div style="color: var(--color-paper-muted); font-size: 13px; font-style: italic; padding: 16px; text-align: center;">
          Monitoring district events... Timeline will update as traffic conditions change.
        </div>
      `;
      return;
    }

    const typeColor = (type: string) => {
      switch (type) {
        case "EVENT": return "var(--color-signal-red)";
        case "PREDICT": return "var(--color-sodium)";
        case "OPTIMIZE": return "var(--color-quantum)";
        case "QUANTUM": return "var(--color-quantum)";
        case "VALIDATE": return "var(--color-signal-green)";
        case "DEPLOY": return "var(--color-paper)";
        case "SUCCESS": return "var(--color-signal-green)";
        case "CLEAR": return "var(--color-signal-green)";
        default: return "var(--color-paper-muted)";
      }
    };

    this.container.innerHTML = `
      <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px;">
        <div style="border-bottom: 1px solid var(--color-panel-border); padding-bottom: 8px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted); letter-spacing: 0.08em;">
            CAUSE-AND-EFFECT DECISION TIMELINE
          </div>
          <div style="font-size: 14px; font-weight: 700; color: var(--color-paper); margin-top: 2px;">
            Dynamic Decision Trace
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; position: relative; margin-top: 4px;">
          ${events
            .map((ev, idx) => `
              <div style="display: flex; gap: 10px; align-items: flex-start; position: relative;">
                <div style="display: flex; flex-direction: column; align-items: center; width: 14px; margin-top: 3px;">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: ${typeColor(ev.type)}; box-shadow: 0 0 6px ${typeColor(ev.type)};"></div>
                  ${idx < events.length - 1 ? `<div style="width: 1px; height: 36px; background: rgba(237,228,211,0.15); margin-top: 4px;"></div>` : ''}
                </div>
                <div style="flex: 1; background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 6px 10px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 10px; font-family: var(--font-mono); font-weight: 700; color: ${typeColor(ev.type)};">
                      ${ev.label}
                    </span>
                    <span style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">
                      ${ev.time}
                    </span>
                  </div>
                  <div style="font-size: 11px; color: var(--color-paper-muted); margin-top: 3px; line-height: 1.4;">
                    ${ev.detail}
                  </div>
                </div>
              </div>
            `)
            .join('')}
        </div>
      </div>
    `;
  }
}
