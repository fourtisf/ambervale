/**
 * Procedural sprite atlas.
 *
 * Every building, tree, rock and prop is drawn once into a texture at boot —
 * no external image assets ship with the game. Textures are baked at 2× and
 * drawn at 0.5 scale so they stay crisp when the camera zooms in.
 *
 * Painters take an `s` scale factor and draw in unscaled design units, with
 * the subject standing on the bottom edge, centred horizontally. Sprites are
 * therefore placed with setOrigin(0.5, 1).
 */

import { CROP_KEYS, type CropKey } from '@ambervale/game-config';
import type Phaser from 'phaser';

/** Textures are rendered at this multiple of their design size. */
export const TEX_SCALE = 2;

/** Sprites made from those textures are drawn at this scale. */
export const SPRITE_SCALE = 1 / TEX_SCALE;

export const PALETTE = {
  wood: 0x8b5a2b,
  woodDark: 0x6b4420,
  woodLight: 0xa6733c,
  roof: 0xb5473a,
  roofDark: 0x8f3529,
  roofLight: 0xc85c4d,
  wall: 0xf0e2c0,
  wallShade: 0xdccaa2,
  stone: 0x8a8f98,
  stoneDark: 0x6b7079,
  stoneLight: 0xa8adb6,
  leaf: 0x3f7a3a,
  leafDark: 0x2f5e2c,
  leafLight: 0x57a44c,
  leafAutumn: 0xc8853a,
  leafAutumnDark: 0x9a6226,
  leafAutumnLight: 0xe0a154,
  pine: 0x2f5f45,
  pineDark: 0x224936,
  trunk: 0x6b4a2f,
  trunkDark: 0x4d3521,
  amber: 0xf4b942,
  amberDeep: 0xd99a28,
  cream: 0xf5e6c8,
  shadow: 0x0a2e3d,
} as const;

type Painter = (g: Phaser.GameObjects.Graphics, s: number) => void;

interface SpriteDef {
  key: string;
  w: number;
  h: number;
  paint: Painter;
  /**
   * Enlarges a painter without rewriting it.
   *
   * Every landmark below is drawn inside the same 64-wide box, because that is
   * the comfortable size to reason about coordinates in. Drawn at 1× they came
   * out shorter than the ambient pines — a 7,000-coin watchtower that a
   * background tree looked down on. This multiplies both the canvas and the
   * coordinate scale, so the art is untouched and the object is simply bigger.
   */
  zoom?: number;
}

/** Soft contact shadow under a standing object. */
function shadow(g: Phaser.GameObjects.Graphics, s: number, cx: number, y: number, rx: number) {
  g.fillStyle(PALETTE.shadow, 0.18);
  g.fillEllipse(cx * s, y * s, rx * 2 * s, rx * 0.55 * s);
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

const house: Painter = (g, s) => {
  shadow(g, s, 68, 122, 52);
  // walls
  g.fillStyle(PALETTE.wall, 1);
  g.fillRoundedRect(20 * s, 52 * s, 96 * s, 68 * s, 4 * s);
  g.fillStyle(PALETTE.wallShade, 1);
  g.fillRect(20 * s, 96 * s, 96 * s, 24 * s);
  // roof
  g.fillStyle(PALETTE.roof, 1);
  g.fillPoints(
    [
      { x: 8 * s, y: 56 * s },
      { x: 68 * s, y: 12 * s },
      { x: 128 * s, y: 56 * s },
    ],
    true,
  );
  g.fillStyle(PALETTE.roofDark, 1);
  g.fillPoints(
    [
      { x: 68 * s, y: 12 * s },
      { x: 128 * s, y: 56 * s },
      { x: 112 * s, y: 56 * s },
      { x: 68 * s, y: 24 * s },
    ],
    true,
  );
  // chimney
  g.fillStyle(PALETTE.stoneDark, 1);
  g.fillRect(96 * s, 16 * s, 14 * s, 28 * s);
  // door
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRoundedRect(58 * s, 82 * s, 22 * s, 38 * s, 3 * s);
  g.fillStyle(PALETTE.amber, 1);
  g.fillCircle(75 * s, 102 * s, 2.2 * s);
  // windows — these are the tiles that glow at night
  g.fillStyle(PALETTE.amber, 1);
  g.fillRoundedRect(30 * s, 68 * s, 20 * s, 18 * s, 2 * s);
  g.fillRoundedRect(88 * s, 68 * s, 20 * s, 18 * s, 2 * s);
  g.lineStyle(1.5 * s, PALETTE.woodDark, 1);
  g.strokeRoundedRect(30 * s, 68 * s, 20 * s, 18 * s, 2 * s);
  g.strokeRoundedRect(88 * s, 68 * s, 20 * s, 18 * s, 2 * s);
};

const barn: Painter = (g, s) => {
  shadow(g, s, 74, 130, 58);
  g.fillStyle(PALETTE.roof, 1);
  g.fillRoundedRect(16 * s, 54 * s, 116 * s, 74 * s, 4 * s);
  g.fillStyle(PALETTE.roofDark, 1);
  g.fillRect(16 * s, 104 * s, 116 * s, 24 * s);
  // gambrel roof
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillPoints(
    [
      { x: 8 * s, y: 58 * s },
      { x: 34 * s, y: 26 * s },
      { x: 114 * s, y: 26 * s },
      { x: 140 * s, y: 58 * s },
    ],
    true,
  );
  // white trim + doors
  g.fillStyle(PALETTE.wall, 1);
  g.fillRect(58 * s, 74 * s, 32 * s, 54 * s);
  g.lineStyle(3 * s, PALETTE.wall, 1);
  g.strokeRect(58 * s, 74 * s, 32 * s, 54 * s);
  g.lineBetween(58 * s, 74 * s, 90 * s, 128 * s);
  g.lineBetween(90 * s, 74 * s, 58 * s, 128 * s);
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRect(72 * s, 74 * s, 4 * s, 54 * s);
  // hayloft
  g.fillStyle(PALETTE.amber, 1);
  g.fillCircle(74 * s, 44 * s, 8 * s);
};

const windmill: Painter = (g, s) => {
  shadow(g, s, 48, 126, 36);
  // tapered tower
  g.fillStyle(PALETTE.wall, 1);
  g.fillPoints(
    [
      { x: 30 * s, y: 40 * s },
      { x: 66 * s, y: 40 * s },
      { x: 78 * s, y: 126 * s },
      { x: 18 * s, y: 126 * s },
    ],
    true,
  );
  g.fillStyle(PALETTE.wallShade, 1);
  g.fillPoints(
    [
      { x: 54 * s, y: 40 * s },
      { x: 66 * s, y: 40 * s },
      { x: 78 * s, y: 126 * s },
      { x: 62 * s, y: 126 * s },
    ],
    true,
  );
  // cap
  g.fillStyle(PALETTE.roof, 1);
  g.fillPoints(
    [
      { x: 24 * s, y: 42 * s },
      { x: 48 * s, y: 16 * s },
      { x: 72 * s, y: 42 * s },
    ],
    true,
  );
  // window (glows at night) and door
  g.fillStyle(PALETTE.amber, 1);
  g.fillRoundedRect(40 * s, 56 * s, 16 * s, 16 * s, 2 * s);
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRoundedRect(38 * s, 96 * s, 20 * s, 30 * s, 2 * s);
};

/** Blades are a separate sprite so they can spin about their hub. */
const windmillBlades: Painter = (g, s) => {
  const c = 60;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // sail
    g.fillStyle(PALETTE.cream, 1);
    g.fillPoints(
      [
        { x: (c + dx * 8) * s, y: (c + dy * 8) * s },
        { x: (c + dx * 54 - dy * 9) * s, y: (c + dy * 54 + dx * 9) * s },
        { x: (c + dx * 54 + dy * 3) * s, y: (c + dy * 54 - dx * 3) * s },
      ],
      true,
    );
    // spar
    g.lineStyle(2.5 * s, PALETTE.woodDark, 1);
    g.lineBetween(c * s, c * s, (c + dx * 56) * s, (c + dy * 56) * s);
  }
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillCircle(c * s, c * s, 5 * s);
};

const market: Painter = (g, s) => {
  shadow(g, s, 60, 106, 50);
  // posts
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRect(12 * s, 44 * s, 6 * s, 62 * s);
  g.fillRect(102 * s, 44 * s, 6 * s, 62 * s);
  // counter + crates
  g.fillStyle(PALETTE.wood, 1);
  g.fillRoundedRect(14 * s, 74 * s, 92 * s, 32 * s, 3 * s);
  g.fillStyle(PALETTE.woodLight, 1);
  g.fillRoundedRect(22 * s, 60 * s, 24 * s, 16 * s, 2 * s);
  g.fillRoundedRect(52 * s, 62 * s, 20 * s, 14 * s, 2 * s);
  g.fillStyle(PALETTE.leafLight, 1);
  g.fillCircle(84 * s, 68 * s, 7 * s);
  g.fillStyle(PALETTE.amber, 1);
  g.fillCircle(94 * s, 70 * s, 5 * s);
  // striped awning
  const stripes = 6;
  const wStripe = 96 / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 === 0 ? PALETTE.roof : PALETTE.cream, 1);
    g.fillPoints(
      [
        { x: (12 + i * wStripe) * s, y: 26 * s },
        { x: (12 + (i + 1) * wStripe) * s, y: 26 * s },
        { x: (12 + (i + 1) * wStripe) * s, y: 46 * s },
        { x: (12 + i * wStripe) * s, y: 46 * s },
      ],
      true,
    );
  }
  g.fillStyle(PALETTE.roofDark, 1);
  g.fillRect(10 * s, 22 * s, 100 * s, 6 * s);
};

const board: Painter = (g, s) => {
  shadow(g, s, 40, 78, 26);
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRect(24 * s, 44 * s, 6 * s, 34 * s);
  g.fillRect(50 * s, 44 * s, 6 * s, 34 * s);
  g.fillStyle(PALETTE.wood, 1);
  g.fillRoundedRect(8 * s, 10 * s, 64 * s, 42 * s, 3 * s);
  g.fillStyle(PALETTE.woodLight, 1);
  g.fillRoundedRect(11 * s, 13 * s, 58 * s, 36 * s, 2 * s);
  // pinned notes
  const notes: [number, number, number][] = [
    [17, 18, 0xfdf6e3],
    [34, 20, 0xffe9b0],
    [51, 17, 0xfdf6e3],
  ];
  for (const [nx, ny, color] of notes) {
    g.fillStyle(color, 1);
    g.fillRect(nx * s, ny * s, 15 * s, 19 * s);
    g.fillStyle(PALETTE.roof, 1);
    g.fillCircle((nx + 7.5) * s, (ny + 2) * s, 1.8 * s);
  }
};

const coop: Painter = (g, s) => {
  shadow(g, s, 44, 74, 34);
  g.fillStyle(PALETTE.wall, 1);
  g.fillRoundedRect(14 * s, 34 * s, 60 * s, 40 * s, 3 * s);
  g.fillStyle(PALETTE.roof, 1);
  g.fillPoints(
    [
      { x: 6 * s, y: 38 * s },
      { x: 44 * s, y: 12 * s },
      { x: 82 * s, y: 38 * s },
    ],
    true,
  );
  // round entrance (glows at night) + ramp
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillCircle(44 * s, 54 * s, 11 * s);
  g.fillStyle(PALETTE.amber, 0.55);
  g.fillCircle(44 * s, 54 * s, 8 * s);
  g.fillStyle(PALETTE.wood, 1);
  g.fillPoints(
    [
      { x: 36 * s, y: 64 * s },
      { x: 52 * s, y: 64 * s },
      { x: 58 * s, y: 74 * s },
      { x: 30 * s, y: 74 * s },
    ],
    true,
  );
};

const dockPlank: Painter = (g, s) => {
  g.fillStyle(PALETTE.wood, 1);
  g.fillRect(0, 0, 64 * s, 40 * s);
  g.fillStyle(PALETTE.woodDark, 1);
  for (let i = 0; i < 4; i++) g.fillRect(0, (i * 10 + 8) * s, 64 * s, 2 * s);
  g.fillStyle(PALETTE.woodLight, 1);
  g.fillRect(0, 0, 64 * s, 2 * s);
};

const rowboat: Painter = (g, s) => {
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillEllipse(36 * s, 22 * s, 68 * s, 26 * s);
  g.fillStyle(PALETTE.woodLight, 1);
  g.fillEllipse(36 * s, 20 * s, 58 * s, 18 * s);
  g.fillStyle(PALETTE.wood, 1);
  g.fillRect(24 * s, 14 * s, 24 * s, 4 * s);
  g.lineStyle(2.5 * s, PALETTE.woodDark, 1);
  g.lineBetween(44 * s, 18 * s, 66 * s, 8 * s);
};

const sign: Painter = (g, s) => {
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRect(28 * s, 30 * s, 5 * s, 26 * s);
  g.fillStyle(PALETTE.wood, 1);
  g.fillRoundedRect(2 * s, 8 * s, 58 * s, 24 * s, 3 * s);
  g.fillStyle(PALETTE.woodLight, 1);
  g.fillRoundedRect(4 * s, 10 * s, 54 * s, 20 * s, 2 * s);
};

const lamp: Painter = (g, s) => {
  shadow(g, s, 14, 60, 9);
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRect(11 * s, 20 * s, 6 * s, 40 * s);
  g.fillStyle(PALETTE.stoneDark, 1);
  g.fillRoundedRect(5 * s, 6 * s, 18 * s, 18 * s, 3 * s);
  g.fillStyle(PALETTE.amber, 1);
  g.fillRoundedRect(8 * s, 9 * s, 12 * s, 12 * s, 2 * s);
};

/**
 * Fences.
 *
 * Drawn as posts standing up with rails behind them, plus a ground shadow.
 * The previous pair were two parallel rails with evenly spaced rungs, which
 * from this camera angle read unmistakably as a ladder lying flat.
 */
const fenceH: Painter = (g, s) => {
  g.fillStyle(PALETTE.shadow, 0.16);
  g.fillEllipse(32 * s, 26 * s, 58 * s, 7 * s);

  // rails span the tile, drawn behind the posts
  g.fillStyle(PALETTE.wood, 1);
  g.fillRoundedRect(0, 9 * s, 64 * s, 3.5 * s, 1.5 * s);
  g.fillRoundedRect(0, 16 * s, 64 * s, 3.5 * s, 1.5 * s);
  g.fillStyle(PALETTE.woodLight, 0.5);
  g.fillRect(0, 9 * s, 64 * s, 1.2 * s);

  // posts, with a lit left face
  for (const px of [6, 52]) {
    g.fillStyle(PALETTE.woodDark, 1);
    g.fillRoundedRect(px * s, 2 * s, 6 * s, 24 * s, 2 * s);
    g.fillStyle(PALETTE.wood, 1);
    g.fillRoundedRect(px * s, 2 * s, 2.6 * s, 24 * s, 1.5 * s);
  }
};

const fenceV: Painter = (g, s) => {
  g.fillStyle(PALETTE.shadow, 0.16);
  g.fillEllipse(15 * s, 60 * s, 20 * s, 6 * s);

  // two rails running down the tile, seen edge-on. One rail alone reads as a
  // dropped stick rather than a fence line.
  g.fillStyle(PALETTE.wood, 1);
  g.fillRoundedRect(9 * s, 0, 4.5 * s, 64 * s, 2 * s);
  g.fillRoundedRect(17 * s, 0, 4.5 * s, 64 * s, 2 * s);
  g.fillStyle(PALETTE.woodLight, 0.45);
  g.fillRect(9 * s, 0, 1.5 * s, 64 * s);
  g.fillRect(17 * s, 0, 1.5 * s, 64 * s);

  // one post per tile, so a run reads as evenly spaced uprights
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRoundedRect(7 * s, 34 * s, 9 * s, 26 * s, 2.5 * s);
  g.fillStyle(PALETTE.wood, 1);
  g.fillRoundedRect(7 * s, 34 * s, 3.4 * s, 26 * s, 2 * s);
};

// ---------------------------------------------------------------------------
// Nature
// ---------------------------------------------------------------------------

/** Shared canopy builder so oak and its autumn variant stay in step. */
function canopy(
  g: Phaser.GameObjects.Graphics,
  s: number,
  dark: number,
  mid: number,
  light: number,
) {
  g.fillStyle(dark, 1);
  g.fillCircle(40 * s, 46 * s, 30 * s);
  g.fillCircle(70 * s, 52 * s, 26 * s);
  g.fillCircle(56 * s, 26 * s, 26 * s);
  g.fillStyle(mid, 1);
  g.fillCircle(46 * s, 44 * s, 24 * s);
  g.fillCircle(68 * s, 48 * s, 20 * s);
  g.fillCircle(56 * s, 28 * s, 20 * s);
  g.fillStyle(light, 1);
  g.fillCircle(48 * s, 32 * s, 13 * s);
  g.fillCircle(38 * s, 44 * s, 9 * s);
}

const oak: Painter = (g, s) => {
  shadow(g, s, 55, 118, 28);
  g.fillStyle(PALETTE.trunkDark, 1);
  g.fillRect(48 * s, 74 * s, 16 * s, 44 * s);
  g.fillStyle(PALETTE.trunk, 1);
  g.fillRect(48 * s, 74 * s, 9 * s, 44 * s);
  canopy(g, s, PALETTE.leafDark, PALETTE.leaf, PALETTE.leafLight);
};

const oakAutumn: Painter = (g, s) => {
  shadow(g, s, 55, 118, 28);
  g.fillStyle(PALETTE.trunkDark, 1);
  g.fillRect(48 * s, 74 * s, 16 * s, 44 * s);
  g.fillStyle(PALETTE.trunk, 1);
  g.fillRect(48 * s, 74 * s, 9 * s, 44 * s);
  canopy(g, s, PALETTE.leafAutumnDark, PALETTE.leafAutumn, PALETTE.leafAutumnLight);
};

const pine: Painter = (g, s) => {
  shadow(g, s, 44, 118, 22);
  g.fillStyle(PALETTE.trunkDark, 1);
  g.fillRect(39 * s, 88 * s, 12 * s, 30 * s);
  const tiers: [number, number, number][] = [
    [88, 40, 8],
    [64, 34, 14],
    [42, 26, 22],
  ];
  for (const [baseY, halfW, topY] of tiers) {
    g.fillStyle(PALETTE.pineDark, 1);
    g.fillPoints(
      [
        { x: (44 - halfW) * s, y: baseY * s },
        { x: 44 * s, y: topY * s },
        { x: (44 + halfW) * s, y: baseY * s },
      ],
      true,
    );
    g.fillStyle(PALETTE.pine, 1);
    g.fillPoints(
      [
        { x: (44 - halfW + 4) * s, y: (baseY - 2) * s },
        { x: 44 * s, y: (topY + 6) * s },
        { x: 44 * s, y: (baseY - 2) * s },
      ],
      true,
    );
  }
};

const stump: Painter = (g, s) => {
  shadow(g, s, 26, 34, 16);
  g.fillStyle(PALETTE.trunkDark, 1);
  g.fillRoundedRect(8 * s, 12 * s, 36 * s, 22 * s, 3 * s);
  g.fillStyle(PALETTE.trunk, 1);
  g.fillEllipse(26 * s, 13 * s, 36 * s, 12 * s);
  g.lineStyle(1.5 * s, PALETTE.trunkDark, 0.8);
  g.strokeEllipse(26 * s, 13 * s, 22 * s, 7 * s);
  g.strokeEllipse(26 * s, 13 * s, 11 * s, 4 * s);
};

/**
 * Rocks at each hp state: 3 is pristine, 1 is nearly gone, 0 is rubble left
 * behind while the node respawns.
 */
function rockAt(hp: number): Painter {
  return (g, s) => {
    const scale = [0.42, 0.62, 0.82, 1][hp] ?? 1;
    const w = 56 * scale;
    const h = 40 * scale;
    const cx = 32;
    const baseY = 46;

    shadow(g, s, cx, baseY, w * 0.42);

    if (hp === 0) {
      // rubble: a few scattered chips
      g.fillStyle(PALETTE.stoneDark, 1);
      g.fillCircle((cx - 9) * s, (baseY - 4) * s, 5 * s);
      g.fillCircle((cx + 7) * s, (baseY - 3) * s, 4 * s);
      g.fillStyle(PALETTE.stone, 1);
      g.fillCircle((cx - 1) * s, (baseY - 6) * s, 6 * s);
      return;
    }

    g.fillStyle(PALETTE.stoneDark, 1);
    g.fillPoints(
      [
        { x: (cx - w / 2) * s, y: baseY * s },
        { x: (cx - w / 2.6) * s, y: (baseY - h * 0.62) * s },
        { x: (cx - w / 6) * s, y: (baseY - h) * s },
        { x: (cx + w / 4) * s, y: (baseY - h * 0.88) * s },
        { x: (cx + w / 2) * s, y: (baseY - h * 0.3) * s },
      ],
      true,
    );
    g.fillStyle(PALETTE.stone, 1);
    g.fillPoints(
      [
        { x: (cx - w / 2.8) * s, y: (baseY - h * 0.08) * s },
        { x: (cx - w / 3.4) * s, y: (baseY - h * 0.6) * s },
        { x: (cx - w / 8) * s, y: (baseY - h * 0.92) * s },
        { x: (cx + w / 5) * s, y: (baseY - h * 0.8) * s },
        { x: (cx + w / 2.6) * s, y: (baseY - h * 0.28) * s },
      ],
      true,
    );
    g.fillStyle(PALETTE.stoneLight, 0.85);
    g.fillEllipse((cx - w * 0.12) * s, (baseY - h * 0.66) * s, w * 0.3 * s, h * 0.22 * s);
  };
}

const bush: Painter = (g, s) => {
  shadow(g, s, 26, 40, 17);
  g.fillStyle(PALETTE.leafDark, 1);
  g.fillCircle(16 * s, 30 * s, 13 * s);
  g.fillCircle(36 * s, 30 * s, 13 * s);
  g.fillCircle(26 * s, 22 * s, 15 * s);
  g.fillStyle(PALETTE.leaf, 1);
  g.fillCircle(24 * s, 24 * s, 11 * s);
  g.fillStyle(PALETTE.leafLight, 1);
  g.fillCircle(20 * s, 19 * s, 5 * s);
};

// ---------------------------------------------------------------------------
// Plots and crops
// ---------------------------------------------------------------------------

/**
 * Tilled soil.
 *
 * Read as turned earth rather than a brown card: a raised rim catching light
 * at the top, ridges with a lit crest and a shadowed trough, and clods
 * scattered across it. Flat fill plus three lines reads as cardboard, because
 * nothing in it suggests the surface has any thickness.
 */
const soil: Painter = (g, s) => {
  // outer lip / cast shadow
  g.fillStyle(0x4e3a23, 1);
  g.fillRoundedRect(2 * s, 3 * s, 60 * s, 59 * s, 8 * s);
  // soil body
  g.fillStyle(0x6f5231, 1);
  g.fillRoundedRect(3 * s, 2 * s, 58 * s, 57 * s, 8 * s);
  // sunlit top edge
  g.fillStyle(0x8a663e, 1);
  g.fillRoundedRect(5 * s, 4 * s, 54 * s, 22 * s, 7 * s);
  g.fillStyle(0x7a5a37, 1);
  g.fillRoundedRect(5 * s, 14 * s, 54 * s, 42 * s, 7 * s);

  // ridges: lit crest above, dark trough below
  for (let i = 0; i < 4; i++) {
    const y = 13 + i * 11;
    g.fillStyle(0x8f6b41, 0.9);
    g.fillRoundedRect(8 * s, y * s, 48 * s, 4 * s, 2 * s);
    g.fillStyle(0x5b4227, 0.55);
    g.fillRoundedRect(8 * s, (y + 4) * s, 48 * s, 3 * s, 1.5 * s);
  }

  // clods
  const clods: [number, number, number][] = [
    [16, 20, 2.4],
    [39, 31, 2.0],
    [24, 44, 2.6],
    [47, 18, 1.8],
    [31, 12, 1.6],
  ];
  for (const [cx, cy, r] of clods) {
    g.fillStyle(0x5b4227, 0.5);
    g.fillCircle(cx * s, (cy + 1) * s, r * s);
    g.fillStyle(0x99724a, 0.85);
    g.fillCircle(cx * s, cy * s, r * s);
  }
};

/**
 * The crow, sitting on a crop it is busy ruining.
 *
 * Drawn dark and squat rather than as a detailed bird: at this sprite scale
 * the shape has to read from across the field in one glance, and the only
 * thing a player needs to recognise is "something black is on my plot".
 */
const crow: Painter = (g, s) => {
  shadow(g, s, 13, 21, 8);

  // Body and tail as one wedge, so the silhouette stays legible when small.
  g.fillStyle(0x1c2230, 1);
  g.fillEllipse(13 * s, 13 * s, 16 * s, 12 * s);
  g.fillTriangle(19 * s, 12 * s, 26 * s, 9 * s, 20 * s, 17 * s);

  // Head, set forward and slightly higher than the body's centre line.
  g.fillCircle(8 * s, 8 * s, 5.2 * s);

  // Beak: the one warm note, and what makes it a bird rather than a blob.
  g.fillStyle(0xe8a33d, 1);
  g.fillTriangle(3.6 * s, 8 * s, 0.5 * s, 9.4 * s, 4 * s, 10.4 * s);

  // A folded wing, a shade lighter so the body does not read as flat.
  g.fillStyle(0x2b3446, 1);
  g.fillEllipse(14 * s, 12.5 * s, 10 * s, 6.5 * s);

  g.fillStyle(0xf5e6c8, 1);
  g.fillCircle(6.8 * s, 7 * s, 1.15 * s);
};

/** The dashed highlight ring drawn under a harvest-ready crop. */
const readyRing: Painter = (g, s) => {
  g.lineStyle(3 * s, 0xf4d35e, 0.95);
  g.strokeCircle(34 * s, 34 * s, 27 * s);
  g.lineStyle(2 * s, 0xfff6d0, 0.6);
  g.strokeCircle(34 * s, 34 * s, 21 * s);
};

interface CropStyle {
  /** Colour of the fruit/flower head. */
  head: number;
  headDark: number;
  /** Head shape at full growth. */
  shape: 'flower' | 'root' | 'gourd' | 'star';
}

const CROP_STYLE: Record<CropKey, CropStyle> = {
  sunflower: { head: 0xf4c542, headDark: 0xd39a1e, shape: 'flower' },
  carrot: { head: 0xe8792b, headDark: 0xbc5c19, shape: 'root' },
  pumpkin: { head: 0xe07a28, headDark: 0xb35a17, shape: 'gourd' },
  starglow: { head: 0x9fe8ff, headDark: 0x54a8d8, shape: 'star' },
};

/** Growth stages 0..3; 3 is harvest-ready. */
export const CROP_STAGES = 4;

function cropPainter(key: CropKey, stage: number): Painter {
  const style = CROP_STYLE[key];
  // Stage 0 is a sprout; the head only appears from stage 2.
  const t = stage / (CROP_STAGES - 1);

  return (g, s) => {
    const cx = 32;
    const baseY = 56;
    const height = 8 + t * 30;

    // stem
    g.lineStyle(Math.max(2, 3 * t + 2) * s, 0x3f7a3a, 1);
    g.lineBetween(cx * s, baseY * s, cx * s, (baseY - height) * s);

    // leaves
    const leafR = 4 + t * 6;
    g.fillStyle(0x4f9142, 1);
    g.fillEllipse((cx - 7 - t * 4) * s, (baseY - height * 0.45) * s, leafR * 2.2 * s, leafR * s);
    g.fillEllipse((cx + 7 + t * 4) * s, (baseY - height * 0.62) * s, leafR * 2.2 * s, leafR * s);

    if (stage < 2) return;

    const hy = baseY - height;
    const scale = stage === 2 ? 0.6 : 1;

    switch (style.shape) {
      case 'flower': {
        const r = 11 * scale;
        g.fillStyle(style.head, 1);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.fillEllipse(
            (cx + Math.cos(a) * r * 0.85) * s,
            (hy + Math.sin(a) * r * 0.85) * s,
            r * 0.9 * s,
            r * 0.6 * s,
          );
        }
        g.fillStyle(0x6b4a2f, 1);
        g.fillCircle(cx * s, hy * s, r * 0.55 * s);
        break;
      }
      case 'root': {
        // Carrot shoulders just breaking the soil.
        g.fillStyle(style.head, 1);
        g.fillEllipse(cx * s, (baseY - 6) * s, 20 * scale * s, 11 * scale * s);
        g.fillStyle(style.headDark, 1);
        g.fillEllipse(cx * s, (baseY - 4) * s, 14 * scale * s, 6 * scale * s);
        break;
      }
      case 'gourd': {
        const r = 13 * scale;
        g.fillStyle(style.headDark, 1);
        g.fillEllipse(cx * s, (baseY - r * 0.8) * s, r * 2.3 * s, r * 1.8 * s);
        g.fillStyle(style.head, 1);
        g.fillEllipse(cx * s, (baseY - r * 0.85) * s, r * 1.9 * s, r * 1.5 * s);
        g.fillStyle(style.headDark, 0.7);
        g.fillRect((cx - 1) * s, (baseY - r * 1.6) * s, 2 * s, r * 1.5 * s);
        break;
      }
      case 'star': {
        const r = 12 * scale;
        g.fillStyle(style.head, 1);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          g.fillEllipse(
            (cx + Math.cos(a) * r * 0.7) * s,
            (hy + Math.sin(a) * r * 0.7) * s,
            r * 0.85 * s,
            r * 0.85 * s,
          );
        }
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(cx * s, hy * s, r * 0.5 * s);
        break;
      }
    }
  };
}

/** Texture key for a crop at a growth stage. */
export const cropTextureKey = (key: string, stage: number): string =>
  `crop_${key}_${Math.max(0, Math.min(CROP_STAGES - 1, stage))}`;

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/** The player: straw hat, tunic, boots. Facing is done by flipping X. */
const player: Painter = (g, s) => {
  shadow(g, s, 20, 52, 11);
  // legs
  g.fillStyle(0x4d3521, 1);
  g.fillRoundedRect(13 * s, 38 * s, 6 * s, 14 * s, 2 * s);
  g.fillRoundedRect(21 * s, 38 * s, 6 * s, 14 * s, 2 * s);
  // tunic
  g.fillStyle(0x4a86b8, 1);
  g.fillRoundedRect(9 * s, 20 * s, 22 * s, 22 * s, 5 * s);
  g.fillStyle(0x3b6d97, 1);
  g.fillRect(9 * s, 34 * s, 22 * s, 8 * s);
  // arms
  g.fillStyle(0xf0c9a0, 1);
  g.fillRoundedRect(4 * s, 24 * s, 6 * s, 14 * s, 3 * s);
  g.fillRoundedRect(30 * s, 24 * s, 6 * s, 14 * s, 3 * s);
  // head
  g.fillStyle(0xf0c9a0, 1);
  g.fillCircle(20 * s, 15 * s, 9 * s);
  // straw hat
  g.fillStyle(0xe8c46a, 1);
  g.fillEllipse(20 * s, 10 * s, 30 * s, 10 * s);
  g.fillStyle(0xd4a94a, 1);
  g.fillEllipse(20 * s, 6 * s, 16 * s, 11 * s);
  // eyes
  g.fillStyle(0x2a1a05, 1);
  g.fillCircle(17 * s, 16 * s, 1.6 * s);
  g.fillCircle(23 * s, 16 * s, 1.6 * s);
};

const chicken: Painter = (g, s) => {
  shadow(g, s, 16, 26, 8);
  g.fillStyle(0xf5f0e4, 1);
  g.fillEllipse(16 * s, 17 * s, 22 * s, 17 * s);
  g.fillCircle(22 * s, 10 * s, 6 * s);
  g.fillStyle(0xd94f3d, 1);
  g.fillCircle(22 * s, 5 * s, 2.6 * s);
  g.fillCircle(24 * s, 4 * s, 2.2 * s);
  g.fillStyle(0xe8a83a, 1);
  g.fillTriangle(27 * s, 10 * s, 32 * s, 11.5 * s, 27 * s, 13 * s);
  g.fillRect(12 * s, 24 * s, 2 * s, 4 * s);
  g.fillRect(18 * s, 24 * s, 2 * s, 4 * s);
  g.fillStyle(0x2a1a05, 1);
  g.fillCircle(24 * s, 9 * s, 1.3 * s);
};

const cow: Painter = (g, s) => {
  shadow(g, s, 30, 40, 18);
  g.fillStyle(0xf5f2ec, 1);
  g.fillRoundedRect(8 * s, 14 * s, 44 * s, 24 * s, 10 * s);
  g.fillStyle(0x3a3a3a, 1);
  g.fillEllipse(20 * s, 22 * s, 14 * s, 11 * s);
  g.fillEllipse(40 * s, 30 * s, 11 * s, 9 * s);
  g.fillStyle(0xf5f2ec, 1);
  g.fillCircle(50 * s, 15 * s, 9 * s);
  g.fillStyle(0xf0b8bc, 1);
  g.fillEllipse(54 * s, 18 * s, 9 * s, 6 * s);
  g.fillStyle(0x2a1a05, 1);
  g.fillCircle(48 * s, 12 * s, 1.6 * s);
  g.fillStyle(0x4d3521, 1);
  g.fillRect(14 * s, 36 * s, 4 * s, 6 * s);
  g.fillRect(40 * s, 36 * s, 4 * s, 6 * s);
};

const egg: Painter = (g, s) => {
  shadow(g, s, 10, 17, 6);
  g.fillStyle(0xfdf6e3, 1);
  g.fillEllipse(10 * s, 10 * s, 14 * s, 18 * s);
  g.fillStyle(0xffffff, 0.8);
  g.fillEllipse(7 * s, 6 * s, 5 * s, 6 * s);
};

/**
 * The farm dog, trotting. Drawn facing right like the other animals; the
 * follower flips her by travel direction. Warm tan with a cream chest and a
 * red collar — one saturated accent so she reads at gameplay zoom.
 */
const dog: Painter = (g, s) => {
  shadow(g, s, 20, 28, 12);
  // tail, up and curled — a happy dog, permanently
  g.fillStyle(0xb07a44, 1);
  g.fillEllipse(7 * s, 12 * s, 8 * s, 5 * s);
  g.fillCircle(5 * s, 10 * s, 2.6 * s);
  // body
  g.fillStyle(0xc98d52, 1);
  g.fillRoundedRect(8 * s, 14 * s, 22 * s, 11 * s, 5 * s);
  // cream chest and belly
  g.fillStyle(0xefdcbb, 1);
  g.fillEllipse(26 * s, 22 * s, 10 * s, 7 * s);
  // legs
  g.fillStyle(0xb07a44, 1);
  g.fillRect(11 * s, 23 * s, 3 * s, 6 * s);
  g.fillRect(17 * s, 23 * s, 3 * s, 6 * s);
  g.fillRect(24 * s, 23 * s, 3 * s, 6 * s);
  g.fillRect(29 * s, 23 * s, 3 * s, 6 * s);
  // head
  g.fillStyle(0xc98d52, 1);
  g.fillCircle(32 * s, 11 * s, 7 * s);
  // muzzle
  g.fillStyle(0xefdcbb, 1);
  g.fillEllipse(37 * s, 13 * s, 8 * s, 6 * s);
  g.fillStyle(0x3a2a18, 1);
  g.fillCircle(40 * s, 12 * s, 1.8 * s);
  // floppy ear
  g.fillStyle(0x9a6636, 1);
  g.fillEllipse(29 * s, 7 * s, 6 * s, 9 * s);
  // collar
  g.fillStyle(0xd94f3d, 1);
  g.fillRect(27 * s, 16 * s, 8 * s, 2.6 * s);
  g.fillStyle(0xf4d35e, 1);
  g.fillCircle(31 * s, 19.4 * s, 1.6 * s);
  // eye
  g.fillStyle(0x2a1a05, 1);
  g.fillCircle(33 * s, 10 * s, 1.5 * s);
};

/** The same dog, sat on her haunches — played when the farmer stands still. */
const dogSit: Painter = (g, s) => {
  shadow(g, s, 16, 30, 10);
  // tail curled on the ground
  g.fillStyle(0xb07a44, 1);
  g.fillEllipse(7 * s, 28 * s, 9 * s, 5 * s);
  // haunches
  g.fillStyle(0xc98d52, 1);
  g.fillEllipse(14 * s, 24 * s, 16 * s, 13 * s);
  // upright chest
  g.fillRoundedRect(14 * s, 10 * s, 12 * s, 18 * s, 5 * s);
  g.fillStyle(0xefdcbb, 1);
  g.fillEllipse(20 * s, 22 * s, 8 * s, 10 * s);
  // front legs, straight down
  g.fillStyle(0xb07a44, 1);
  g.fillRect(16 * s, 24 * s, 3 * s, 7 * s);
  g.fillRect(22 * s, 24 * s, 3 * s, 7 * s);
  // head, tilted a touch
  g.fillStyle(0xc98d52, 1);
  g.fillCircle(21 * s, 8 * s, 7 * s);
  g.fillStyle(0xefdcbb, 1);
  g.fillEllipse(26 * s, 10 * s, 7 * s, 5.4 * s);
  g.fillStyle(0x3a2a18, 1);
  g.fillCircle(28.6 * s, 9.4 * s, 1.7 * s);
  g.fillStyle(0x9a6636, 1);
  g.fillEllipse(17 * s, 4 * s, 6 * s, 8 * s);
  g.fillStyle(0xd94f3d, 1);
  g.fillRect(16 * s, 14 * s, 9 * s, 2.6 * s);
  g.fillStyle(0x2a1a05, 1);
  g.fillCircle(22.4 * s, 7 * s, 1.5 * s);
};

/**
 * The Amber Deep's mouth: a rocky hillock with a timber-propped opening, the
 * dark of it warmed by a faint amber glow from below. It sits on the Far
 * Shore as the island's landmark — the thing you can see from the boat and
 * want to walk to.
 */
const cave: Painter = (g, s) => {
  shadow(g, s, 75, 102, 52);

  // The hillock, two masses of grey rock with a mossy crown.
  g.fillStyle(0x6d7466, 1);
  g.fillEllipse(75 * s, 62 * s, 132 * s, 84 * s);
  g.fillStyle(0x7c8474, 1);
  g.fillEllipse(58 * s, 48 * s, 84 * s, 58 * s);
  g.fillStyle(0x5c6356, 1);
  g.fillEllipse(104 * s, 66 * s, 62 * s, 52 * s);
  // moss
  g.fillStyle(0x5c8a4e, 1);
  g.fillEllipse(70 * s, 28 * s, 74 * s, 26 * s);
  g.fillEllipse(102 * s, 38 * s, 40 * s, 16 * s);

  // Face around the mouth, darker so the opening reads as depth not paint.
  g.fillStyle(0x4c5246, 1);
  g.fillEllipse(75 * s, 78 * s, 66 * s, 52 * s);

  // The mouth itself — near-black arch, amber breathing at its floor.
  g.fillStyle(0x14100e, 1);
  g.fillRoundedRect(57 * s, 58 * s, 36 * s, 46 * s, { tl: 18 * s, tr: 18 * s, bl: 0, br: 0 });
  g.fillStyle(0xf4b942, 0.22);
  g.fillEllipse(75 * s, 100 * s, 26 * s, 10 * s);
  g.fillStyle(0xf4b942, 0.5);
  g.fillCircle(70 * s, 96 * s, 1.6 * s);
  g.fillCircle(80 * s, 92 * s, 1.3 * s);

  // Timber props: two posts and a lintel, the promise that people work here.
  g.fillStyle(0x6b4a2a, 1);
  g.fillRect(53 * s, 58 * s, 6 * s, 46 * s);
  g.fillRect(91 * s, 58 * s, 6 * s, 46 * s);
  g.fillRect(49 * s, 52 * s, 52 * s, 8 * s);
  g.fillStyle(0x54371d, 1);
  g.fillRect(49 * s, 58 * s, 52 * s, 2 * s);

  // Scree at the entrance.
  g.fillStyle(0x8a8f98, 1);
  g.fillEllipse(46 * s, 102 * s, 14 * s, 8 * s);
  g.fillEllipse(104 * s, 104 * s, 18 * s, 9 * s);
  g.fillStyle(0x777c85, 1);
  g.fillEllipse(112 * s, 100 * s, 10 * s, 6 * s);
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * The same earth, watered.
 *
 * A darker, cooler wash with sheen caught in the troughs. It matters that this
 * is a distinct texture rather than a tint: watering is a verb the player
 * spends a press on, and if the ground looks identical afterwards they have no
 * reason to believe anything happened.
 */
const soilWet: Painter = (g, s) => {
  soil(g, s);

  // Damp wash. Cool rather than merely dark — wet earth shifts toward green.
  g.fillStyle(0x2f3b28, 0.4);
  g.fillRoundedRect(3 * s, 2 * s, 58 * s, 57 * s, 8 * s);

  // Water sits in the troughs between ridges, so the sheen goes there.
  for (let i = 0; i < 4; i++) {
    const y = 17 + i * 11;
    g.fillStyle(0x9fe8ff, 0.14);
    g.fillRoundedRect(9 * s, y * s, 46 * s, 3 * s, 1.5 * s);
  }

  // A few darker soaked patches, so it is not a uniform filter.
  const patches: [number, number, number][] = [
    [20, 24, 7],
    [42, 36, 6],
    [28, 47, 5],
  ];
  for (const [cx, cy, r] of patches) {
    g.fillStyle(0x23301f, 0.28);
    g.fillCircle(cx * s, cy * s, r * s);
  }
};

/**
 * A watering can, held while pouring.
 *
 * Small and read from the side: body, spout angled down, handle over the top.
 * It exists so the pour has an object behind it — an arc of droplets with
 * nothing at its source reads as weather, not as work.
 */
const wateringCan: Painter = (g, s) => {
  // body
  g.fillStyle(0x5f6b74, 1);
  g.fillRoundedRect(2 * s, 8 * s, 18 * s, 14 * s, 3 * s);
  g.fillStyle(0x79868f, 1);
  g.fillRoundedRect(3 * s, 9 * s, 16 * s, 6 * s, 3 * s);
  // spout
  g.fillStyle(0x5f6b74, 1);
  g.fillTriangle(19 * s, 11 * s, 30 * s, 17 * s, 19 * s, 18 * s);
  g.fillStyle(0x8f9ba4, 1);
  g.fillRoundedRect(27 * s, 15 * s, 5 * s, 4 * s, 1.5 * s);
  // handle
  g.lineStyle(2.5 * s, 0x4a545c, 1);
  g.beginPath();
  g.arc(10 * s, 8 * s, 6 * s, Math.PI, 0);
  g.strokePath();
};

// ---------------------------------------------------------------------------
// Landmarks — the things a player builds
//
// Each one has to read at a glance from a distance, and read as *different*
// from every other silhouette already in the vale. That is the whole job: a
// farm that has been played for twenty hours must look unlike one played for
// two, from the minimap, in a screenshot, at a thumbnail size.
// ---------------------------------------------------------------------------

/** Flower beds: three rows of colour in a low border. */
const buildGarden: Painter = (g, s) => {
  g.fillStyle(0x6f5231, 1);
  g.fillRoundedRect(3 * s, 12 * s, 58 * s, 34 * s, 5 * s);
  g.fillStyle(0x7f6a44, 1);
  g.fillRoundedRect(5 * s, 14 * s, 54 * s, 30 * s, 4 * s);

  const colours = [0xe4574f, 0xf4b942, 0xd98cc8, 0x9fe8ff];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 6; i++) {
      const x = 10 + i * 9;
      const y = 20 + row * 9;
      g.fillStyle(0x3f7a3a, 1);
      g.fillRect((x - 0.6) * s, y * s, 1.4 * s, 6 * s);
      g.fillStyle(colours[(row + i) % colours.length]!, 1);
      g.fillCircle(x * s, y * s, 3 * s);
      g.fillStyle(0xfff3d0, 0.85);
      g.fillCircle(x * s, y * s, 1.1 * s);
    }
  }
};

/** A round stone well with a shingled roof on two posts. */
const buildWell: Painter = (g, s) => {
  g.fillStyle(0x5b4227, 0.35);
  g.fillEllipse(32 * s, 52 * s, 40 * s, 10 * s);
  // drum
  g.fillStyle(0x6b7079, 1);
  g.fillRoundedRect(16 * s, 30 * s, 32 * s, 20 * s, 4 * s);
  g.fillStyle(0x8a8f98, 1);
  g.fillRoundedRect(16 * s, 28 * s, 32 * s, 8 * s, 4 * s);
  g.fillStyle(0x14232b, 1);
  g.fillEllipse(32 * s, 32 * s, 24 * s, 7 * s);
  // posts and roof
  g.fillStyle(0x6b4a2f, 1);
  g.fillRect(19 * s, 12 * s, 3 * s, 20 * s);
  g.fillRect(42 * s, 12 * s, 3 * s, 20 * s);
  g.fillStyle(0x8f3529, 1);
  g.fillTriangle(32 * s, 2 * s, 10 * s, 16 * s, 54 * s, 16 * s);
  g.fillStyle(0xb5473a, 1);
  g.fillTriangle(32 * s, 4 * s, 13 * s, 16 * s, 51 * s, 16 * s);
};

/** Three hives, stacked boxes with a landing board. */
const buildBeehives: Painter = (g, s) => {
  // Boxes 14 wide at 13/32/51, not 18 wide at 14/32/50: at the old spacing the
  // three hives touched edge to edge and the whole thing read as one pale slab.
  const hive = (x: number, h: number) => {
    g.fillStyle(0x5b4227, 0.3);
    g.fillEllipse(x * s, 50 * s, 17 * s, 5 * s);
    for (let i = 0; i < h; i++) {
      const y = 46 - i * 9;
      g.fillStyle(i % 2 === 0 ? 0xf0e2c0 : 0xdccaa2, 1);
      g.fillRoundedRect((x - 7) * s, (y - 8) * s, 14 * s, 9 * s, 1.5 * s);
      g.fillStyle(0x8a663e, 0.55);
      g.fillRect((x - 7) * s, (y - 1) * s, 14 * s, 1.4 * s);
      // The entrance slot, so a box reads as a box and not as a block.
      g.fillStyle(0x3b2c18, 0.7);
      g.fillRect((x - 4) * s, (y - 3.4) * s, 8 * s, 1.6 * s);
    }
    g.fillStyle(0x6b4420, 1);
    g.fillTriangle(
      x * s,
      (46 - h * 9 - 4) * s,
      (x - 9) * s,
      (46 - h * 9 + 1) * s,
      (x + 9) * s,
      (46 - h * 9 + 1) * s,
    );
  };
  hive(13, 3);
  hive(32, 4);
  hive(51, 3);
  // a few bees
  g.fillStyle(0xf4b942, 0.9);
  for (const [bx, by] of [
    [22, 14],
    [40, 10],
    [46, 20],
  ] as [number, number][]) {
    g.fillCircle(bx * s, by * s, 1.6 * s);
  }
};

/** Five upright stones in a ring, older than the farm. */
const buildStones: Painter = (g, s) => {
  const stones: [number, number, number, number][] = [
    [10, 40, 9, 22],
    [24, 34, 8, 28],
    [39, 32, 9, 30],
    [52, 38, 8, 24],
    [31, 46, 7, 16],
  ];
  for (const [x, y, w, h] of stones) {
    g.fillStyle(0x4a4f57, 0.4);
    g.fillEllipse((x + w / 2) * s, (y + 3) * s, (w + 8) * s, 6 * s);
    g.fillStyle(0x6b7079, 1);
    g.fillRoundedRect(x * s, (y - h) * s, w * s, h * s, 2.5 * s);
    g.fillStyle(0xa8adb6, 1);
    g.fillRoundedRect(x * s, (y - h) * s, w * 0.45 * s, h * s, 2.5 * s);
  }
};

/** A tall grain silo with a domed cap. */
const buildSilo: Painter = (g, s) => {
  g.fillStyle(0x4a4f57, 0.35);
  g.fillEllipse(32 * s, 56 * s, 40 * s, 8 * s);
  g.fillStyle(0x8a8f98, 1);
  g.fillRoundedRect(18 * s, 14 * s, 28 * s, 42 * s, 4 * s);
  g.fillStyle(0xa8adb6, 1);
  g.fillRoundedRect(18 * s, 14 * s, 11 * s, 42 * s, 4 * s);
  // banding
  g.fillStyle(0x6b7079, 0.8);
  for (let i = 0; i < 4; i++) g.fillRect(18 * s, (22 + i * 9) * s, 28 * s, 1.6 * s);
  // cap
  g.fillStyle(0x8f3529, 1);
  g.fillEllipse(32 * s, 14 * s, 32 * s, 18 * s);
  g.fillStyle(0xb5473a, 1);
  g.fillEllipse(30 * s, 12 * s, 24 * s, 12 * s);
};

/** Timber tower with a stone base and a lit lantern at the top. */
const buildWatchtower: Painter = (g, s) => {
  g.fillStyle(0x4a4f57, 0.35);
  g.fillEllipse(32 * s, 58 * s, 38 * s, 8 * s);
  // stone base
  g.fillStyle(0x6b7079, 1);
  g.fillRoundedRect(20 * s, 42 * s, 24 * s, 16 * s, 3 * s);
  // timber legs, narrowing
  g.fillStyle(0x6b4a2f, 1);
  g.fillTriangle(22 * s, 42 * s, 27 * s, 42 * s, 29 * s, 18 * s);
  g.fillTriangle(42 * s, 42 * s, 37 * s, 42 * s, 35 * s, 18 * s);
  g.fillStyle(0x8b5a2b, 1);
  g.fillRect(24 * s, 32 * s, 16 * s, 2.5 * s);
  // platform and rail
  g.fillStyle(0x8b5a2b, 1);
  g.fillRoundedRect(20 * s, 14 * s, 24 * s, 5 * s, 1.5 * s);
  g.fillStyle(0x6b4a2f, 1);
  g.fillRect(21 * s, 9 * s, 2 * s, 6 * s);
  g.fillRect(41 * s, 9 * s, 2 * s, 6 * s);
  // roof and lantern
  g.fillStyle(0x8f3529, 1);
  g.fillTriangle(32 * s, 0 * s, 16 * s, 10 * s, 48 * s, 10 * s);
  g.fillStyle(0xf4d35e, 1);
  g.fillCircle(32 * s, 13 * s, 3 * s);
  g.fillStyle(0xfff3d0, 0.55);
  g.fillCircle(32 * s, 13 * s, 5.5 * s);
};

/** One enormous oak, wider and taller than any in the woods. */
const buildGreatOak: Painter = (g, s) => {
  g.fillStyle(0x224936, 0.35);
  g.fillEllipse(32 * s, 58 * s, 46 * s, 9 * s);
  g.fillStyle(0x4d3521, 1);
  g.fillRoundedRect(27 * s, 32 * s, 10 * s, 26 * s, 3 * s);
  g.fillStyle(0x6b4a2f, 1);
  g.fillRoundedRect(27 * s, 32 * s, 4 * s, 26 * s, 3 * s);
  // canopy: three overlapping masses, darkest at the back
  g.fillStyle(0x2f5e2c, 1);
  g.fillCircle(20 * s, 26 * s, 15 * s);
  g.fillCircle(45 * s, 25 * s, 14 * s);
  g.fillStyle(0x3f7a3a, 1);
  g.fillCircle(32 * s, 20 * s, 18 * s);
  g.fillStyle(0x57a44c, 1);
  g.fillCircle(26 * s, 15 * s, 9 * s);
  g.fillCircle(40 * s, 17 * s, 7 * s);
};

/** A pale stone dial on a plinth, with a gnomon that casts its own shadow. */
const buildSundial: Painter = (g, s) => {
  g.fillStyle(0x4a4f57, 0.35);
  g.fillEllipse(32 * s, 54 * s, 40 * s, 9 * s);
  // plinth
  g.fillStyle(0x8a8f98, 1);
  g.fillRoundedRect(24 * s, 30 * s, 16 * s, 22 * s, 3 * s);
  g.fillStyle(0xa8adb6, 1);
  g.fillRoundedRect(24 * s, 30 * s, 6 * s, 22 * s, 3 * s);
  // dial face
  g.fillStyle(0xdccaa2, 1);
  g.fillEllipse(32 * s, 28 * s, 40 * s, 14 * s);
  g.fillStyle(0xf0e2c0, 1);
  g.fillEllipse(32 * s, 27 * s, 34 * s, 11 * s);
  // hour marks
  g.fillStyle(0x6b7079, 0.9);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + (i / 7) * Math.PI;
    g.fillCircle((32 + Math.cos(a) * 14) * s, (27 + Math.sin(a) * 4.5) * s, 0.9 * s);
  }
  // gnomon
  g.fillStyle(0x5f6b74, 1);
  g.fillTriangle(32 * s, 10 * s, 32 * s, 27 * s, 44 * s, 27 * s);
};

/**
 * The Farmhouse — homestead tier 2. Same bones as the cottage, read at a
 * glance as "the same house, grown": a second storey with its own window row,
 * and a porch over the door.
 */
const houseFarmhouse: Painter = (g, s) => {
  shadow(g, s, 74, 146, 60);
  // walls, two storeys tall
  g.fillStyle(PALETTE.wall, 1);
  g.fillRoundedRect(20 * s, 46 * s, 108 * s, 98 * s, 4 * s);
  g.fillStyle(PALETTE.wallShade, 1);
  g.fillRect(20 * s, 112 * s, 108 * s, 32 * s);
  // storey line
  g.fillStyle(PALETTE.woodDark, 0.5);
  g.fillRect(20 * s, 92 * s, 108 * s, 2.5 * s);
  // roof
  g.fillStyle(PALETTE.roof, 1);
  g.fillPoints(
    [
      { x: 8 * s, y: 50 * s },
      { x: 74 * s, y: 8 * s },
      { x: 140 * s, y: 50 * s },
    ],
    true,
  );
  g.fillStyle(PALETTE.roofDark, 1);
  g.fillPoints(
    [
      { x: 74 * s, y: 8 * s },
      { x: 140 * s, y: 50 * s },
      { x: 122 * s, y: 50 * s },
      { x: 74 * s, y: 21 * s },
    ],
    true,
  );
  // chimney
  g.fillStyle(PALETTE.stoneDark, 1);
  g.fillRect(104 * s, 14 * s, 14 * s, 26 * s);
  // porch: two posts and a small canopy over the door
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRect(56 * s, 108 * s, 3.5 * s, 36 * s);
  g.fillRect(88 * s, 108 * s, 3.5 * s, 36 * s);
  g.fillStyle(PALETTE.roofLight, 1);
  g.fillRoundedRect(52 * s, 102 * s, 44 * s, 8 * s, 2 * s);
  // door
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRoundedRect(64 * s, 112 * s, 20 * s, 32 * s, 3 * s);
  g.fillStyle(PALETTE.amber, 1);
  g.fillCircle(80 * s, 129 * s, 2 * s);
  // windows, both storeys — the tiles that glow at night
  g.fillStyle(PALETTE.amber, 1);
  g.fillRoundedRect(30 * s, 116 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(100 * s, 116 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(32 * s, 62 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(65 * s, 62 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(98 * s, 62 * s, 18 * s, 16 * s, 2 * s);
  g.lineStyle(1.5 * s, PALETTE.woodDark, 1);
  g.strokeRoundedRect(30 * s, 116 * s, 18 * s, 16 * s, 2 * s);
  g.strokeRoundedRect(100 * s, 116 * s, 18 * s, 16 * s, 2 * s);
  g.strokeRoundedRect(32 * s, 62 * s, 18 * s, 16 * s, 2 * s);
  g.strokeRoundedRect(65 * s, 62 * s, 18 * s, 16 * s, 2 * s);
  g.strokeRoundedRect(98 * s, 62 * s, 18 * s, 16 * s, 2 * s);
};

/**
 * The Manor — homestead tier 3. The farmhouse plus a stone wing and a second
 * gable, with more window-glass than wall: at night it is the brightest thing
 * in the vale, which is the whole perk.
 */
const houseManor: Painter = (g, s) => {
  shadow(g, s, 86, 158, 74);
  // stone wing, left
  g.fillStyle(PALETTE.stone, 1);
  g.fillRoundedRect(6 * s, 76 * s, 48 * s, 80 * s, 4 * s);
  g.fillStyle(PALETTE.stoneDark, 1);
  g.fillRect(6 * s, 126 * s, 48 * s, 30 * s);
  g.fillStyle(PALETTE.roofDark, 1);
  g.fillPoints(
    [
      { x: 0 * s, y: 80 * s },
      { x: 30 * s, y: 54 * s },
      { x: 60 * s, y: 80 * s },
    ],
    true,
  );
  // main hall, two storeys
  g.fillStyle(PALETTE.wall, 1);
  g.fillRoundedRect(48 * s, 56 * s, 118 * s, 100 * s, 4 * s);
  g.fillStyle(PALETTE.wallShade, 1);
  g.fillRect(48 * s, 124 * s, 118 * s, 32 * s);
  g.fillStyle(PALETTE.woodDark, 0.5);
  g.fillRect(48 * s, 104 * s, 118 * s, 2.5 * s);
  // twin gables
  g.fillStyle(PALETTE.roof, 1);
  g.fillPoints(
    [
      { x: 40 * s, y: 60 * s },
      { x: 107 * s, y: 14 * s },
      { x: 174 * s, y: 60 * s },
    ],
    true,
  );
  g.fillStyle(PALETTE.roofDark, 1);
  g.fillPoints(
    [
      { x: 107 * s, y: 14 * s },
      { x: 174 * s, y: 60 * s },
      { x: 156 * s, y: 60 * s },
      { x: 107 * s, y: 27 * s },
    ],
    true,
  );
  g.fillStyle(PALETTE.roofLight, 1);
  g.fillPoints(
    [
      { x: 118 * s, y: 44 * s },
      { x: 140 * s, y: 26 * s },
      { x: 162 * s, y: 44 * s },
    ],
    true,
  );
  // chimneys
  g.fillStyle(PALETTE.stoneDark, 1);
  g.fillRect(64 * s, 22 * s, 13 * s, 26 * s);
  g.fillRect(144 * s, 18 * s, 13 * s, 24 * s);
  // door with fanlight
  g.fillStyle(PALETTE.woodDark, 1);
  g.fillRoundedRect(96 * s, 122 * s, 22 * s, 34 * s, 3 * s);
  g.fillStyle(PALETTE.amber, 1);
  g.fillCircle(107 * s, 120 * s, 6 * s);
  g.fillCircle(113 * s, 140 * s, 2 * s);
  // window glass everywhere — the manor burns gold at night
  g.fillStyle(PALETTE.amber, 1);
  g.fillRoundedRect(58 * s, 128 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(134 * s, 128 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(58 * s, 74 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(96 * s, 74 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(134 * s, 74 * s, 18 * s, 16 * s, 2 * s);
  g.fillRoundedRect(16 * s, 92 * s, 13 * s, 14 * s, 2 * s);
  g.fillRoundedRect(34 * s, 92 * s, 13 * s, 14 * s, 2 * s);
  g.lineStyle(1.5 * s, PALETTE.woodDark, 1);
  g.strokeRoundedRect(58 * s, 128 * s, 18 * s, 16 * s, 2 * s);
  g.strokeRoundedRect(134 * s, 128 * s, 18 * s, 16 * s, 2 * s);
  g.strokeRoundedRect(58 * s, 74 * s, 18 * s, 16 * s, 2 * s);
  g.strokeRoundedRect(96 * s, 74 * s, 18 * s, 16 * s, 2 * s);
  g.strokeRoundedRect(134 * s, 74 * s, 18 * s, 16 * s, 2 * s);
};

export const SPRITES: readonly SpriteDef[] = [
  { key: 'house', w: 136, h: 124, paint: house },
  { key: 'houseFarmhouse', w: 148, h: 150, paint: houseFarmhouse },
  { key: 'houseManor', w: 176, h: 162, paint: houseManor },
  { key: 'barn', w: 148, h: 132, paint: barn },
  { key: 'windmill', w: 96, h: 128, paint: windmill },
  { key: 'windmillBlades', w: 120, h: 120, paint: windmillBlades },
  { key: 'market', w: 120, h: 108, paint: market },
  { key: 'board', w: 80, h: 80, paint: board },
  { key: 'coop', w: 88, h: 76, paint: coop },
  { key: 'dockPlank', w: 64, h: 40, paint: dockPlank },
  { key: 'rowboat', w: 72, h: 40, paint: rowboat },
  { key: 'sign', w: 64, h: 58, paint: sign },
  { key: 'cave', w: 150, h: 110, paint: cave },
  { key: 'lamp', w: 28, h: 62, paint: lamp },
  { key: 'fenceH', w: 64, h: 28, paint: fenceH },
  { key: 'fenceV', w: 28, h: 64, paint: fenceV },
  { key: 'oak', w: 110, h: 120, paint: oak },
  { key: 'oakAutumn', w: 110, h: 120, paint: oakAutumn },
  { key: 'pine', w: 88, h: 120, paint: pine },
  { key: 'stump', w: 52, h: 36, paint: stump },
  { key: 'rock0', w: 64, h: 48, paint: rockAt(0) },
  { key: 'rock1', w: 64, h: 48, paint: rockAt(1) },
  { key: 'rock2', w: 64, h: 48, paint: rockAt(2) },
  { key: 'rock3', w: 64, h: 48, paint: rockAt(3) },
  { key: 'bush', w: 52, h: 42, paint: bush },
  { key: 'soil', w: 64, h: 64, paint: soil },
  { key: 'soilWet', w: 64, h: 64, paint: soilWet },
  // Landmarks. The zooms are not decoration: a pine is 88×120 and an oak
  // 110×120, so anything left at 1× is out-ranked by scenery the player did
  // not pay for. These are graded by price — the garden sits low in the grass,
  // the watchtower is the tallest thing anyone owns.
  { key: 'build_garden', w: 64, h: 52, paint: buildGarden, zoom: 1.5 },
  { key: 'build_well', w: 64, h: 58, paint: buildWell, zoom: 1.7 },
  { key: 'build_beehives', w: 64, h: 56, paint: buildBeehives, zoom: 1.6 },
  { key: 'build_stones', w: 64, h: 52, paint: buildStones, zoom: 2.1 },
  { key: 'build_silo', w: 64, h: 62, paint: buildSilo, zoom: 2.3 },
  { key: 'build_watchtower', w: 64, h: 62, paint: buildWatchtower, zoom: 2.6 },
  { key: 'build_greatoak', w: 64, h: 62, paint: buildGreatOak, zoom: 2.4 },
  { key: 'build_sundial', w: 64, h: 58, paint: buildSundial, zoom: 2.2 },
  { key: 'wateringCan', w: 34, h: 24, paint: wateringCan },
  { key: 'readyRing', w: 68, h: 68, paint: readyRing },
  { key: 'crow', w: 28, h: 24, paint: crow },
  { key: 'player', w: 40, h: 56, paint: player },
  { key: 'chicken', w: 34, h: 30, paint: chicken },
  { key: 'cow', w: 62, h: 44, paint: cow },
  { key: 'dog', w: 44, h: 32, paint: dog },
  { key: 'dogSit', w: 32, h: 34, paint: dogSit },
  { key: 'egg', w: 20, h: 20, paint: egg },
  // Crop growth stages, one texture per crop per stage.
  ...CROP_KEYS.flatMap((key) =>
    Array.from({ length: CROP_STAGES }, (_, stage) => ({
      key: cropTextureKey(key, stage),
      w: 64,
      h: 64,
      paint: cropPainter(key, stage),
    })),
  ),
];

/** Texture key for a rock at the given remaining hp (0–3). */
export const rockTextureKey = (hp: number): string =>
  `rock${Math.max(0, Math.min(3, Math.round(hp)))}`;

/**
 * Draws every sprite into the texture manager. Idempotent — a texture that
 * already exists (after a hot reload) is skipped.
 */
export function bakeSprites(scene: Phaser.Scene): void {
  for (const def of SPRITES) {
    if (scene.textures.exists(def.key)) continue;
    const zoom = def.zoom ?? 1;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    def.paint(g, TEX_SCALE * zoom);
    g.generateTexture(
      def.key,
      Math.ceil(def.w * zoom * TEX_SCALE),
      Math.ceil(def.h * zoom * TEX_SCALE),
    );
    g.destroy();
  }
}
