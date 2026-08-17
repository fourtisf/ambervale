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
    options: { wave?: Wave; gain?: number; delay?: number; sweepTo?: number; detune?: number } = {},
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;

    // Humanising drift for the action sounds: the hundredth chop should not
    // be sample-identical to the first. One factor for both ends of a sweep,
    // so the gesture keeps its shape and only its register wanders. Kept off
    // the music and fanfares — ±4% is most of a semitone, and a melody that
    // drifts that far is not humanised, it is out of tune.
    const drift = options.detune ? 1 + (Math.random() * 2 - 1) * options.detune : 1;

    const t0 = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = options.wave ?? 'sine';
    osc.frequency.setValueAtTime(freq * drift, t0);
    if (options.sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(options.sweepTo * drift, t0 + duration);
    }

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
    this.note(320, 0.16, { wave: 'triangle', gain: 0.3, sweepTo: 420, detune: 0.04 });
  }

  /**
   * The chain climbs: each consecutive harvest lifts the jingle a step, so
   * clearing a ready field sounds like something building rather than the
   * same two notes seven times. Capped where it still sounds like a bell.
   */
  harvest(chain = 1): void {
    const rate = Math.pow(1.06, Math.min(Math.max(chain, 1) - 1, 8));
    this.note(523 * rate, 0.12, { wave: 'triangle', gain: 0.4, detune: 0.015 });
    this.note(784 * rate, 0.16, { wave: 'triangle', gain: 0.35, delay: 0.07, detune: 0.015 });
  }

  chop(): void {
    this.noise(0.13, 260, 0.45);
    this.note(150, 0.1, { wave: 'square', gain: 0.18, sweepTo: 90, detune: 0.04 });
  }

  mine(): void {
    this.noise(0.11, 1600, 0.35);
    this.note(240, 0.09, { wave: 'square', gain: 0.16, sweepTo: 140, detune: 0.04 });
  }

  /** The last hit: a low whump under the topple, deeper for the oak. */
  fell(kind: 'oak' | 'rock'): void {
    const base = kind === 'oak' ? 90 : 130;
    this.noise(0.3, kind === 'oak' ? 180 : 900, 0.5);
    this.note(base, 0.34, { wave: 'sine', gain: 0.3, sweepTo: base * 0.55, detune: 0.03 });
  }

  water(): void {
    // A pour, not a splash: filtered noise sliding down, with a low body under
    // it. Sharing the plant sound would have made the second verb feel like
    // the first, which is the opposite of the point.
    this.noise(0.26, 900, 0.16);
    this.note(190, 0.22, { wave: 'sine', gain: 0.14, sweepTo: 140, detune: 0.04 });
    this.note(420, 0.18, { wave: 'sine', gain: 0.08, delay: 0.06, sweepTo: 300, detune: 0.04 });
  }

  shoo(): void {
    // A startled bird: two rough notes upward, then wingbeats.
    this.note(520, 0.09, { wave: 'sawtooth', gain: 0.16, sweepTo: 900 });
    this.note(700, 0.08, { wave: 'sawtooth', gain: 0.13, delay: 0.08, sweepTo: 1100 });
    for (let i = 0; i < 3; i++) this.noise(0.05, 700, 0.1, 0.16 + i * 0.09);
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
    this.note(700, 0.1, { wave: 'sine', gain: 0.28, sweepTo: 1000, detune: 0.04 });
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

  // -- music ----------------------------------------------------------------

  /**
   * A slow generated bed, because the game had none.
   *
   * Written as a scheduler rather than a loop of samples so it never repeats
   * exactly: each bar picks its notes from a pentatonic set, which cannot
   * produce a wrong interval however the dice fall — the cheapest way to get
   * music that survives being listened to for an hour.
   *
   * Deliberately quiet and sparse. This plays under a game someone may leave
   * open all evening; a tune that demands attention would be worse than
   * silence, and silence is what it is competing with.
   */
  private musicTimer: number | null = null;
  private musicMode: 'day' | 'night' | null = null;
  private musicBar = 0;

  setMusic(mode: 'day' | 'night' | null): void {
    if (mode === this.musicMode) return;
    this.musicMode = mode;

    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    if (!mode) return;

    const tick = () => {
      if (this.musicMode !== mode) return;
      // Paused rather than silenced when the tab is hidden: an evening of
      // notes scheduled into a background tab is battery spent on nothing.
      if (!this.muted && !document.hidden) this.bar(mode);
      this.musicTimer = window.setTimeout(tick, BAR_MS);
    };
    tick();
  }

  private bar(mode: 'day' | 'night'): void {
    // A minor pentatonic in A, an octave lower at night. Every note in it
    // agrees with every other, so a random choice is always in key.
    const SCALE = mode === 'day' ? [440, 523, 587, 659, 784] : [220, 262, 294, 330, 392];
    const root = mode === 'day' ? 220 : 110;
    const bar = this.musicBar++;

    // A held root every other bar is the whole harmony. More than this and it
    // stops being background.
    if (bar % 2 === 0) {
      this.note(root, 3.4, { wave: 'sine', gain: 0.07 });
      this.note(root * 1.5, 3.0, { wave: 'sine', gain: 0.04, delay: 0.2 });
    }

    const notes = mode === 'day' ? 3 : 2;
    for (let i = 0; i < notes; i++) {
      if (Math.random() < 0.35) continue;
      const freq = SCALE[Math.floor(Math.random() * SCALE.length)]!;
      this.note(freq, 0.9, {
        wave: 'triangle',
        gain: mode === 'day' ? 0.055 : 0.04,
        delay: i * 0.85 + Math.random() * 0.2,
      });
    }
  }

  stop(): void {
    this.setAmbience(null);
    this.setMusic(null);
  }
}

/** One bar of the generated bed. Slow on purpose — this is a farm, not a chase. */
const BAR_MS = 3600;

export const audio = new Synth();
