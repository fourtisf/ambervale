/**
 * Abuse regression suite.
 *
 * Every case here is an attack the server must survive, and each one is a bug
 * that would mint value if it regressed. They run against a live stack because
 * the defences live in Postgres constraints, Redis locks and transaction
 * boundaries — not in application logic that could be unit-tested in isolation.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import {
  BASE,
  createClient,
  newPlayer,
  paced,
  passGate,
  passHeader,
  sleep,
  type FarmLike,
} from './helpers';

/** Plants and harvests one fast crop, returning the farm afterwards. */
async function growOne(client: ReturnType<typeof createClient>, plotIndex = 0) {
  await paced(() => client.call('/act/plant', { plotIndex, cropKey: 'sunflower' }));
  const farm = (await client.call<FarmLike>('/farm')).body;
  const plot = farm.plots.find((p) => p.index === plotIndex)!;
  const waitMs = Math.max(0, (plot.readyAt ?? 0) - farm.serverNow) + 400;
  await sleep(waitMs);
  return paced(() => client.call<{ farm: FarmLike }>('/act/harvest', { plotIndex }));
}

describe('authentication', () => {
  it('rejects a forged session cookie', async () => {
    // Carries a gate pass, so a 401 here means the signature was rejected
    // rather than the invite gate turning the request away first.
    const pass = await passHeader();
    const res = await fetch(`${BASE}/farm`, {
      headers: { cookie: `${pass}; av_sess=forged.notavalidsignature` },
    });
    assert.equal(res.status, 401);
  });

  it('rejects an unauthenticated mutation', async () => {
    const pass = await passHeader();
    const res = await fetch(`${BASE}/act/plant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: pass },
      body: JSON.stringify({ plotIndex: 0, cropKey: 'sunflower' }),
    });
    assert.equal(res.status, 401);
  });

  it('gives two devices two different farms', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    assert.notEqual(a.farm.user.id, b.farm.user.id);
  });

  it('restores the same account from a deviceId with no cookie', async () => {
    const { client, farm } = await newPlayer();
    const fresh = createClient();
    // "No cookie" means no *session*; the gate pass is what any browser
    // arriving at the site would already be carrying.
    await passGate(fresh);
    const res = await fresh.call<{ created: boolean; farm: FarmLike }>('/auth/guest', {
      deviceId: client.deviceId,
    });
    assert.equal(res.body.created, false);
    assert.equal(res.body.farm.user.id, farm.user.id);
  });
});

describe('economy: quantities and prices are server-side', () => {
  it('refuses a numeric sell quantity', async () => {
    const { client } = await newPlayer();
    const res = await paced(() => client.call('/act/sell', { itemKey: 'sunflower', qty: 9999 }));
    assert.equal(res.status, 400);
  });

  it('refuses a negative sell quantity', async () => {
    const { client } = await newPlayer();
    const res = await paced(() => client.call('/act/sell', { itemKey: 'sunflower', qty: -5 }));
    assert.equal(res.status, 400);
  });

  it('prices a sale from game-config, not the request', async () => {
    const { client } = await newPlayer();
    await growOne(client);

    const before = (await client.call<FarmLike>('/farm')).body.user.coins;
    const res = await paced(() =>
      client.call<{ farm: FarmLike; coinsGained: number }>('/act/sell', {
        itemKey: 'sunflower',
        qty: 'all',
      }),
    );

    assert.equal(res.status, 200);
    // One sunflower, sell price 12.
    assert.equal(res.body.coinsGained, 12);
    assert.equal(res.body.farm.user.coins, before + 12);
  });

  it('refuses to sell an item the player does not have', async () => {
    const { client } = await newPlayer();
    const res = await paced(() => client.call('/act/sell', { itemKey: 'pumpkin', qty: 'all' }));
    assert.equal(res.status, 409);
  });

  it('refuses a seed quantity outside {1,5}', async () => {
    const { client } = await newPlayer();
    const res = await paced(() => client.call('/act/buySeed', { cropKey: 'sunflower', qty: 1000 }));
    assert.equal(res.status, 400);
  });

  it('refuses a purchase the player cannot afford', async () => {
    const { client } = await newPlayer();
    // A new account has 40 coins; pumpkin seeds are 32 each and level-locked.
    const res = await paced(() => client.call('/act/buySeed', { cropKey: 'pumpkin', qty: 5 }));
    assert.equal(res.status, 409);
  });
});

describe('growth timing', () => {
  it('refuses an early harvest and reports the remaining time', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 0, cropKey: 'sunflower' }));

    const res = await paced(() =>
      client.call<{ error: string; remainingMs: number }>('/act/harvest', { plotIndex: 0 }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'NOT_READY');
    assert.ok(res.body.remainingMs > 0);
  });

  it('refuses to plant on an occupied plot', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 0, cropKey: 'sunflower' }));
    const res = await paced(() =>
      client.call<{ error: string }>('/act/plant', { plotIndex: 0, cropKey: 'sunflower' }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'PLOT_OCCUPIED');
  });

  it('refuses to plant in the locked north meadow', async () => {
    const { client } = await newPlayer();
    const res = await paced(() =>
      client.call<{ error: string }>('/act/plant', { plotIndex: 9, cropKey: 'sunflower' }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'PLOT_LOCKED');
  });

  it('refuses a crop above the player level', async () => {
    const { client } = await newPlayer();
    const res = await paced(() =>
      client.call<{ error: string }>('/act/plant', { plotIndex: 0, cropKey: 'pumpkin' }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'LEVEL_TOO_LOW');
  });
});

describe('concurrency', () => {
  it('applies exactly one harvest from six concurrent requests', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/act/plant', { plotIndex: 0, cropKey: 'sunflower' }));

    const farm = (await client.call<FarmLike>('/farm')).body;
    const plot = farm.plots.find((p) => p.index === 0)!;
    await sleep(Math.max(0, (plot.readyAt ?? 0) - farm.serverNow) + 500);

    const before = (await client.call<FarmLike>('/farm')).body.inventory['sunflower'] ?? 0;
    await Promise.all(
      Array.from({ length: 6 }, () => client.call('/act/harvest', { plotIndex: 0 })),
    );
    await sleep(600);

    const after = (await client.call<FarmLike>('/farm')).body.inventory['sunflower'] ?? 0;
    assert.equal(after - before, 1, 'a double-submit must not harvest twice');
  });

  it('caps a burst of mutating calls with 429s', async () => {
    const { client } = await newPlayer();
    const results = await Promise.all(
      Array.from({ length: 15 }, () => client.call('/act/chop', { nodeIndex: 0 })),
    );
    const limited = results.filter((r) => r.status === 429).length;
    assert.ok(limited > 0, 'the sliding window must reject part of a burst');
  });

  it('enforces the per-node hit cooldown', async () => {
    const { client } = await newPlayer();
    await sleep(1200);
    const first = await client.call('/act/chop', { nodeIndex: 1 });
    const second = await client.call<{ error: string }>('/act/chop', { nodeIndex: 1 });

    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'TOO_FAST');
  });
});

describe('node lifecycle', () => {
  it('depletes an oak in exactly three hits and then refuses more', async () => {
    const { client } = await newPlayer();

    for (let i = 0; i < 3; i++) {
      await sleep(500);
      const res = await client.call<{ hp: number; felled: boolean; farm: FarmLike }>('/act/chop', {
        nodeIndex: 0,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.hp, 2 - i);
      assert.equal(res.body.felled, i === 2);
    }

    await sleep(500);
    const depleted = await client.call<{ error: string }>('/act/chop', { nodeIndex: 0 });
    assert.equal(depleted.status, 409);
    assert.equal(depleted.body.error, 'NODE_DEPLETED');
  });

  it('refuses the wrong tool for a node kind', async () => {
    const { client } = await newPlayer();
    const res = await paced(() => client.call('/act/mine', { nodeIndex: 0 }));
    assert.equal(res.status, 400);
  });
});

describe('tutorial', () => {
  it('refuses to move the step backwards', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/tutorial/step', { step: 3 }, 'PATCH'));
    const back = await paced(() => client.call('/tutorial/step', { step: 1 }, 'PATCH'));
    assert.equal(back.status, 400);
  });

  it('always allows the skip sentinel', async () => {
    const { client } = await newPlayer();
    await paced(() => client.call('/tutorial/step', { step: 4 }, 'PATCH'));
    const skip = await paced(() =>
      client.call<{ tutorialStep: number }>('/tutorial/step', { step: 99 }, 'PATCH'),
    );
    assert.equal(skip.status, 200);
    assert.equal(skip.body.tutorialStep, 99);
  });
});

describe('claims', () => {
  it('reports claimable 0 and refuses an intent while disabled', async () => {
    const { client } = await newPlayer();

    const quota = await client.call<{ claimable: number; enabled: boolean }>('/claim/quota');
    assert.equal(quota.body.enabled, false);
    assert.equal(quota.body.claimable, 0);

    const intent = await paced(() => client.call<{ error: string }>('/claim/intent', {}));
    assert.equal(intent.status, 403);
    assert.equal(intent.body.error, 'CLAIMS_DISABLED');
  });

  it('refuses the admin export without credentials', async () => {
    const res = await fetch(
      `${process.env.TEST_API_URL ?? 'http://localhost:4021'}/admin/claim-intents`,
    );
    assert.equal(res.status, 401);
  });
});

describe('deliveries', () => {
  it('refuses a delivery below the unlock level', async () => {
    const { client } = await newPlayer();
    const res = await paced(() =>
      client.call<{ error: string }>('/act/deliver', {
        slot: 1,
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'SLOT_LOCKED');
  });

  it('refuses a malformed idempotency key', async () => {
    const { client } = await newPlayer();
    const res = await paced(() => client.call('/act/deliver', { slot: 1, idempotencyKey: 'x' }));
    assert.equal(res.status, 400);
  });

  it('refuses a slot outside the board', async () => {
    const { client } = await newPlayer();
    const res = await paced(() =>
      client.call('/act/deliver', { slot: 99, idempotencyKey: randomUUID() }),
    );
    assert.equal(res.status, 400);
  });
});

describe('expansion', () => {
  it('refuses to expand without the resources', async () => {
    const { client } = await newPlayer();
    const res = await paced(() => client.call<{ error: string }>('/act/expand', {}));
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'INSUFFICIENT_ITEMS');
  });
});

after(() => {
  // node:test keeps the process alive on open handles; nothing here holds any.
});
