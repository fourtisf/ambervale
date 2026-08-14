/**
 * Deterministic noise for world generation.
 *
 * Everything here is a pure function of the seed, so every client generates a
 * byte-identical map. Nothing in this file may use Math.random().
 */

// The PRNG itself lives in game-config so the server generates delivery
// orders with exactly the same generator the client generates the world with.
export { mulberry32 } from '@ambervale/game-config';

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Classic PERM-table value noise. A shuffled 256-entry permutation gives each
 * lattice point a stable pseudo-random height; samples bilinearly interpolate
 * between them with a smoothstep falloff.
 */
export class ValueNoise {
  private readonly perm: Uint8Array;

  constructor(rng: () => number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates, driven by the seeded rng.
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = p[i]!;
      p[i] = p[j]!;
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
  }

  /** Lattice value at integer coords, in [0, 1]. */
  private lattice(ix: number, iy: number): number {
    return this.perm[((ix & 255) + this.perm[iy & 255]!) & 511]! / 255;
  }

  /** Sample in [0, 1]. */
  noise(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothstep(x - x0);
    const ty = smoothstep(y - y0);

    const v00 = this.lattice(x0, y0);
    const v10 = this.lattice(x0 + 1, y0);
    const v01 = this.lattice(x0, y0 + 1);
    const v11 = this.lattice(x0 + 1, y0 + 1);

    return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
  }

  /** Fractional Brownian motion — octaves of noise at halving amplitude. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

/**
 * Stable hash of a tile coordinate to [0, 1). Used for scatter decisions —
 * "does this tile get a flower?" — where a full noise sample is overkill and
 * per-tile independence is what we actually want.
 */
export function h01(x: number, y: number, salt = 0): number {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
