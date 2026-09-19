import { FrameData } from "../types";

export class DemoSafePlayer {
  private frames: FrameData[] = [];
  private currentFrameIndex: number = 0;
  private isPlaying: boolean = false;
  private timer: any = null;

  public onFrame?: (frame: FrameData) => void;

  public async loadRecording(): Promise<boolean> {
    try {
      const resp = await fetch("/demo_safe.json");
      if (!resp.ok) return false;
      const data = await resp.json();
      this.frames = data.frames || [];
      return this.frames.length > 0;
    } catch (e) {
      console.warn("Could not load demo_safe.json", e);
      return false;
    }
  }

  public start() {
    if (this.frames.length === 0) return;
    this.isPlaying = true;
    this.currentFrameIndex = 0;
    this.playLoop();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private playLoop() {
    if (!this.isPlaying) return;
    if (this.currentFrameIndex >= this.frames.length) {
      this.currentFrameIndex = 0; // loop
    }

    const frame = this.frames[this.currentFrameIndex];
    if (this.onFrame) this.onFrame(frame);

    this.currentFrameIndex++;
    this.timer = setTimeout(() => this.playLoop(), 100); // 10 Hz replay
  }
}
