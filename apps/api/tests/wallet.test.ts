/**
 * The wallet as the account, and the social layer it feeds.
 *
 * Recovery is the highest-stakes flow in the game: it hands one browser the
 * contents of another account's farm. Everything here is a property that has
 * to hold for that to be safe — the signature must be real, the nonce must be
 * single-use, and an unknown wallet must never be able to take a farm it does
 * not already own.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { PATRONAGE } from '@ambervale/game-config';
import { createClient, endow, newPlayer, paced, withDb, type FarmLike } from './helpers';

type Nonce = { nonce: string; domain: string; userId: string };
type SignIn = { outcome: string; address: string; farm: FarmLike };

const CHAIN_ID = 1;

/** Exactly the message the client builds — reproduced, not imported. */
function message(n: Nonce, address: string): string {
  return [
    `${n.domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Link this wallet to your AMBERVALE farm.',
    '',
    `URI: ${n.domain}`,
    'Version: 1',
    `Chain ID: ${CHAIN_ID}`,
    `Nonce: ${n.nonce}`,
    `Account: ${n.userId}`,
  ].join('\n');
}

/** Signs in with a wallet, the way the browser does. */
async function connect(
  client: ReturnType<typeof createClient>,
  account: ReturnType<typeof privateKeyToAccount>,
) {
  const n = await paced(() => client.call<Nonce>('/wallet/nonce', {}));
  const signature = await account.signMessage({ message: message(n.body, account.address) });
  return paced(() =>
    client.call<SignIn>('/wallet/link', {
      address: account.address,
      signature,
      chainId: CHAIN_ID,
    }),
  );
}

describe('wallet sign-in', () => {
  it('saves the farm to the wallet', async () => {
    const { client, farm } = await newPlayer();
    const account = privateKeyToAccount(generatePrivateKey());

    const res = await connect(client, account);

    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'linked');
    assert.equal(res.body.address, account.address.toLowerCase());
    assert.equal(res.body.farm.user.id, farm.user.id);
  });

  it('restores the farm on a completely different browser', async () => {
    const { client: first, farm } = await newPlayer();
    await endow(farm.user.id, { coins: 4242, xp: 6000 });

    const account = privateKeyToAccount(generatePrivateKey());
    await connect(first, account);

    // A different device: its own deviceId, its own cookie jar, its own guest
    // farm. This is a player on a new phone, or after clearing everything.
    const { client: second, farm: guestFarm } = await newPlayer();
    assert.notEqual(guestFarm.user.id, farm.user.id);

    const res = await connect(second, account);

    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'recovered');
    assert.equal(res.body.farm.user.id, farm.user.id, 'the session must now be the original farm');
    assert.equal(res.body.farm.user.coins, 4242);

    // And the session really moved: a plain read on the new browser returns
    // the recovered farm, not the guest one it started with.
    const after = await second.call<FarmLike>('/farm');
    assert.equal(after.body.user.id, farm.user.id);
  });

  it('keeps the recovered farm on the next guest resume', async () => {
    // The cookie eventually expires and the client falls back to /auth/guest.
    // If the deviceId still pointed at the abandoned guest, the player would
    // appear to lose their farm all over again.
    const { client: first, farm } = await newPlayer();
    const account = privateKeyToAccount(generatePrivateKey());
    await connect(first, account);

    const { client: second } = await newPlayer();
    await connect(second, account);

    const resumed = await second.call<{ farm: FarmLike }>('/auth/guest', {
      deviceId: second.deviceId,
    });
    assert.equal(resumed.body.farm.user.id, farm.user.id);
  });

  it('rejects a signature from a different key', async () => {
    const { client } = await newPlayer();
    const claimed = privateKeyToAccount(generatePrivateKey());
    const signer = privateKeyToAccount(generatePrivateKey());

    const n = await paced(() => client.call<Nonce>('/wallet/nonce', {}));
    // Signed by the wrong key, over a message naming the right address.
    const signature = await signer.signMessage({ message: message(n.body, claimed.address) });

    const res = await paced(() =>
      client.call('/wallet/link', { address: claimed.address, signature, chainId: CHAIN_ID }),
    );
    assert.equal(res.status, 401);
  });

  it('will not reuse a nonce', async () => {
    const { client } = await newPlayer();
    const account = privateKeyToAccount(generatePrivateKey());

    const n = await paced(() => client.call<Nonce>('/wallet/nonce', {}));
    const signature = await account.signMessage({ message: message(n.body, account.address) });
    const body = { address: account.address, signature, chainId: CHAIN_ID };

    const first = await paced(() => client.call('/wallet/link', body));
    assert.equal(first.status, 200);

    // The same signature replayed must not work a second time.
    const replay = await paced(() => client.call('/wallet/link', body));
    assert.equal(replay.status, 400);
  });

  it('warns before a signature that would abandon the current farm', async () => {
    const { client: first, farm } = await newPlayer();
    await endow(farm.user.id, { coins: 999 });
    const account = privateKeyToAccount(generatePrivateKey());
    await connect(first, account);

    const { client: second } = await newPlayer();
    const preview = await paced(() =>
      second.call<{ outcome: string; target?: { coins: number }; current?: { coins: number } }>(
        '/wallet/preview',
        { address: account.address },
      ),
    );

    assert.equal(preview.body.outcome, 'recovered');
    assert.equal(preview.body.target?.coins, 999, 'the player must see what they would gain');
    assert.ok(preview.body.current, 'and what they would leave behind');
  });

  it('reports an unknown wallet as a plain link', async () => {
    const { client } = await newPlayer();
    const account = privateKeyToAccount(generatePrivateKey());

    const preview = await paced(() =>
      client.call<{ outcome: string }>('/wallet/preview', { address: account.address }),
    );
    assert.equal(preview.body.outcome, 'linked');
  });
});

describe('the Vale Fund', () => {
  it('is closed below its level', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { coins: 100000 });

    const res = await paced(() =>
      client.call<{ error: string }>('/act/patronage', { currency: 'coins' }),
    );
    assert.equal(res.body.error, 'LEVEL_TOO_LOW');
  });

  it('charges more for each point, and never grants power', async () => {
    const { client, farm } = await newPlayer();
    const first = PATRONAGE.coinCost(0);
    const second = PATRONAGE.coinCost(1);
    await endow(farm.user.id, { xp: 100000, coins: first + second });

    assert.ok(second > first, 'the price must climb — that is the whole point');

    const a = await paced(() =>
      client.call<{ farm: FarmLike; renown: number }>('/act/patronage', { currency: 'coins' }),
    );
    assert.equal(a.status, 200);
    assert.equal(a.body.renown, 1);
    assert.equal(a.body.farm.user.renown, 1);
    assert.equal(a.body.farm.user.coins, second);

    const b = await paced(() =>
      client.call<{ farm: FarmLike }>('/act/patronage', { currency: 'coins' }),
    );
    assert.equal(b.body.farm.user.renown, 2);
    assert.equal(b.body.farm.user.coins, 0);

    // Renown is a rank and nothing else: no effect may have moved.
    assert.equal(b.body.farm.effects.sell, 1);
    assert.equal(b.body.farm.effects.growth, 1);
    assert.equal(b.body.farm.effects.axeBonus, 0);
  });

  it('spends $AMBER as a negative ledger row', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 100000, amber: 50 });

    const cost = PATRONAGE.amberCost(0);
    const res = await paced(() =>
      client.call<{ farm: FarmLike }>('/act/patronage', { currency: 'amber' }),
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.farm.user.amberBalance, 50 - cost);

    const rows = await withDb((db) =>
      db.amberLedger.findMany({ where: { userId: farm.user.id, reason: 'patronage' } }),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.delta, -cost);
  });
});

describe('leaderboard', () => {
  it('ranks farms and reports the asking player', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, { xp: 100000, coins: PATRONAGE.coinCost(0) });

    // Only farms that have actually been played appear, so plant something.
    await paced(() => client.call('/act/plant', { plotIndex: 0, cropKey: 'sunflower' }));
    await paced(() => client.call('/act/patronage', { currency: 'coins' }));

    const res = await client.call<{
      renown: { handle: string; renown: number; you?: boolean }[];
      activeToday: number;
      totalFarms: number;
      you: { handle: string; renownRank: number | null };
    }>('/leaderboard');

    assert.equal(res.status, 200);
    assert.ok(res.body.activeToday >= 1);
    assert.ok(res.body.totalFarms >= 1);
    assert.ok(res.body.you.handle.length > 0);
    assert.ok(res.body.you.renownRank !== null, 'a patron must have a rank');
  });
});

describe('the east meadow', () => {
  it('cannot be claimed before the north', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      xp: 100000,
      coins: 100000,
      amber: 100,
      items: { wood: 200, stone: 200 },
    });

    const res = await paced(() =>
      client.call<{ error: string }>('/act/expand', { zone: 'east' }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'PLOT_LOCKED');
  });

  it('adds its plots once both are bought', async () => {
    const { client, farm } = await newPlayer();
    await endow(farm.user.id, {
      xp: 100000,
      coins: 100000,
      amber: 100,
      items: { wood: 200, stone: 200 },
    });

    const north = await paced(() => client.call<{ farm: FarmLike }>('/act/expand', {}));
    assert.equal(north.status, 200);

    const east = await paced(() =>
      client.call<{ farm: FarmLike; plotsAdded: number }>('/act/expand', { zone: 'east' }),
    );
    assert.equal(east.status, 200);
    assert.equal(east.body.plotsAdded, 6);

    const plots = east.body.farm.plots.filter((p) => p.zone === 'east');
    assert.equal(plots.length, 6);

    // And they are actually plantable now.
    const planted = await paced(() =>
      client.call('/act/plant', { plotIndex: plots[0]!.index, cropKey: 'sunflower' }),
    );
    assert.equal(planted.status, 200);
  });
});
