/**
 * The three mechanics that were supposed to make the minute worth playing.
 *
 * Each test here is really a question about whether the mechanic *bites*: a
 * market that sags but not enough to notice, a crow that never costs anything,
 * or a watering that saves no measurable time would all pass a smoke test and
 * still leave the game exactly as boring as it was.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUILDS,
  BUILD_KEYS,
  CROPS,
  NODE_SLOTS,
  PLOTS,
  STRUCTURES,
  WATER,
  DEMAND,
  SKIES,
  conditionsFor,
  sellPrice,
  type ItemKey,
  dailyPicks,
  CROWS,
  MARKET,
  decaySaturation,
  saleQuote,
  waterCutMs,
} from '@ambervale/game-config';
import { endow, newPlayer, paced, sleep, withDb, type FarmLike } from './helpers';

/** The whole farm, freshly read. */
const farmOf = async (client: Awaited<ReturnType<typeof newPlayer>>['client']) =>
  (await client.call<FarmLike>('/farm')).body;

describe('the market sags under supply', () => {
  it('pays less for the second identical sale than the first', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { items: { sunflower: 40 } });

    const first = await paced(() =>
      client.call<{ coinsGained: number; qtySold: number }>('/act/sell', {
        itemKey: 'sunflower',
        qty: 'all',
      }),
    );
    assert.equal(first.body.qtySold, 40);

    await endow(farm.user.id, { items: { sunflower: 40 } });
    const second = await paced(() =>
      client.call<{ coinsGained: number }>('/act/sell', { itemKey: 'sunflower', qty: 'all' }),
    );

    assert.ok(
      second.body.coinsGained < first.body.coinsGained,
      `flooding must cost something: ${first.body.coinsGained} then ${second.body.coinsGained}`,
    );
  });

  it('leaves other goods untouched, so a mixed field beats a monoculture', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { items: { sunflower: 60, carrot: 10 } });

    await paced(() => client.call('/act/sell', { itemKey: 'sunflower', qty: 'all' }));
    const after = await farmOf(client);

    const sun = after.prices.find((p) => p.itemKey === 'sunflower')!;
    const carrot = after.prices.find((p) => p.itemKey === 'carrot')!;

    assert.ok(sun.multiplier < 0.95, 'the flooded good must show it');
    assert.equal(carrot.multiplier, 1, 'an untouched good must still be at par');
  });

  it('never pays below the floor, however hard it is flooded', async () => {
    const { client, farm } = await newPlayer();

    for (let round = 0; round < 4; round++) {
      await endow(farm.user.id, { items: { sunflower: 200 } });
      await paced(() => client.call('/act/sell', { itemKey: 'sunflower', qty: 'all' }));
    }

    const after = await farmOf(client);
    const sun = after.prices.find((p) => p.itemKey === 'sunflower')!;
    assert.ok(sun.multiplier >= MARKET.floor - 1e-9, `floor breached: ${sun.multiplier}`);
    assert.ok(sun.price > 0, 'a good must never become literally worthless');
  });

  it('prices a bulk sale as the average over the sale, not the opening price', () => {
    // Otherwise one sale of a hundred beats a hundred sales of one, which
    // rewards exactly the flooding this exists to discourage. Checked below
    // the floor's reach, where the two must agree to the penny.
    const qty = 20;
    const bulk = saleQuote(0, qty).multiplier * qty;

    let piecemeal = 0;
    let saturation = 0;
    for (let i = 0; i < qty; i++) {
      const one = saleQuote(saturation, 1);
      piecemeal += one.multiplier;
      saturation = one.saturationAfter;
    }

    assert.ok(
      Math.abs(bulk - piecemeal) / piecemeal < 0.005,
      `bulk ${bulk.toFixed(3)} vs piecemeal ${piecemeal.toFixed(3)} must agree`,
    );
  });

  it('never pays a bonus for dumping, at any size', () => {
    // Once the floor binds the two stop being equal, because a floor applied
    // per sale is not the same as a floor applied to an average. The direction
    // is what matters: bulk must never come out ahead, or the mechanic would
    // reward the very behaviour it exists to discourage.
    for (const qty of [1, 5, 25, 100, 400]) {
      const bulk = saleQuote(0, qty).multiplier * qty;

      let piecemeal = 0;
      let saturation = 0;
      for (let i = 0; i < qty; i++) {
        const one = saleQuote(saturation, 1);
        piecemeal += one.multiplier;
        saturation = one.saturationAfter;
      }

      assert.ok(
        bulk <= piecemeal * 1.0001,
        `dumping ${qty} paid ${bulk.toFixed(2)} vs ${piecemeal.toFixed(2)} piecemeal`,
      );
    }
  });

  it('recovers on its own, from a timestamp rather than a scheduler', () => {
    const halved = decaySaturation(1, MARKET.halfLifeMs);
    assert.ok(Math.abs(halved - 0.5) < 1e-6, `expected 0.5, got ${halved}`);
    assert.equal(decaySaturation(1, MARKET.halfLifeMs * 20), 0, 'must settle at exactly par');
  });
});

describe('crows', () => {
  it('are not on a freshly planted crop', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 0, cropKey: 'sunflower' }));

    const farm = await farmOf(client);
    const plot = farm.plots.find((p) => p.index === 0)!;
    assert.equal(plot.crow, false);
    assert.ok(plot.crowAt !== null, 'the client needs to know one is coming');
    assert.ok(plot.crowAt! > plot.readyAt!, 'a crow must never beat the crop to ready');
  });

  it('lands only after the grace, and the grace outlasts the crop', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 1, cropKey: 'sunflower' }));

    const farm = await farmOf(client);
    const plot = farm.plots.find((p) => p.index === 1)!;
    const graceAfterReady = plot.crowAt! - plot.readyAt!;

    assert.equal(graceAfterReady, CROWS.graceMs);
    assert.ok(
      CROWS.ruinMs > CROPS.starglow.growSec * 1000,
      'the ruin window must exceed the longest crop, or playing normally loses crops',
    );
  });

  it('a shoo pushes the crow back and is worth doing early', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 2, cropKey: 'sunflower' }));

    const before = (await farmOf(client)).plots.find((p) => p.index === 2)!;
    const res = await paced(() => client.call<{ hadCrow: boolean }>('/act/shoo', { plotIndex: 2 }));
    assert.equal(res.status, 200);
    assert.equal(res.body.hadCrow, false, 'no crow had landed yet');

    const after = (await farmOf(client)).plots.find((p) => p.index === 2)!;
    assert.ok(
      after.crowAt! > before.crowAt!,
      'guarding a plot before the crop is ready must still count',
    );
  });

  it('pays no XP for shooing an empty sky', async () => {
    const { client, farm } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 3, cropKey: 'sunflower' }));

    const before = (await farmOf(client)).user.xp;
    await paced(() => client.call('/act/shoo', { plotIndex: 3 }));
    const after = (await farmOf(client)).user.xp;

    assert.equal(after, before, 'an empty field must not be an XP button');
    void farm;
  });

  it('destroys a crop left under a crow past the ruin window', async () => {
    const { client, farm } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 4, cropKey: 'sunflower' }));

    // Reaching into the clock rather than waiting ten minutes. The rule under
    // test is "ruin is derived from timestamps", so moving the timestamp is
    // the honest way to exercise it.
    await withDb(async (db) => {
      const long = new Date(Date.now() - CROWS.ruinMs - CROWS.graceMs - 60_000);
      await db.plot.updateMany({
        where: { userId: farm.user.id, index: 4 },
        data: { plantedAt: long },
      });
    });

    const after = await farmOf(client);
    const plot = after.plots.find((p) => p.index === 4)!;
    assert.equal(plot.cropKey, null, 'the crop should be gone');
    assert.equal(plot.crow, false);
  });

  it('leaves a ruined plot plantable again, without a farm read first', async () => {
    // The bug this pins down cost a plot permanently. A ruined crop is hidden
    // from the client the moment it is ruined, but the row survived until
    // `GET /farm` cleared it — and every action reply carries its own farm, so
    // a player could go a long time without one. In between, the plot showed
    // as bare earth, offered to be planted, and answered PLOT_OCCUPIED.
    const { client, farm } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 7, cropKey: 'sunflower' }));

    await withDb(async (db) => {
      const long = new Date(Date.now() - CROWS.ruinMs - CROWS.graceMs - 60_000);
      await db.plot.updateMany({
        where: { userId: farm.user.id, index: 7 },
        data: { plantedAt: long, fast: false },
      });
    });

    // Deliberately no /farm call here: that is what used to do the clearing,
    // and going through it would test the workaround instead of the rule.
    const res = await paced(() =>
      client.call<{ error?: string }>('/act/plant', { plotIndex: 7, cropKey: 'sunflower' }),
    );
    assert.equal(res.status, 200, `planting on ruined ground failed: ${res.body.error}`);

    const after = await farmOf(client);
    const plot = after.plots.find((p) => p.index === 7)!;
    assert.equal(plot.cropKey, 'sunflower', 'the new crop should be in the ground');
    assert.ok(plot.readyAt !== null && plot.readyAt > Date.now(), 'and it should be growing');
  });

  it('still refuses to plant on a crop that is merely growing', async () => {
    // The other half of the rule above: "occupied" must keep meaning occupied.
    const { client } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 8, cropKey: 'sunflower' }));
    const res = await paced(() =>
      client.call<{ error: string }>('/act/plant', { plotIndex: 8, cropKey: 'sunflower' }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'PLOT_OCCUPIED');
  });

  it('halves the XP of a crop harvested from under a crow', async () => {
    const { client, farm } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 5, cropKey: 'sunflower' }));

    // Ready, and sat there long enough for a crow — but not long enough to ruin.
    await withDb(async (db) => {
      const when = new Date(Date.now() - CROPS.sunflower.growSec * 1000 - CROWS.graceMs - 5000);
      await db.plot.updateMany({
        where: { userId: farm.user.id, index: 5 },
        data: { plantedAt: when, fast: false },
      });
    });

    const res = await paced(() =>
      client.call<{ xp: number; pecked: boolean }>('/act/harvest', { plotIndex: 5 }),
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.pecked, true);
    assert.ok(
      res.body.xp < CROPS.sunflower.xp,
      `pecked harvest paid full XP (${res.body.xp}), so the crow costs nothing`,
    );
  });
});

describe('watering', () => {
  it('brings a crop forward, and only once', async () => {
    const { client } = await newPlayer();
    // Sunflower, not carrot: a fresh player is level 1 and carrot unlocks at 2.
    await paced(() => client.call('/act/plant', { plotIndex: 6, cropKey: 'sunflower' }));

    const before = (await farmOf(client)).plots.find((p) => p.index === 6)!;
    const res = await paced(() => client.call<{ cutMs: number }>('/act/water', { plotIndex: 6 }));
    assert.equal(res.status, 200);
    assert.ok(res.body.cutMs > 0);

    const after = (await farmOf(client)).plots.find((p) => p.index === 6)!;
    assert.ok(after.readyAt! < before.readyAt!, 'watering must actually move the clock');
    assert.equal(after.watered, true);

    const again = await paced(() => client.call('/act/water', { plotIndex: 6 }));
    assert.equal(again.status, 409, 'a second watering must be refused');
  });

  it('is worth more the earlier it is done', () => {
    const now = 0;
    const early = waterCutMs(now, 100_000);
    const late = waterCutMs(now, 10_000);
    assert.ok(early > late, 'the cut must scale with what is left, or there is no decision');
  });

  it('refuses a plot that is already ready', async () => {
    const { client, farm } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 7, cropKey: 'sunflower' }));
    await withDb(async (db) => {
      await db.plot.updateMany({
        where: { userId: farm.user.id, index: 7 },
        data: { plantedAt: new Date(Date.now() - 10 * 60 * 1000), fast: false },
      });
    });

    const res = await paced(() => client.call('/act/water', { plotIndex: 7 }));
    assert.equal(res.status, 409);
  });

  it('cannot be carried across a replanting', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 8, cropKey: 'sunflower' }));
    await paced(() => client.call('/act/water', { plotIndex: 8 }));

    // Let it come ready and take it, then plant again.
    await sleep(CROPS.sunflower.growSec * 1000 * 0.75 + 500);
    const harvested = await paced(() => client.call('/act/harvest', { plotIndex: 8 }));
    assert.equal(harvested.status, 200);

    await paced(() => client.call('/act/plant', { plotIndex: 8, cropKey: 'sunflower' }));
    const fresh = (await farmOf(client)).plots.find((p) => p.index === 8)!;
    assert.equal(fresh.watered, false, 'the new crop must be waterable');
  });
});

describe('daily goals', () => {
  it('hands a new farmer ten goals they can all actually do', async () => {
    const { client } = await newPlayer();
    const farm = await farmOf(client);

    assert.equal(farm.daily.goals.length, 10, 'a day should be a plan, not a formality');

    // Every goal must be one a level-1 player can attempt today. The pool
    // gates fishing, crafting and deliveries behind the rod, the mill and
    // reputation — a goal you are locked out of is worse than no goal.
    const locked = farm.daily.goals.filter((g) => /fish|mill|delivery|upgrade/i.test(g.text));
    assert.deepEqual(
      locked,
      [],
      `a level-1 farmer was given locked work: ${JSON.stringify(locked)}`,
    );
  });

  it('never asks for the same activity twice in one day', async () => {
    // The pool holds a small and a large version of most jobs, and handing out
    // both spends two of the ten slots on one errand — finishing the larger
    // completes the smaller for free.
    for (const level of [1, 3, 5, 9]) {
      const picks = dailyPicks(20400, level);
      const counters = picks.map((p) => p.counter);
      assert.equal(
        new Set(counters).size,
        counters.length,
        `level ${level} drew the same counter twice: ${counters.join(', ')}`,
      );
      assert.equal(picks.length, 10, `level ${level} drew ${picks.length} goals`);
    }
  });

  it('pays a watered crop into its own counter', async () => {
    const { client, farm } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 2, cropKey: 'sunflower' }));
    const before = (await farmOf(client)).user.counters['wateredCount'] ?? 0;

    const res = await paced(() => client.call('/act/water', { plotIndex: 2 }));
    assert.equal(res.status, 200);

    const after = (await farmOf(client)).user.counters['wateredCount'] ?? 0;
    assert.equal(after, before + 1, 'watering must count, or no goal can ever ask for it');
    assert.ok(farm.user.id);
  });
});

describe('building the vale', () => {
  it('refuses a landmark the player cannot afford, and charges exactly once', async () => {
    const { client, farm } = await newPlayer();

    // Level gate first: a fresh farmer is nowhere near.
    const early = await paced(() =>
      client.call<{ error: string }>('/act/build', { key: 'garden' }),
    );
    assert.equal(early.status, 409);
    assert.equal(early.body.error, 'LEVEL_TOO_LOW');

    // Level, but no materials.
    await endow(farm.user.id, { xp: 99999, coins: 10 });
    const poor = await paced(() => client.call<{ error: string }>('/act/build', { key: 'garden' }));
    assert.equal(poor.status, 409);
    assert.equal(poor.body.error, 'INSUFFICIENT_COINS');

    // Now afford it exactly.
    await endow(farm.user.id, { coins: 600, items: { wood: 8 } });
    const built = await paced(() =>
      client.call<{ built: string; farm: FarmLike }>('/act/build', { key: 'garden' }),
    );
    assert.equal(built.status, 200, JSON.stringify(built.body));
    assert.equal(built.body.built, 'garden');

    const after = await farmOf(client);
    assert.equal(after.user.coins, 0, 'the coins must actually be spent');
    assert.equal(after.inventory['wood'] ?? 0, 0, 'and the wood with them');
    assert.equal(after.user.renown, BUILDS.garden.renown, 'building it is what earns the rank');
    assert.ok(
      after.builds.some((b) => b.key === 'garden'),
      'the farm state must carry it, or the world cannot draw it',
    );

    // And it cannot be built twice, however hard someone tries.
    await endow(farm.user.id, { coins: 600, items: { wood: 8 } });
    const again = await paced(() =>
      client.call<{ error: string }>('/act/build', { key: 'garden' }),
    );
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'ALREADY_BUILT');
    assert.equal((await farmOf(client)).user.coins, 600, 'a refused build must charge nothing');
  });

  it('stands somewhere that is not already occupied', () => {
    // A landmark dropped on a plot, a tree or the lake would be a bug nobody
    // sees until they walk into it, so the positions are checked here instead.
    const taken = new Set<string>();
    for (const p of PLOTS) taken.add(`${p.x},${p.y}`);
    for (const n of NODE_SLOTS) taken.add(`${n.x},${n.y}`);
    for (const s of STRUCTURES) {
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) taken.add(`${s.x + i},${s.y + j}`);
      }
    }

    for (const key of BUILD_KEYS) {
      const { at, name } = BUILDS[key];
      assert.ok(!taken.has(`${at.x},${at.y}`), `${name} stands on something at ${at.x},${at.y}`);
      for (const water of Object.values(WATER)) {
        const d = Math.hypot(at.x - water.cx, at.y - water.cy);
        assert.ok(d > water.r + water.wobble, `${name} stands in the water`);
      }
    }
  });
});

describe("today's conditions", () => {
  it('pays the day’s demand, and carries it on the price list', async () => {
    const { client, farm } = await newPlayer();
    const today = conditionsFor(Date.now());
    const sought = today.market.sought;
    // A good today is indifferent to, as the control. Wood and stone are never
    // drawn (see TRADED), so one of them is always neutral.
    const neutral = 'wood';

    // The sought good is drawn from the whole traded list, so this test has to
    // work for whatever today happens to want — including a crafted good it
    // would take an hour of play to make. Endowing sidesteps that.
    // Twenty of each, not one. Wood sells for 5, and Math.round on a 5-coin
    // sale swallows up to 7% — enough to make the ratio below read 2.16x for a
    // multiplier that is exactly 2. Twenty units puts rounding under 1%.
    const QTY = 20;
    await endow(farm.user.id, { items: { [sought]: QTY, [neutral]: QTY } });

    const before = await farmOf(client);
    const quoted = before.prices.find((p) => p.itemKey === sought)!;
    assert.equal(
      quoted.demand,
      SKIES[today.sky].sell * DEMAND.soughtMul,
      'the price list must carry the day’s multiplier',
    );

    const soughtSale = await paced(() =>
      client.call<{ coinsGained: number }>('/act/sell', { itemKey: sought, qty: 'all' }),
    );
    const neutralSale = await paced(() =>
      client.call<{ coinsGained: number }>('/act/sell', { itemKey: neutral, qty: 'all' }),
    );

    // Compared as a ratio against a neutral good rather than against the
    // quoted price. A sale is charged at the *average* multiplier across
    // itself, which sits under the spot price the list shows even for a single
    // unit — so quote and payment are never equal by design. Both
    // goods start at zero saturation and sell the same quantity, so that
    // averaging factor is identical on both sides and divides out, leaving
    // demand alone.
    const soughtPer = soughtSale.body.coinsGained / sellPrice(sought as ItemKey);
    const neutralPer = neutralSale.body.coinsGained / sellPrice(neutral);
    const ratio = soughtPer / neutralPer;

    assert.ok(
      Math.abs(ratio - DEMAND.soughtMul) < 0.05,
      `a sought good must pay ${DEMAND.soughtMul}x a neutral one, paid ${ratio.toFixed(3)}x`,
    );
  });

  it('marks a glutted good down, and never marks the same good both ways', async () => {
    const { client } = await newPlayer();
    const today = conditionsFor(Date.now());
    assert.notEqual(today.market.sought, today.market.glut);

    const farm = await farmOf(client);
    const glut = farm.prices.find((p) => p.itemKey === today.market.glut)!;
    assert.equal(glut.demand, SKIES[today.sky].sell * DEMAND.glutMul);
    assert.ok(glut.price < glut.base, 'a glutted good must visibly pay less than list');
  });

  it('never lets the sky drag a finished crop back to unfinished', () => {
    // Growth is recomputed from plantedAt on every read, so a sky multiplier
    // above 1 would un-ready a harvest at midnight. This is the guard.
    for (const key of Object.keys(SKIES) as (keyof typeof SKIES)[]) {
      assert.ok(
        SKIES[key].growth <= 1,
        `sky "${key}" slows growth (${SKIES[key].growth}), which reaches backwards`,
      );
    }
  });
});
