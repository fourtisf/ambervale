/**
 * WebAudio synth.
 *
 * Every sound is generated — no audio files ship with the game. The context is
 * created lazily on the first gesture, because browsers refuse to start one
 * before a user interaction.
 */

const MUTE_KEY = 'ambervale.muted';

type Wave = OscillatorType;

class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  /** Ambience layers, started once and gated by the day cycle. */
  private ambienceTimer: number | null = null;
  private ambienceMode: 'day' | 'night' | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.muted = window.localStorage.getItem(MUTE_KEY) === '1';
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    }
    if (this.master) this.master.gain.value = muted ? 0 : 0.28;
  }

  /** Call from a user gesture; safe to call repeatedly. */
  resume(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx) return this.ctx;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.28;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** One shaped oscillator note. The building block for everything below. */
  private note(
    freq: number,
    duration: number,
    options: { wave?: Wave; gain?: number; delay?: number; sweepTo?: number } = {},
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;

    const t0 = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = options.wave ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (options.sweepTo) osc.frequency.exponentialRampToValueAtTime(options.sweepTo, t0 + duration);

    const peak = options.gain ?? 0.5;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** Filtered noise — used for digs, chops and crickets. */
  private noise(duration: number, filterHz: number, gain = 0.35, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;

    const t0 = ctx.currentTime + delay;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterHz;
    filter.Q.value = 1.1;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start(t0);
  }

  // -- game sounds ----------------------------------------------------------

  plant(): void {
    this.noise(0.14, 500, 0.3);
    this.note(320, 0.16, { wave: 'triangle', gain: 0.3, sweepTo: 420 });
  }

  harvest(): void {
    this.note(523, 0.12, { wave: 'triangle', gain: 0.4 });
    this.note(784, 0.16, { wave: 'triangle', gain: 0.35, delay: 0.07 });
  }

  chop(): void {
    this.noise(0.13, 260, 0.45);
    this.note(150, 0.1, { wave: 'square', gain: 0.18, sweepTo: 90 });
  }

  mine(): void {
    this.noise(0.11, 1600, 0.35);
    this.note(240, 0.09, { wave: 'square', gain: 0.16, sweepTo: 140 });
  }

  coin(): void {
    this.note(988, 0.09, { wave: 'square', gain: 0.22 });
    this.note(1319, 0.13, { wave: 'square', gain: 0.2, delay: 0.05 });
  }

  amber(): void {
    this.note(660, 0.14, { wave: 'triangle', gain: 0.3 });
    this.note(880, 0.16, { wave: 'triangle', gain: 0.28, delay: 0.08 });
    this.note(1320, 0.24, { wave: 'sine', gain: 0.24, delay: 0.16 });
  }

  levelUp(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.note(f, 0.28, { wave: 'triangle', gain: 0.3, delay: i * 0.09 }),
    );
  }

  error(): void {
    this.note(220, 0.16, { wave: 'sawtooth', gain: 0.16, sweepTo: 150 });
  }

  pickup(): void {
    this.note(700, 0.1, { wave: 'sine', gain: 0.28, sweepTo: 1000 });
  }

  moo(): void {
    this.note(150, 0.55, { wave: 'sawtooth', gain: 0.16, sweepTo: 110 });
    this.note(226, 0.4, { wave: 'sine', gain: 0.1, delay: 0.08, sweepTo: 170 });
  }

  cluck(): void {
    this.note(900, 0.06, { wave: 'square', gain: 0.12, sweepTo: 620 });
    this.note(760, 0.05, { wave: 'square', gain: 0.1, delay: 0.07 });
  }

  // -- ambience -------------------------------------------------------------

  private birdChirp(): void {
    const base = 1800 + Math.random() * 900;
    this.note(base, 0.07, { wave: 'sine', gain: 0.09, sweepTo: base * 1.35 });
    this.note(base * 1.2, 0.06, { wave: 'sine', gain: 0.07, delay: 0.09 });
  }

  private cricket(): void {
    for (let i = 0; i < 3; i++) this.noise(0.02, 4600, 0.05, i * 0.045);
  }

  /**
   * Sparse generated ambience tied to the day cycle: birds by day, crickets at
   * night. Re-arms itself with a randomised gap so it never sounds metronomic.
   */
  setAmbience(mode: 'day' | 'night' | null): void {
    if (mode === this.ambienceMode) return;
    this.ambienceMode = mode;

    if (this.ambienceTimer !== null) {
      window.clearTimeout(this.ambienceTimer);
      this.ambienceTimer = null;
    }
    if (!mode) return;

    const tick = () => {
      if (this.ambienceMode !== mode) return;
      if (!this.muted && !document.hidden) {
        if (mode === 'day') this.birdChirp();
        else this.cricket();
      }
      const gap = mode === 'day' ? 2600 + Math.random() * 5200 : 1400 + Math.random() * 2600;
      this.ambienceTimer = window.setTimeout(tick, gap);
    };
    this.ambienceTimer = window.setTimeout(tick, 900);
  }

  stop(): void {
    this.setAmbience(null);
  }
}

export const audio = new Synth();
