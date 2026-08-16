/**
 * Things a player can build, that stay built.
 *
 * The economy had one hour of things to want in it. Every upgrade tier and
 * both meadows come to 14,450 coins, and a mid-game farm earns around 13,000
 * an hour — so by the third evening coins bought nothing, and the only sink
 * left was a title beside your name.
 *
 * That is the gap these fill. Not a multiplier and not a label: a thing that
 * appears in the vale and is still there tomorrow. A farm at hour twenty and a
 * farm at hour two used to be pixel-identical, which is why the fourth hour
 * felt empty however much "content" remained, and why no two players ever had
 * a different screenshot to post.
 *
 * Positions are fixed, and chosen from ground that is provably clear of every
 * plot, node, paddock, structure and shoreline. Letting players place them
 * freely is the better game and a much larger one — it needs a placement
 * cursor, collision rules, and a migration for every farm already built. This
 * ships the payoff first.
 */

import type { TileVec } from './world';

export type BuildKey =
  'garden' | 'well' | 'beehives' | 'stones' | 'silo' | 'watchtower' | 'greatoak' | 'sundial';

export interface BuildDef {
  name: string;
  /** One line in the panel. Says what it is, not what it does — it does nothing. */
  blurb: string;
  /** Where it stands. See the module comment: clear ground, verified. */
  at: TileVec;
  unlockLv: number;
  cost: { coins: number; amber?: number; wood?: number; stone?: number };
  /** Renown earned for building it, so the title ladder is a record of work. */
  renown: number;
  /** Drawn on the minimap too, with this label. */
  landmark?: string;
}

export const BUILDS: Record<BuildKey, BuildDef> = {
  garden: {
    name: 'Flower Garden',
    blurb: 'Colour by the house, for no reason but that you wanted it there.',
    at: { x: 11, y: 21 },
    unlockLv: 3,
    cost: { coins: 600, wood: 8 },
    renown: 1,
  },
  well: {
    name: 'Stone Well',
    blurb: 'A deep well in the west meadow, with a bucket that still works.',
    at: { x: 4, y: 24 },
    unlockLv: 4,
    cost: { coins: 1200, stone: 20 },
    renown: 2,
  },
  beehives: {
    name: 'Beehives',
    blurb: 'Three white boxes at the treeline, and the noise they make.',
    at: { x: 11, y: 4 },
    unlockLv: 5,
    cost: { coins: 2200, wood: 30 },
    renown: 3,
  },
  stones: {
    name: 'Standing Stones',
    blurb: 'Older than the farm. Nobody knows who set them in the meadow.',
    at: { x: 26, y: 4 },
    unlockLv: 6,
    cost: { coins: 3600, stone: 45 },
    renown: 4,
    landmark: 'Stones',
  },
  silo: {
    name: 'Grain Silo',
    blurb: 'It holds nothing you own. It is simply a silo, and it is yours.',
    at: { x: 33, y: 4 },
    unlockLv: 7,
    cost: { coins: 5200, wood: 40, stone: 30 },
    renown: 5,
    landmark: 'Silo',
  },
  watchtower: {
    name: 'Watchtower',
    blurb: 'Timber and stone on the east ridge, lit at night.',
    at: { x: 45, y: 26 },
    unlockLv: 8,
    cost: { coins: 7000, amber: 4, wood: 60, stone: 40 },
    renown: 7,
    landmark: 'Tower',
  },
  greatoak: {
    name: 'The Great Oak',
    blurb: 'Planted deliberately, in the one place a tree was missing.',
    at: { x: 33, y: 35 },
    unlockLv: 9,
    cost: { coins: 9000, amber: 6, wood: 20 },
    renown: 9,
    landmark: 'Great Oak',
  },
  sundial: {
    name: 'Sundial',
    blurb: 'Cut from pale stone. It keeps the same time as the sky above it.',
    at: { x: 39, y: 39 },
    unlockLv: 10,
    cost: { coins: 12000, amber: 10, stone: 60 },
    renown: 12,
    landmark: 'Sundial',
  },
};

export const BUILD_KEYS = Object.keys(BUILDS) as BuildKey[];

export const isBuildKey = (key: string): key is BuildKey =>
  Object.prototype.hasOwnProperty.call(BUILDS, key);

/** Everything the whole set costs, for balancing against income. */
export const BUILD_TOTALS = BUILD_KEYS.reduce(
  (total, key) => {
    const c = BUILDS[key].cost;
    return {
      coins: total.coins + c.coins,
      amber: total.amber + (c.amber ?? 0),
      wood: total.wood + (c.wood ?? 0),
      stone: total.stone + (c.stone ?? 0),
      renown: total.renown + BUILDS[key].renown,
    };
  },
  { coins: 0, amber: 0, wood: 0, stone: 0, renown: 0 },
);
