class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = false;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenPlaying: boolean = false;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.initContext();
    } else {
      this.stopSiren();
    }
    return this.enabled;
  }

  public playPhaseTick() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {
      // Ignore audio glitches
    }
  }

  public updateSiren(isActive: boolean, distanceFactor: number = 0.5) {
    if (!this.enabled || !isActive) {
      this.stopSiren();
      return;
    }
    this.initContext();
    if (!this.ctx) return;

    if (!this.sirenPlaying) {
      try {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();

        this.sirenOsc.type = 'triangle';
        this.sirenGain.gain.setValueAtTime(0.04 * (1.0 - distanceFactor * 0.5), this.ctx.currentTime);

        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.ctx.destination);

        this.sirenOsc.start();
        this.sirenPlaying = true;
      } catch (e) {
        return;
      }
    }

    // Modulate frequency with Doppler shift / wailing
    if (this.sirenOsc && this.ctx) {
      const t = this.ctx.currentTime;
      const freq = 650 + Math.sin(t * 4.0) * 220;
      this.sirenOsc.frequency.setValueAtTime(freq, t);
    }
  }

  public stopSiren() {
    if (this.sirenPlaying && this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenOsc.disconnect();
      } catch (e) {}
      this.sirenOsc = null;
      this.sirenGain = null;
      this.sirenPlaying = false;
    }
  }
}

export const sound = new SoundEngine();
