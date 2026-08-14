/**
 * AMBERVALE — world layout.
 *
 * Every fixed coordinate in the game lives here, in TILE units, so the client
 * (which draws them) and the server (which owns the entities standing on them)
 * cannot drift. Phase 2 seeds ResourceNode / Plot rows straight from the
 * INDEX → coordinate maps below.
 *
 * NOTE: the original prototype (docs/prototype/ambervale2.html) was not
 * available when this was written. The generator shape, path radius, chunk
 * size and landmark set follow the Phase 1 brief; the exact polyline and
 * building coordinates are a reconstruction. Reconcile against the prototype
 * when it lands — changing numbers here is enough, no logic depends on them.
 */

import { TILE } from './tuning';

/** Deterministic world seed. Same seed → same map, on every client. */
export const WORLD_SEED = 20260814;

/** Terrain is baked once into RenderTextures this many tiles across. */
export const CHUNK_TILES = 14;

/** Half-width of a carved dirt path, in tiles. */
export const PATH_RADIUS = 0.58;

export interface TileVec {
  x: number;
  y: number;
}

/** Tile coords → pixel centre. */
export const PX = (tx: number, ty: number): TileVec => ({
  x: tx * TILE + TILE / 2,
  y: ty * TILE + TILE / 2,
});

/** Where the player character stands on first load. */
export const SPAWN: TileVec = { x: 19, y: 19 };

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

export interface WaterBody {
  /** Centre in tiles. */
  cx: number;
  cy: number;
  /** Base radius in tiles, before noise perturbation. */
  r: number;
  /** How strongly fbm distorts the shoreline, in tiles. */
  wobble: number;
}

/** The east lake and the south pond. */
export const WATER: { lake: WaterBody; pond: WaterBody } = {
  lake: { cx: 46, cy: 13, r: 7.5, wobble: 1.9 },
  pond: { cx: 24, cy: 37, r: 4, wobble: 1.1 },
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Dirt paths are carved along these polylines with radius PATH_RADIUS. They
 * connect the hub landmarks so the player is always walking somewhere.
 */
export const PATHS: readonly (readonly TileVec[])[] = [
  // house → market, the main north-south spine
  [
    { x: 12, y: 16 },
    { x: 13, y: 19 },
    { x: 14, y: 23 },
    { x: 14, y: 27 },
  ],
  // spine → field entrance
  [
    { x: 13, y: 19 },
    { x: 16, y: 19 },
    { x: 19, y: 19 },
  ],
  // field → barn
  [
    { x: 19, y: 19 },
    { x: 23, y: 17 },
    { x: 26, y: 14 },
  ],
  // barn → windmill
  [
    { x: 26, y: 14 },
    { x: 30, y: 17 },
    { x: 32, y: 20 },
  ],
  // windmill → dock
  [
    { x: 32, y: 20 },
    { x: 35, y: 17 },
    { x: 38, y: 15 },
  ],
  // market → delivery board
  [
    { x: 14, y: 27 },
    { x: 18, y: 27 },
  ],
  // field → coop
  [
    { x: 19, y: 19 },
    { x: 23, y: 22 },
    { x: 25, y: 25 },
  ],
];

// ---------------------------------------------------------------------------
// Buildings and props
// ---------------------------------------------------------------------------

export type StructureKey =
  'house' | 'barn' | 'windmill' | 'market' | 'board' | 'coop' | 'dock' | 'rowboat' | 'sign';

export interface Structure {
  key: StructureKey;
  /** Anchor position in tiles (sprite origin is bottom-centre). */
  x: number;
  y: number;
  /** Axis-aligned solid box in tiles, relative to the anchor. Omit for walkable props. */
  solid?: { w: number; h: number; offY?: number };
}

export const STRUCTURES: readonly Structure[] = [
  { key: 'house', x: 11, y: 15, solid: { w: 4.2, h: 2.4 } },
  { key: 'barn', x: 27, y: 12, solid: { w: 4.6, h: 2.6 } },
  { key: 'windmill', x: 33, y: 21, solid: { w: 2.8, h: 2.2 } },
  { key: 'market', x: 13, y: 28, solid: { w: 3.8, h: 2.0 } },
  { key: 'board', x: 18, y: 28, solid: { w: 1.8, h: 0.9 } },
  { key: 'coop', x: 26, y: 26, solid: { w: 2.6, h: 1.8 } },
  // The dock reaches out over the lake; it is walkable, water underneath is not.
  { key: 'dock', x: 39, y: 15 },
  { key: 'rowboat', x: 42, y: 15 },
  { key: 'sign', x: 19, y: 14 },
];

export const structureAt = (key: StructureKey): Structure => {
  const s = STRUCTURES.find((it) => it.key === key);
  if (!s) throw new Error(`Unknown structure: ${key}`);
  return s;
};

/** Planks of the dock, walkable over water. */
export const DOCK_PLANKS: readonly TileVec[] = [
  { x: 39, y: 15 },
  { x: 40, y: 15 },
  { x: 41, y: 15 },
  { x: 42, y: 15 },
];

/** Warm point lights that switch on at dusk. */
export const LAMPS: readonly TileVec[] = [
  { x: 16, y: 19 },
  { x: 22, y: 19 },
  { x: 12, y: 24 },
  { x: 17, y: 28 },
];

/** Windows that glow at night: [x, y, radius in tiles]. */
export const WINDOW_LIGHTS: readonly { x: number; y: number; r: number }[] = [
  { x: 11, y: 14.2, r: 3.2 }, // house
  { x: 33, y: 19.6, r: 2.4 }, // windmill
  { x: 26, y: 25.4, r: 2.0 }, // coop
];

/** Fence segments around the base field, as tile-space rectangles. */
export const FENCES: readonly { x: number; y: number; w: number; h: number }[] = [
  // top run, split either side of the entrance at x = 19
  { x: 15.5, y: 19.6, w: 3.0, h: 0.2 },
  { x: 19.5, y: 19.6, w: 3.0, h: 0.2 },
  // bottom
  { x: 15.5, y: 26.4, w: 7.0, h: 0.2 },
  // sides
  { x: 15.5, y: 19.6, w: 0.2, h: 6.8 },
  { x: 22.3, y: 19.6, w: 0.2, h: 6.8 },
];

// ---------------------------------------------------------------------------
// Plots
// ---------------------------------------------------------------------------

export type PlotZone = 'base' | 'north' | 'east';

export interface PlotSlot {
  index: number;
  zone: PlotZone;
  x: number;
  y: number;
}

/**
 * Plot index → world coordinate. Indexes 0–8 are the fenced base field,
 * 9–14 the north meadow unlocked by EXPANSION_NORTH. The server stores only
 * the index; the client looks the position up here.
 */
export const PLOTS: readonly PlotSlot[] = [
  // base — 3×3 inside the fence
  { index: 0, zone: 'base', x: 17, y: 21 },
  { index: 1, zone: 'base', x: 19, y: 21 },
  { index: 2, zone: 'base', x: 21, y: 21 },
  { index: 3, zone: 'base', x: 17, y: 23 },
  { index: 4, zone: 'base', x: 19, y: 23 },
  { index: 5, zone: 'base', x: 21, y: 23 },
  { index: 6, zone: 'base', x: 17, y: 25 },
  { index: 7, zone: 'base', x: 19, y: 25 },
  { index: 8, zone: 'base', x: 21, y: 25 },
  // north meadow — 3×2, drawn as dashed ghost plots until unlocked
  { index: 9, zone: 'north', x: 17, y: 16 },
  { index: 10, zone: 'north', x: 19, y: 16 },
  { index: 11, zone: 'north', x: 21, y: 16 },
  { index: 12, zone: 'north', x: 17, y: 18 },
  { index: 13, zone: 'north', x: 19, y: 18 },
  { index: 14, zone: 'north', x: 21, y: 18 },

  // East meadow, bought after the north. Every tile here is plain grass and
  // clear of the coop's footprint and the lane that runs past it — checked
  // against the generated map rather than eyeballed.
  { index: 15, zone: 'east', x: 25, y: 20 },
  { index: 16, zone: 'east', x: 27, y: 20 },
  { index: 17, zone: 'east', x: 29, y: 20 },
  { index: 18, zone: 'east', x: 25, y: 22 },
  { index: 19, zone: 'east', x: 27, y: 22 },
  { index: 20, zone: 'east', x: 29, y: 22 },
];

export const BASE_PLOT_COUNT = PLOTS.filter((p) => p.zone === 'base').length;
export const NORTH_PLOT_COUNT = PLOTS.filter((p) => p.zone === 'north').length;
export const EAST_PLOT_COUNT = PLOTS.filter((p) => p.zone === 'east').length;

export const plotAt = (index: number): PlotSlot | undefined => PLOTS.find((p) => p.index === index);

/** Centre of the fenced field — the tutorial's "walk into the field" target. */
export const FIELD_CENTER: TileVec = { x: 19, y: 23 };

// ---------------------------------------------------------------------------
// Resource nodes
// ---------------------------------------------------------------------------

export interface NodeSlot {
  index: number;
  kind: 'oak' | 'rock';
  x: number;
  y: number;
}

/**
 * Node index → world coordinate. Oaks are 0–9, rocks 10–17, matching
 * NODES.oak.count and NODES.rock.count. Kept clear of water, paths and
 * building footprints.
 */
export const NODE_SLOTS: readonly NodeSlot[] = [
  { index: 0, kind: 'oak', x: 8, y: 9 },
  { index: 1, kind: 'oak', x: 6, y: 20 },
  { index: 2, kind: 'oak', x: 9, y: 31 },
  { index: 3, kind: 'oak', x: 17, y: 33 },
  { index: 4, kind: 'oak', x: 31, y: 31 },
  { index: 5, kind: 'oak', x: 34, y: 27 },
  { index: 6, kind: 'oak', x: 30, y: 8 },
  { index: 7, kind: 'oak', x: 22, y: 6 },
  { index: 8, kind: 'oak', x: 38, y: 25 },
  { index: 9, kind: 'oak', x: 44, y: 32 },
  { index: 10, kind: 'rock', x: 5, y: 14 },
  { index: 11, kind: 'rock', x: 11, y: 36 },
  { index: 12, kind: 'rock', x: 21, y: 10 },
  { index: 13, kind: 'rock', x: 35, y: 12 },
  { index: 14, kind: 'rock', x: 41, y: 29 },
  { index: 15, kind: 'rock', x: 29, y: 34 },
  { index: 16, kind: 'rock', x: 15, y: 7 },
  { index: 17, kind: 'rock', x: 48, y: 36 },
];

export const nodeSlotAt = (index: number): NodeSlot | undefined =>
  NODE_SLOTS.find((n) => n.index === index);

export const OAK_SLOTS = NODE_SLOTS.filter((n) => n.kind === 'oak');
export const ROCK_SLOTS = NODE_SLOTS.filter((n) => n.kind === 'rock');

// ---------------------------------------------------------------------------
// Animals
// ---------------------------------------------------------------------------

/** Rectangles (in tiles) the animals wander inside. */
export const PADDOCKS = {
  coop: { x: 24, y: 24, w: 4, h: 3 },
  cow: { x: 28, y: 11, w: 5, h: 4 },
} as const;

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

export interface Landmark {
  key: StructureKey;
  label: string;
  color: number;
}

export const LANDMARKS: readonly Landmark[] = [
  { key: 'house', label: 'Home', color: 0xf0c674 },
  { key: 'barn', label: 'Barn', color: 0xd0674a },
  { key: 'windmill', label: 'Windmill', color: 0xe8dcc0 },
  { key: 'market', label: 'Market', color: 0x6fd08c },
  { key: 'board', label: 'Deliveries', color: 0xf4b942 },
  { key: 'coop', label: 'Coop', color: 0xe0a05a },
  { key: 'dock', label: 'Dock', color: 0x7ec8e3 },
];

/** Minimap texture width in pixels; height follows the world aspect ratio. */
export const MINIMAP_WIDTH = 168;

// ---------------------------------------------------------------------------
// Cinematic title camera
// ---------------------------------------------------------------------------

export interface CineWaypoint {
  x: number;
  y: number;
  /** Seconds spent easing to this waypoint. */
  sec: number;
}

/** house → field → market → lake → windmill, eased, before the player starts. */
export const CINE: readonly CineWaypoint[] = [
  { x: 11, y: 15, sec: 7 },
  { x: 19, y: 22, sec: 7 },
  { x: 13, y: 28, sec: 7 },
  { x: 45, y: 13, sec: 7 },
  { x: 33, y: 21, sec: 7 },
];

/** Title camera sits slightly tighter than gameplay. */
export const CINE_ZOOM_SCALE = 0.86;

/** Gameplay zoom, from the viewport's short edge. */
export const baseZoom = (vw: number, vh: number): number =>
  Math.min(Math.max(Math.min(vw, vh) / 780, 0.62), 1.12);
