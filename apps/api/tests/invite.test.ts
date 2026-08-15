/**
 * The closed-beta gate.
 *
 * The screen in the browser is a courtesy; these are the tests that decide
 * whether the door is actually shut. Every one of them calls the API the way
 * someone skipping the landing page would.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { BASE, clearInviteLimit, createClient, sleep } from './helpers';

const CODE = process.env.TEST_INVITE_CODE ?? '1990';

describe('invite gate', () => {
  // The budget is per IP and every test here shares one, so a previous run
  // that exhausted it would fail this one for reasons of its own making.
  before(clearInviteLimit);
  after(clearInviteLimit);

  it('refuses to create an account without a pass', async () => {
    // A bare fetch: no cookie jar, no pass, exactly what a script would do.
    const res = await fetch(`${BASE}/auth/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': randomUUID() },
      body: JSON.stringify({ deviceId: randomUUID() }),
    });

    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: string }).error, 'INVITE_REQUIRED');
  });

  it('refuses the game endpoints too, not just sign-up', async () => {
    for (const path of ['/farm', '/leaderboard']) {
      const res = await fetch(`${BASE}${path}`);
      assert.equal(res.status, 403, `${path} should be gated`);
    }
  });

  it('leaves health and the gate itself reachable', async () => {
    for (const path of ['/health', '/auth/invite']) {
      const res = await fetch(`${BASE}${path}`);
      assert.notEqual(res.status, 403, `${path} must stay open`);
    }
  });

  it('rejects a wrong code and opens for the right one', async () => {
    const client = createClient();

    const wrong = await client.call<{ error: string }>('/auth/invite', { code: '0000' });
    assert.equal(wrong.status, 401);

    const denied = await client.call('/auth/guest', { deviceId: client.deviceId });
    assert.equal(denied.status, 403, 'a failed attempt must not hand out a pass');

    const right = await client.call<{ ok: boolean }>('/auth/invite', { code: CODE });
    assert.equal(right.status, 200);
    assert.equal(right.body.ok, true);

    // The pass rides on the cookie jar, so the same client now gets through.
    const allowed = await client.call('/auth/guest', { deviceId: client.deviceId });
    assert.equal(allowed.status, 200);
  });

  it('reports the door state without leaking the code', async () => {
    const client = createClient();

    const before = await client.call<{ required: boolean; ok: boolean }>('/auth/invite');
    assert.equal(before.body.required, true);
    assert.equal(before.body.ok, false);
    assert.ok(!JSON.stringify(before.body).includes(CODE), 'the code must never be echoed');

    await client.call('/auth/invite', { code: CODE });

    const after = await client.call<{ ok: boolean }>('/auth/invite');
    assert.equal(after.body.ok, true);
  });

  it('caps guessing', async () => {
    // A four-digit code is ten thousand tries without this, which is minutes.
    // On its own address, so a correct entry elsewhere in the run cannot
    // clear the tally out from under it.
    const client = createClient({ ip: '198.51.100.7' });
    let sawLimit = false;

    for (let i = 0; i < 16; i++) {
      const res = await client.call<{ error: string }>('/auth/invite', { code: '0001' });
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
      await sleep(20);
    }

    assert.ok(sawLimit, 'repeated wrong guesses must start being refused');
  });

  it('cannot be handed a fresh budget with a forged forwarding header', async () => {
    // The attack this defends against: prepend a made-up X-Forwarded-For
    // entry per request and every guess looks like a new visitor. nginx
    // appends the real address to the right of whatever the caller sent, so
    // only the rightmost entry may be believed — the left ones are the
    // caller talking about themselves.
    const real = '198.51.100.23';
    let sawLimit = false;

    for (let i = 0; i < 16; i++) {
      const res = await fetch(`${BASE}/auth/invite`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `203.0.113.${i}, ${real}`,
        },
        body: JSON.stringify({ code: '0003' }),
      });
      if (res.status === 429) {
        sawLimit = true;
        break;
      }
      await sleep(20);
    }

    assert.ok(sawLimit, 'a rotating forwarded-for must not buy more guesses');
  });
});
