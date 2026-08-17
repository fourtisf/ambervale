/**
 * The Far Shore, the Amber Deep, and visiting.
 *
 * The questions that matter: can the island be bought out of order, can a
 * vein be chopped like a tree, does an old farm actually receive the new
 * world, and does a visit leak anything the fence would have hidden.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXPANSION_ISLE, NODES, PLOTS, NODE_SLOTS } from '@ambervale/game-config';
import { endow, newPlayer, paced, sleep, withDb, type FarmLike } from './helpers';

const farmOf = async (client: Awaited<ReturnType<typeof newPlayer>>['client']) =>
  (await client.call<FarmLike>('/farm')).body;

/** A vein slot index, from config rather than hard-coded. */
const VEIN_INDEX = NODE_SLOTS.find((n) => n.kind === 'vein')!.index;

/** Longer than the 350ms per-node hit cooldown. */
const SWING_GAP = 450;

describe('the island field', () => {
  it('cannot be claimed before the east meadow', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      coins: 999_999,
      xp: 999_999,
      amber: 50,
      items: { wood: 500, stone: 500 },
    });

    const res = await paced(() => client.call<{ error: string }>('/act/expand', { zone: 'isle' }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'PLOT_LOCKED');
  });

  it('cannot be planted before it is bought', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 999_999 });
    const islePlot = PLOTS.find((p) => p.zone === 'isle')!;

    const res = await paced(() =>
      client.call<{ error: string }>('/act/plant', {
        plotIndex: islePlot.index,
        cropKey: 'sunflower',
      }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'PLOT_LOCKED');
  });

  it('opens after the chain, for the sticker price', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      coins: 999_999,
      xp: 999_999,
      amber: 50,
      items: { wood: 500, stone: 500 },
    });
    await withDb((db) =>
      db.expansion.update({
        where: { userId: farm.user.id },
        data: { north: true, east: true },
      }),
    );

    const before = await farmOf(client);
    const res = await paced(() =>
      client.call<{ plotsAdded: number; farm: FarmLike }>('/act/expand', { zone: 'isle' }),
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.plotsAdded, EXPANSION_ISLE.plotsAdded);
    assert.equal(res.body.farm.expansion['isle'], true);
    assert.equal(
      res.body.farm.user.coins,
      before.user.coins - EXPANSION_ISLE.coins,
      'the island must cost exactly what the sign says',
    );

    // And now the field takes seed.
    const islePlot = PLOTS.find((p) => p.zone === 'isle')!;
    const plant = await paced(() =>
      client.call('/act/plant', { plotIndex: islePlot.index, cropKey: 'sunflower' }),
    );
    assert.equal(plant.status, 200);
  });
});

describe('the amber deep', () => {
  it('will not let an axe at a vein', async () => {
    const { client } = await newPlayer();
    const res = await paced(() =>
      client.call<{ error: string }>('/act/chop', { nodeIndex: VEIN_INDEX }),
    );
    assert.equal(res.status, 400);
  });

  it('breaks in five swings, pays stone, maybe a geode, and regrows slowly', async () => {
    const { client, farm } = await newPlayer();

    let last: { felled?: boolean; gained?: Record<string, number> } = {};
    for (let i = 0; i < NODES.vein.hits; i++) {
      await sleep(SWING_GAP);
      const res = await client.call<typeof last>('/act/mine', { nodeIndex: VEIN_INDEX });
      assert.equal(res.status, 200, `swing ${i + 1} failed: ${JSON.stringify(res.body)}`);
      last = res.body;
    }

    assert.equal(last.felled, true, 'the fifth swing breaks it');
    assert.equal(last.gained?.['stone'], NODES.vein.yield.stone);
    const geodes = last.gained?.['geode'] ?? 0;
    assert.ok(geodes === 0 || geodes === 1, 'a geode is a chance, not a spigot');

    const after = await farmOf(client);
    const vein = after.nodes.find((n) => n.index === VEIN_INDEX)!;
    assert.equal(vein.hp, 0);
    assert.ok(vein.respawnAt !== null, 'a broken vein must be regrowing');
    assert.ok(
      vein.respawnAt! - Date.now() > (NODES.vein.respawnSec - 30) * 1000,
      'on the deep clock, not the surface one',
    );

    // A sixth swing meets nothing.
    await sleep(SWING_GAP);
    const spent = await client.call<{ error: string }>('/act/mine', { nodeIndex: VEIN_INDEX });
    assert.equal(spent.status, 409);
    assert.equal(spent.body.error, 'NODE_DEPLETED');

    void farm;
  });
});

describe('the world backfill', () => {
  it('restores config-grown rows to a farm seeded before them', async () => {
    const { client, farm } = await newPlayer();

    // Simulate an account from before the Far Shore: its island rows gone.
    await withDb(async (db) => {
      await db.plot.deleteMany({ where: { userId: farm.user.id, index: { gte: 21 } } });
      await db.resourceNode.deleteMany({ where: { userId: farm.user.id, index: { gte: 18 } } });
    });

    const fresh = await farmOf(client);
    assert.equal(fresh.plots.length, PLOTS.length, 'every configured plot exists again');
    assert.equal(fresh.nodes.length, NODE_SLOTS.length, 'every configured node exists again');
    const vein = fresh.nodes.find((n) => n.index === VEIN_INDEX)!;
    assert.equal(vein.hp, NODES.vein.hits, 'backfilled nodes arrive whole');
  });
});

describe('the dog', () => {
  it('takes a name, cleans it, and bounds it', async () => {
    const { client } = await newPlayer();

    const named = await paced(() =>
      client.call<{ dogName: string; farm: FarmLike }>('/act/dogName', {
        text: 'ignored',
        name: '  Bi\n\nji  ',
      }),
    );
    assert.equal(named.status, 200);
    assert.equal(named.body.dogName, 'Bi ji', 'control chars collapse to spaces, ends trimmed');
    assert.equal(named.body.farm.user.dogName, 'Bi ji');

    const short = await paced(() => client.call<{ error: string }>('/act/dogName', { name: 'x' }));
    assert.equal(short.status, 400);
    const long = await paced(() =>
      client.call<{ error: string }>('/act/dogName', { name: 'a'.repeat(30) }),
    );
    assert.equal(long.status, 400);

    // Renaming is the same verb with regret in it.
    const renamed = await paced(() =>
      client.call<{ dogName: string }>('/act/dogName', { name: 'Kopi' }),
    );
    assert.equal(renamed.body.dogName, 'Kopi');
    const fresh = await farmOf(client);
    assert.equal(fresh.user.dogName, 'Kopi', 'the name survives a fresh read');
  });
});

describe('visiting', () => {
  it('mints a slug, hides the private half, and takes a note in the book', async () => {
    const owner = await newPlayer();
    await endow(owner.farm.user.id, { coins: 123_456, items: { wood: 77 } });

    const slug = (await farmOf(owner.client)).user.visitSlug;
    assert.ok(slug, 'a slug is minted on the first /farm read');

    const visitor = await newPlayer();
    const view = await visitor.client.call<
      FarmLike & { spectator: boolean; guestbook: { author: string; text: string }[] }
    >(`/visit/${slug}`);
    assert.equal(view.status, 200);
    assert.equal(view.body.spectator, true);
    assert.equal(view.body.user.coins, 0, 'their coins are not your business');
    assert.deepEqual(view.body.inventory, {}, 'nor their barn');
    assert.equal(view.body.deliverySlots.length, 0, 'nor their orders');
    assert.ok(view.body.plots.length > 0, 'but the land itself is on show');

    // The book: own-book refusal, cleaning, and the once-a-minute nib.
    const own = await paced(() =>
      owner.client.call<{ error: string }>(`/visit/${slug}/sign`, { text: 'me myself' }),
    );
    assert.equal(own.body.error, 'OWN_BOOK');

    const signed = await paced(() =>
      visitor.client.call<{ guestbook: { text: string }[] }>(`/visit/${slug}/sign`, {
        text: '  such \n\n tidy   rows!  ',
      }),
    );
    assert.equal(signed.status, 200);
    assert.equal(signed.body.guestbook[0]!.text, 'such tidy rows!');

    const again = await paced(() =>
      visitor.client.call<{ error: string }>(`/visit/${slug}/sign`, { text: 'and again' }),
    );
    assert.equal(again.body.error, 'TOO_FAST');
  });

  it('404s an address nobody farms', async () => {
    const { client } = await newPlayer();
    const res = await client.call<{ error: string }>('/visit/no-such-farm-00');
    assert.equal(res.status, 404);
  });
});
