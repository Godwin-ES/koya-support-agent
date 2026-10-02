/** Small synthesized call cues; no audio assets or network request required. */
export class CallTones {
  private context: AudioContext | null = null;
  private connectingTimer: ReturnType<typeof setInterval> | null = null;

  private audioContext(): AudioContext | null {
    if (this.context) return this.context;
    const AudioContextClass = globalThis.AudioContext;
    if (!AudioContextClass) return null;
    this.context = new AudioContextClass();
    return this.context;
  }

  private beep(frequency: number, duration: number, delay = 0, volume = 0.045): void {
    const context = this.audioContext();
    if (!context) return;
    void context.resume().catch(() => undefined);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startsAt = context.currentTime + delay;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + duration + 0.02);
  }

  startConnecting(): void {
    if (this.connectingTimer) return;
    const play = () => {
      this.beep(440, 0.12);
      this.beep(554, 0.12, 0.16);
    };
    play();
    this.connectingTimer = setInterval(play, 2_400);
  }

  stopConnecting(): void {
    if (this.connectingTimer) clearInterval(this.connectingTimer);
    this.connectingTimer = null;
  }

  playHangup(): void {
    this.stopConnecting();
    this.beep(392, 0.12);
    this.beep(262, 0.2, 0.14);
  }

  dispose(): void {
    this.stopConnecting();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
  }
}
