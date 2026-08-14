/**
 * The spending half of the economy.
 *
 * Sinks are where duplication bugs cost the most: an upgrade that charges once
 * but applies twice, or a craft that consumes nothing, mints value just as
 * surely as a broken payout does. Every test here is a property that must hold
 * for the ledger to stay honest.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CROPS,
  DAILY,
  RECIPES,
  UPGRADES,
  dailyPicks,
  dayIndex,
  sellPrice,
} from '@ambervale/game-config';
import { endow, newPlayer, paced, sleep, withDb, type FarmLike } from './helpers';

const farmOf = async (client: { call: <T>(p: string) => Promise<{ body: T }> }) =>
  (await client.call<FarmLike>('/farm')).body;

describe('upgrades', () => {
  it('refuses a purchase the player cannot afford, and names what is missing', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 100000, coins: 0 });

    const res = await paced(() =>
      client.call<{ error: string; missing: Record<string, { have: number; need: number }> }>(
        '/act/upgrade',
        { key: 'axe' },
      ),
    );

    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'INSUFFICIENT_ITEMS');
    assert.equal(res.body.missing['coins']!.need, UPGRADES.axe.tiers[0]!.cost.coins);
  });

  it('charges coins exactly once and raises the tier', async () => {
    const { client, farm } = await newPlayer();
    const cost = UPGRADES.axe.tiers[0]!.cost.coins!;
    await endow(farm.user.id, { xp: 100000, coins: cost + 500 });

    const res = await paced(() => client.call<{ farm: FarmLike }>('/act/upgrade', { key: 'axe' }));
    assert.equal(res.status, 200);

    assert.equal(res.body.farm.upgrades['axe'], 1);
    assert.equal(res.body.farm.user.coins, 500);
    assert.equal(res.body.farm.effects.axeBonus, 1);
  });

  it('spends $AMBER as a negative ledger row, never a rewritten balance', async () => {
    const { client, farm } = await newPlayer();
    const tier2 = UPGRADES.axe.tiers[1]!.cost;
    await endow(farm.user.id, {
      xp: 100000,
      coins: UPGRADES.axe.tiers[0]!.cost.coins! + tier2.coins!,
      amber: 40,
      upgrades: {},
    });

    await paced(() => client.call('/act/upgrade', { key: 'axe' }));
    const after = await paced(() =>
      client.call<{ farm: FarmLike }>('/act/upgrade', { key: 'axe' }),
    );

    assert.equal(after.status, 200);
    assert.equal(after.body.farm.upgrades['axe'], 2);
    assert.equal(after.body.farm.user.amberBalance, 40 - tier2.amber!);

    // The balance must be the sum of its history, including the negative row.
    const rows = await withDb((db) =>
      db.amberLedger.findMany({ where: { userId: farm.user.id }, orderBy: { createdAt: 'asc' } }),
    );
    const spend = rows.filter((r) => r.reason === 'upgrade');
    assert.equal(spend.length, 1);
    assert.equal(spend[0]!.delta, -tier2.amber!);
    assert.equal(
      rows.reduce((sum, r) => sum + r.delta, 0),
      after.body.farm.user.amberBalance,
    );
  });

  it('refuses to spend $AMBER the player does not have', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      xp: 100000,
      coins: 100000,
      amber: 1,
      upgrades: { axe: 1 },
    });

    const res = await paced(() =>
      client.call<{ error: string; missing: Record<string, unknown> }>('/act/upgrade', {
        key: 'axe',
      }),
    );

    assert.equal(res.status, 409);
    assert.ok(res.body.missing['amber'], 'the shortfall should name amber');

    const balance = (await farmOf(client)).user.amberBalance;
    assert.equal(balance, 1, 'a refused purchase must not move the balance');
  });

  it('cannot be double-submitted into two tiers for one price', async () => {
    const { client, farm } = await newPlayer();
    const cost = UPGRADES.axe.tiers[0]!.cost.coins!;
    // Enough for exactly one tier, so a double-apply would show up as a tier 2
    // the player never paid for.
    await endow(farm.user.id, { xp: 100000, coins: cost });

    await sleep(300);
    const [a, b] = await Promise.all([
      client.call('/act/upgrade', { key: 'axe' }),
      client.call('/act/upgrade', { key: 'axe' }),
    ]);

    const ok = [a, b].filter((r) => r.status === 200);
    assert.equal(ok.length, 1, 'exactly one of the two must win');

    const after = await farmOf(client);
    assert.equal(after.upgrades['axe'], 1);
    assert.equal(after.user.coins, 0);
  });

  it('stops at the top tier', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      xp: 100000,
      coins: 100000,
      amber: 500,
      upgrades: { rod: UPGRADES.rod.tiers.length },
    });

    const res = await paced(() => client.call<{ error: string }>('/act/upgrade', { key: 'rod' }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'MAX_TIER');
  });

  it('applies the root cellar to market prices but not to $AMBER', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      xp: 100000,
      coins: 0,
      items: { wood: 10 },
      upgrades: { cellar: 1 },
    });

    const res = await paced(() =>
      client.call<{ farm: FarmLike; coinsGained: number }>('/act/sell', {
        itemKey: 'wood',
        qty: 'all',
      }),
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.coinsGained, Math.round(sellPrice('wood') * 10 * 1.05));
    assert.equal(res.body.farm.user.amberBalance, 0);
  });

  it('shortens grow times with the well, and the harvest gate agrees', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 100000, coins: 0, upgrades: { well: 3 } });

    // Burn the accelerated first crop so the multiplier is what is being tested.
    await paced(() => client.call('/act/plant', { plotIndex: 0, cropKey: 'sunflower' }));
    await sleep(1200);

    const before = await farmOf(client);
    assert.equal(before.effects.growth, 0.75);

    await paced(() => client.call('/act/plant', { plotIndex: 1, cropKey: 'sunflower' }));
    const after = await farmOf(client);
    const plot = after.plots.find((p) => p.index === 1)!;

    // 30s base at 0.75 is 22.5s, which must be what the client is told.
    const grow = plot.readyAt! - plot.plantedAt!;
    assert.equal(grow, 22_500);

    // And the server must refuse a harvest before its own number, not the base.
    const early = await paced(() =>
      client.call<{ error: string }>('/act/harvest', { plotIndex: 1 }),
    );
    assert.equal(early.body.error, 'NOT_READY');
  });
});

describe('fishing', () => {
  it('is refused without a rod', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 100000 });

    const res = await paced(() => client.call<{ error: string }>('/act/fish', {}));
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'NEEDS_UPGRADE');
  });

  it('lands a catch and enforces its own cooldown', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 100000, upgrades: { rod: 1 } });

    const first = await paced(() =>
      client.call<{ farm: FarmLike; gained: Record<string, number> }>('/act/fish', {}),
    );
    assert.equal(first.status, 200);
    assert.ok(first.body.gained['fish']! >= 1);
    assert.equal(first.body.farm.inventory['fish'], first.body.gained['fish']);

    // The cooldown is seconds long, so an immediate second cast must be refused
    // even though the sliding window would allow it.
    const second = await paced(() => client.call<{ error: string }>('/act/fish', {}));
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'TOO_FAST');
  });
});

describe('crafting', () => {
  it('is refused without the millstone', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 100000, items: { sunflower: 10 } });

    const res = await paced(() =>
      client.call<{ error: string }>('/act/craft', { recipe: 'flour' }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'NEEDS_UPGRADE');
  });

  it('consumes exactly the recipe and produces one output', async () => {
    const { client, farm } = await newPlayer();
    const need = RECIPES.flour.inputs.sunflower!;
    await endow(farm.user.id, {
      xp: 100000,
      items: { sunflower: need + 2 },
      upgrades: { mill: 1 },
    });

    const res = await paced(() =>
      client.call<{ farm: FarmLike }>('/act/craft', { recipe: 'flour' }),
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.farm.inventory['sunflower'], 2);
    assert.equal(res.body.farm.inventory['flour'], 1);
  });

  it('refuses a batch it cannot fully afford, without consuming anything', async () => {
    const { client, farm } = await newPlayer();
    const need = RECIPES.flour.inputs.sunflower!;
    await endow(farm.user.id, { xp: 100000, items: { sunflower: need }, upgrades: { mill: 1 } });

    const res = await paced(() =>
      client.call<{ error: string }>('/act/craft', { recipe: 'flour', times: 5 }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'INSUFFICIENT_ITEMS');

    const after = await farmOf(client);
    assert.equal(after.inventory['sunflower'], need, 'a refused batch must consume nothing');
    assert.ok(!after.inventory['flour']);
  });
});

describe('daily goals', () => {
  it('offers three distinct goals that reset at UTC midnight', async () => {
    const { client } = await newPlayer();
    const farm = await farmOf(client);

    assert.ok(farm.daily, 'a daily card should exist from the first read');
    assert.equal(farm.daily!.goals.length, DAILY.picks);
    assert.equal(new Set(farm.daily!.goals.map((g) => g.id)).size, DAILY.picks);
    assert.ok(farm.daily!.resetAt > farm.serverNow);
    assert.ok(farm.daily!.goals.every((g) => g.current === 0 && !g.done));
  });

  it('pays a completed goal exactly once', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 100000, coins: 5000 });
    await farmOf(client); // creates the daily row

    // Rather than grind a random goal, move the baseline so goal 0 is already
    // satisfied. What is under test is the payout, not the counter.
    const goal = dailyPicks(dayIndex(Date.now()))[0]!;
    await withDb(async (db) => {
      const row = await db.dailyState.findUniqueOrThrow({ where: { userId: farm.user.id } });
      const baseline = row.baseline as Record<string, number>;
      await db.dailyState.update({
        where: { userId: farm.user.id },
        data: { baseline: { ...baseline, [goal.counter]: -goal.target } },
      });
    });

    const before = await farmOf(client);

    // buySeed touches no counter any daily goal reads, so the only payout that
    // can land is goal 0's.
    const seedCost = CROPS.sunflower.seedCost;
    const first = await paced(() =>
      client.call<{ farm: FarmLike }>('/act/buySeed', { cropKey: 'sunflower', qty: 1 }),
    );

    assert.equal(first.body.farm.daily!.goals[0]!.done, true);
    // Whatever the coin balance did beyond paying for the seed is the reward.
    const paidCoins = first.body.farm.user.coins - (before.user.coins - seedCost);
    const paidAmber = first.body.farm.user.amberBalance - before.user.amberBalance;
    assert.equal(paidCoins, goal.reward.coins ?? 0);
    assert.equal(paidAmber, goal.reward.amber ?? 0);

    // A second action must not pay again.
    const second = await paced(() =>
      client.call<{ farm: FarmLike }>('/act/buySeed', { cropKey: 'sunflower', qty: 1 }),
    );
    const coinsNow = second.body.farm.user.coins;
    assert.equal(coinsNow, first.body.farm.user.coins - seedCost);
    assert.equal(second.body.farm.user.amberBalance, first.body.farm.user.amberBalance);
  });
});

describe('away report', () => {
  it('summarises what the farm did alone, and only once', async () => {
    const { client, farm } = await newPlayer();

    // Wind the clock back: away long enough to report, with every hen due.
    await withDb(async (db) => {
      await db.user.update({
        where: { id: farm.user.id },
        data: { lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });
      await db.animal.updateMany({
        where: { userId: farm.user.id },
        data: { nextYieldAt: new Date(Date.now() - 60 * 1000) },
      });
    });

    const withReport = await farmOf(client);
    assert.ok(withReport.away, 'a two-hour absence should produce a report');
    assert.ok(withReport.away!.awayMs > 60 * 60 * 1000);
    assert.ok(withReport.away!.eggsLaid > 0, 'the hens should have laid while away');

    // lastSeenAt is now, so the next read has nothing to report.
    const second = await farmOf(client);
    assert.equal(second.away, null);
  });
});
