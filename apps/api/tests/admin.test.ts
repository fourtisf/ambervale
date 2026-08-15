/**
 * The operator surface.
 *
 * These are the only endpoints that read across every account, so the gate
 * matters more than the numbers behind it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BASE } from './helpers';

const auth = (user: string, pass: string) => ({
  authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
});

describe('admin stats', () => {
  it('refuses an unauthenticated read', async () => {
    const res = await fetch(`${BASE}/admin/stats.json`);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate') ?? '', /Basic/);
  });

  it('refuses a wrong password', async () => {
    const res = await fetch(`${BASE}/admin/stats.json`, {
      headers: auth('admin', 'not-the-password'),
    });
    assert.equal(res.status, 401);
  });

  it('reports a funnel that only ever narrows', async () => {
    const res = await fetch(`${BASE}/admin/stats.json`, {
      headers: auth('admin', process.env.TEST_ADMIN_PASSWORD ?? 'localdev'),
    });
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      funnel: { label: string; count: number; ofPrevious: number }[];
      milestones: { label: string; ofPlayed: number }[];
    };

    // Each step must be a subset of the one above it. A ratio over 100% is
    // how the first version announced that its steps were not a sequence at
    // all — claiming a meadow never required filling a delivery.
    for (let i = 1; i < body.funnel.length; i++) {
      const step = body.funnel[i]!;
      const previous = body.funnel[i - 1]!;
      assert.ok(
        step.count <= previous.count,
        `${step.label} (${step.count}) cannot exceed ${previous.label} (${previous.count})`,
      );
      assert.ok(step.ofPrevious <= 1, `${step.label} reports ${step.ofPrevious} of previous`);
    }

    // Milestones are measured against everyone who played, so they are free to
    // be in any order but never above 100% either.
    for (const m of body.milestones) {
      assert.ok(m.ofPlayed <= 1, `${m.label} reports ${m.ofPlayed} of played`);
    }
  });
});
