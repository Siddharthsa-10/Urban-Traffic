import { SimulationFrame } from './types/simulation';

export class SimulationSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private onFrameCallback: ((frame: SimulationFrame) => void) | null = null;
  private onStatusChangeCallback: ((connected: boolean) => void) | null = null;
  public isConnected: boolean = false;
  private isDemoSafeMode: boolean = false;
  private prerecordedFrames: SimulationFrame[] = [];
  private prerecordedIdx: number = 0;
  private prerecordedTimer: number | null = null;

  constructor(url?: string) {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = url || `${protocol}//${loc.host}/ws`;
  }

  public connect(onFrame: (frame: SimulationFrame) => void, onStatusChange?: (connected: boolean) => void) {
    this.onFrameCallback = onFrame;
    this.onStatusChangeCallback = onStatusChange || null;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        if (this.onStatusChangeCallback) this.onStatusChangeCallback(true);
        if (this.isDemoSafeMode) this.stopDemoSafe();
      };

      this.ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data) as SimulationFrame;
          if (this.onFrameCallback) this.onFrameCallback(frame);
        } catch (e) {}
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.onStatusChangeCallback) this.onStatusChangeCallback(false);
        // Attempt reconnect in 3s
        setTimeout(() => {
          if (!this.isConnected && !this.isDemoSafeMode) {
            this.connect(this.onFrameCallback!, this.onStatusChangeCallback || undefined);
          }
        }, 3000);
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        if (this.onStatusChangeCallback) this.onStatusChangeCallback(false);
      };
    } catch (e) {
      this.isConnected = false;
      if (this.onStatusChangeCallback) this.onStatusChangeCallback(false);
    }
  }

  public send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public async loadDemoSafe(): Promise<boolean> {
    try {
      const res = await fetch('/prerecorded_run.json');
      if (!res.ok) return false;
      const data = await res.json();
      this.prerecordedFrames = data.frames || [];
      this.isDemoSafeMode = true;
      this.prerecordedIdx = 0;

      if (this.prerecordedTimer) clearInterval(this.prerecordedTimer);
      this.prerecordedTimer = window.setInterval(() => {
        if (this.prerecordedFrames.length > 0) {
          const f = this.prerecordedFrames[this.prerecordedIdx];
          if (this.onFrameCallback) this.onFrameCallback(f);
          this.prerecordedIdx = (this.prerecordedIdx + 1) % this.prerecordedFrames.length;
        }
      }, 100);
      return true;
    } catch (e) {
      return false;
    }
  }

  public stopDemoSafe() {
    this.isDemoSafeMode = false;
    if (this.prerecordedTimer) {
      clearInterval(this.prerecordedTimer);
      this.prerecordedTimer = null;
    }
  }
}
