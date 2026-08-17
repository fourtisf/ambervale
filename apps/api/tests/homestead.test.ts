/**
 * The Homestead, the crow amnesty, and the streak mend.
 *
 * Three features about the same moment — coming back. Each test here asks
 * whether the protection actually protects: a tier purchase that a double
 * click buys twice, an amnesty that also forgives crops the player watched
 * die, or a mend that spends itself without saving the streak would all pass
 * a smoke test and still betray the player they exist for.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CROPS, CROWS, HOMESTEAD, dayIndex, homesteadGiftCoins } from '@ambervale/game-config';
import { endow, newPlayer, paced, sleep, withDb, type FarmLike } from './helpers';

/** The whole farm, freshly read. */
const farmOf = async (client: Awaited<ReturnType<typeof newPlayer>>['client']) =>
  (await client.call<FarmLike>('/farm')).body;

const T2 = HOMESTEAD.find((t) => t.tier === 2)!;
const T3 = HOMESTEAD.find((t) => t.tier === 3)!;

/** Longer than the 250ms action lock, so sequential raises test the rules. */
const UNLOCK = 400;

describe('the homestead', () => {
  it('starts as the cottage', async () => {
    const { farm } = await newPlayer();
    assert.equal(farm.homesteadTier, 1);
  });

  it('holds the door below the unlock level, however rich the player', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { coins: 999_999, items: { wood: 500, stone: 500 } });

    const res = await paced(() => client.call<{ error: string }>('/act/homestead', {}));
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'LEVEL_TOO_LOW');
  });

  it('checks every cost before spending any', async () => {
    const { client, farm } = await newPlayer();
    // Coins enough, wood absent: the refusal must leave the coins untouched.
    await endow(farm.user.id, { coins: T2.cost.coins, xp: 999_999 });

    const res = await paced(() => client.call<{ error: string }>('/act/homestead', {}));
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'INSUFFICIENT_ITEMS');

    const after = await farmOf(client);
    assert.equal(after.user.coins, T2.cost.coins, 'a refused raise must not charge');
    assert.equal(after.homesteadTier, 1);
  });

  it('raises the farmhouse for exactly the sticker price', async () => {
    const { client, farm } = await newPlayer();
    const renownBefore = farm.user.renown;
    await endow(farm.user.id, {
      coins: 50_000,
      xp: 999_999,
      items: { wood: T2.cost.wood!, stone: T2.cost.stone! },
    });

    const res = await paced(() =>
      client.call<{ homesteadTier: number; farm: FarmLike }>('/act/homestead', {}),
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.homesteadTier, 2);

    const after = res.body.farm;
    assert.equal(after.homesteadTier, 2);
    assert.equal(after.user.coins, 50_000 - T2.cost.coins);
    assert.equal(after.inventory['wood'] ?? 0, 0);
    assert.equal(after.inventory['stone'] ?? 0, 0);
    assert.equal(after.user.renown, renownBefore + T2.renown);
  });

  it('lets a double-click buy one storey, not two', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      coins: 50_000,
      xp: 999_999,
      items: { wood: 500, stone: 500 },
    });
    await sleep(UNLOCK);

    const [a, b] = await Promise.all([
      client.call<{ error?: string }>('/act/homestead', {}),
      client.call<{ error?: string }>('/act/homestead', {}),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], 'exactly one click may land');

    const after = await farmOf(client);
    assert.equal(after.homesteadTier, 2);
    // The real assertion. Even a broken guard can produce one 409 here (the
    // second raise would fail on missing $AMBER); a double charge cannot hide.
    assert.equal(after.user.coins, 50_000 - T2.cost.coins, 'two clicks must charge once');
  });

  it('tops out at the manor and says so', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      coins: 100_000,
      xp: 999_999,
      amber: T3.cost.amber!,
      items: { wood: 500, stone: 500 },
    });

    await paced(() => client.call('/act/homestead', {}));
    await sleep(UNLOCK);
    const up = await client.call<{ homesteadTier: number; farm: FarmLike }>('/act/homestead', {});
    assert.equal(up.status, 200);
    assert.equal(up.body.homesteadTier, 3);
    assert.equal(
      up.body.farm.user.amberBalance,
      0,
      'the manor must actually spend the $AMBER it asks for',
    );

    await sleep(UNLOCK);
    const past = await client.call<{ error: string }>('/act/homestead', {});
    assert.equal(past.status, 409);
    assert.equal(past.body.error, 'HOMESTEAD_MAX');
  });

  it('sizes the gift by absence, caps it at a day, and pays nothing to a cottage', async () => {
    assert.equal(homesteadGiftCoins(8 * 3_600_000, 1), 0, 'the cottage has no neighbour');
    const short = homesteadGiftCoins(1 * 3_600_000, 2);
    const day = homesteadGiftCoins(24 * 3_600_000, 2);
    const week = homesteadGiftCoins(7 * 24 * 3_600_000, 2);
    assert.ok(short > 0 && day > short, 'longer absence, warmer welcome');
    assert.equal(week, day, 'a week away must not out-earn a day');
    assert.equal(homesteadGiftCoins(3_600_000, 3), short * 2, 'the manor doubles it');
  });
});

describe('the crow amnesty', () => {
  it('spares a crop whose ruin fell while nobody was here', async () => {
    const { client, farm } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 0, cropKey: 'sunflower' }));

    // The crop ruined one minute ago; the player left ten minutes ago. The
    // ruin fell into the absence, so the amnesty owes them the crop back.
    const now = Date.now();
    const ruinLeadMs = CROPS.sunflower.growSec * 1000 + CROWS.graceMs + CROWS.ruinMs;
    await withDb(async (db) => {
      await db.plot.updateMany({
        where: { userId: farm.user.id, index: 0 },
        data: { plantedAt: new Date(now - ruinLeadMs - 60_000), fast: false },
      });
      await db.user.update({
        where: { id: farm.user.id },
        data: { lastSeenAt: new Date(now - 600_000) },
      });
    });

    const after = await farmOf(client);
    assert.ok(after.away, 'ten minutes away must produce a report');
    assert.equal(after.away!.cropsSpared, 1);
    assert.equal(after.away!.cropsRuined, 0);

    const plot = after.plots.find((p) => p.index === 0)!;
    assert.equal(plot.cropKey, 'sunflower', 'the spared crop is still standing');
    assert.ok(plot.readyAt! <= after.serverNow, 'and it is ready the moment they return');
    assert.equal(plot.crow, false, 'with the crow clock started afresh');
  });

  it('still takes a crop the player watched die', async () => {
    const { client, farm } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 1, cropKey: 'sunflower' }));

    // Ruined an hour ago; the player was still here five minutes ago — long
    // after the ruin. The amnesty covers absence, not neglect.
    const now = Date.now();
    const ruinLeadMs = CROPS.sunflower.growSec * 1000 + CROWS.graceMs + CROWS.ruinMs;
    await withDb(async (db) => {
      await db.plot.updateMany({
        where: { userId: farm.user.id, index: 1 },
        data: { plantedAt: new Date(now - ruinLeadMs - 3_600_000), fast: false },
      });
      await db.user.update({
        where: { id: farm.user.id },
        data: { lastSeenAt: new Date(now - 300_000) },
      });
    });

    const after = await farmOf(client);
    assert.ok(after.away, 'five minutes away must produce a report');
    assert.equal(after.away!.cropsSpared, 0);
    assert.equal(after.away!.cropsRuined, 1);
    assert.equal(after.plots.find((p) => p.index === 1)!.cropKey, null);
  });

  it('has the farmhouse neighbour leave coins on a long-enough return', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      coins: 50_000,
      xp: 999_999,
      items: { wood: 500, stone: 500 },
    });
    const raised = await paced(() => client.call('/act/homestead', {}));
    assert.equal(raised.status, 200);

    const before = await farmOf(client);
    await withDb(async (db) => {
      await db.user.update({
        where: { id: farm.user.id },
        data: { lastSeenAt: new Date(Date.now() - 2 * 3_600_000) },
      });
    });

    const after = await farmOf(client);
    assert.ok(after.away?.gift, 'two hours away from a farmhouse must be met with a gift');
    assert.ok(after.away!.gift!.coins > 0);
    assert.equal(after.user.coins, before.user.coins + after.away!.gift!.coins);
  });
});

describe('the streak mend', () => {
  it('spends a banked mend to carry the streak over one missed day', async () => {
    const { client, farm } = await newPlayer();
    await farmOf(client); // materialise the daily row

    const today = dayIndex(Date.now());
    await withDb(async (db) => {
      await db.dailyState.update({
        where: { userId: farm.user.id },
        data: { day: today - 2, streak: 7, mends: 1, lastCompleteDay: today - 2 },
      });
    });

    const after = await farmOf(client);
    assert.equal(after.daily.streak, 7, 'one missed day with a mend banked must not cost 7 days');

    const row = await withDb((db) =>
      db.dailyState.findUniqueOrThrow({ where: { userId: farm.user.id } }),
    );
    assert.equal(row.mends, 0, 'and the mend is spent doing it');
  });

  it('lets the streak die past a single missed day, keeping the mends', async () => {
    const { client, farm } = await newPlayer();
    await farmOf(client);

    const today = dayIndex(Date.now());
    await withDb(async (db) => {
      await db.dailyState.update({
        where: { userId: farm.user.id },
        data: { day: today - 5, streak: 7, mends: 2, lastCompleteDay: today - 5 },
      });
    });

    const after = await farmOf(client);
    assert.equal(after.daily.streak, 0, 'mends cover a slip, not a departure');

    const row = await withDb((db) =>
      db.dailyState.findUniqueOrThrow({ where: { userId: farm.user.id } }),
    );
    assert.equal(row.mends, 2, 'an unspendable mend must not be spent');
  });
});
