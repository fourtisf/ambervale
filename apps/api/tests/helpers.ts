/**
 * Test helpers.
 *
 * These are integration tests: they run against a live API with a real
 * Postgres and Redis behind it, because almost everything worth testing here
 * — the rate limiter, the action locks, the idempotency key, the unique
 * indexes — only exists in the interaction between those three. Mocking them
 * would test the mocks.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const BASE = process.env.TEST_API_URL ?? 'http://localhost:4021';

export interface Response<T = Record<string, unknown>> {
  status: number;
  body: T;
}

/**
 * A browser-like client: its own deviceId and its own cookie jar.
 *
 * `ip` sets an X-Forwarded-For, which the API believes only because these
 * tests connect from the loopback address it is configured to trust — the
 * same position nginx occupies in production. It exists so a test about a
 * per-IP limit can have an address to itself instead of sharing one budget
 * with every other test in the run.
 */
export function createClient(opts: { ip?: string } = {}) {
  const jar = new Map<string, string>();
  const deviceId = randomUUID();
  /**
   * The invite pass, held per client the way a browser tab holds it.
   *
   * It is a header rather than a cookie, deliberately — the gate is meant to
   * be asked for on every arrival — so the jar does not carry it and this has
   * to be tracked alongside.
   */
  let pass: string | null = null;

  async function call<T = Record<string, unknown>>(
    path: string,
    payload?: unknown,
    method?: string,
  ): Promise<Response<T>> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-device-id': deviceId,
      ...(pass ? { 'x-invite-pass': pass } : {}),
      ...(opts.ip ? { 'x-forwarded-for': opts.ip } : {}),
    };
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers['cookie'] = cookie;

    const res = await fetch(BASE + path, {
      method: method ?? (payload === undefined ? 'GET' : 'POST'),
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });

    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const eq = pair!.indexOf('=');
      jar.set(pair!.slice(0, eq), pair!.slice(eq + 1));
    }

    const text = await res.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { status: res.status, body: body as T };
  }

  return {
    call,
    deviceId,
    setPass: (value: string | null) => {
      pass = value;
    },
  };
}

export type Client = ReturnType<typeof createClient>;

/**
 * The closed-beta code. Every client has to present it before the API will
 * talk to it at all, so the helpers do it rather than each test remembering.
 */
export const INVITE_CODE = process.env.TEST_INVITE_CODE ?? '1990';

/** Gets this client through the gate. Safe to call when the gate is off. */
export async function passGate(client: Client): Promise<void> {
  const res = await client.call<{ pass?: string }>('/auth/invite', { code: INVITE_CODE });
  client.setPass(res.body.pass ?? null);
}

/**
 * A gate pass, for the tests that call fetch by hand precisely because they
 * are checking what happens with no session — they still have to get through
 * the front door first, or they measure the gate instead of the thing they
 * name.
 */
export async function passHeader(): Promise<string> {
  const res = await fetch(`${BASE}/auth/invite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: INVITE_CODE }),
  });
  const body = (await res.json()) as { pass?: string };
  return body.pass ?? '';
}

/** Registers a fresh guest account and returns its client plus first farm. */
export async function newPlayer(): Promise<{ client: Client; farm: FarmLike }> {
  const client = createClient();
  await passGate(client);
  const res = await client.call<{ farm: FarmLike }>('/auth/guest', { deviceId: client.deviceId });
  return { client, farm: res.body.farm };
}

/** Just enough of the farm shape for assertions. */
export interface FarmLike {
  serverNow: number;
  user: {
    id: string;
    level: number;
    xp: number;
    coins: number;
    rep: number;
    amberBalance: number;
    renown: number;
    title: string | null;
    handle: string;
    visitSlug: string | null;
    dogName: string | null;
    tutorialStep: number;
    tutorialBase: Record<string, number>;
    counters: Record<string, number>;
  };
  plots: {
    index: number;
    zone: string;
    cropKey: string | null;
    plantedAt: number | null;
    readyAt: number | null;
    watered: boolean;
    crow: boolean;
    crowAt: number | null;
    crowRuinsAt: number | null;
  }[];
  nodes: { index: number; kind: string; hp: number; respawnAt: number | null }[];
  animals: { index: number; kind: string; nextYieldAt: number; ready: boolean }[];
  groundItems: { id: string; itemKey: string }[];
  inventory: Record<string, number>;
  seeds: Record<string, number>;
  deliverySlots: {
    slot: number;
    state: string;
    itemKey: string | null;
    qty: number | null;
    amber: number | null;
    unlocked: boolean;
  }[];
  expansion: Record<string, boolean>;
  homesteadTier: number;
  today: { day: number; sky: string; market: { sought: string; glut: string } };
  tomorrow: { day: number; sky: string; market: { sought: string; glut: string } };
  builds: { key: string; builtAt: number }[];
  quest: { id: string; current: number; target: number } | null;
  upgrades: Record<string, number>;
  shop: {
    key: string;
    tier: number;
    maxTier: number;
    unlockLv: number;
    next: { effect: string; cost: Record<string, unknown> } | null;
  }[];
  prices: {
    itemKey: string;
    base: number;
    price: number;
    multiplier: number;
    demand: number;
    recoversAt: number | null;
  }[];
  effects: {
    axeBonus: number;
    pickBonus: number;
    growth: number;
    sell: number;
    hens: number;
    canFish: boolean;
    canCraft: boolean;
  };
  daily: {
    day: number;
    resetAt: number;
    streak: number;
    allDone: boolean;
    goals: {
      id: string;
      text: string;
      target: number;
      current: number;
      done: boolean;
      reward: { coins?: number; amber?: number };
    }[];
  };
  away: {
    awayMs: number;
    eggsLaid: number;
    nodesRegrown: number;
    cropsReady: number;
    cropsRuined: number;
    cropsSpared: number;
    gift: { coins: number; seedKey: string | null; seeds: number } | null;
  } | null;
}

/**
 * Gives a player enough coins, items and level to shop with.
 *
 * Tests that are about the *sink* should not have to grind the source first,
 * so this reaches into the database directly rather than playing the game.
 */
export async function endow(
  userId: string,
  data: {
    coins?: number;
    xp?: number;
    items?: Record<string, number>;
    amber?: number;
    upgrades?: Record<string, number>;
  },
): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    if (data.coins !== undefined || data.xp !== undefined) {
      await db.user.update({
        where: { id: userId },
        data: {
          ...(data.coins !== undefined ? { coins: data.coins } : {}),
          ...(data.xp !== undefined ? { xp: data.xp, level: 99 } : {}),
        },
      });
    }
    for (const [itemKey, qty] of Object.entries(data.items ?? {})) {
      await db.inventoryItem.upsert({
        where: { userId_itemKey: { userId, itemKey } },
        create: { userId, itemKey, qty },
        update: { qty },
      });
    }
    if (data.amber) {
      await db.amberLedger.create({
        data: { userId, delta: data.amber, reason: 'test_grant' },
      });
    }
    for (const [key, tier] of Object.entries(data.upgrades ?? {})) {
      await db.upgrade.upsert({
        where: { userId_key: { userId, key } },
        create: { userId, key, tier },
        update: { tier },
      });
    }
  } finally {
    await db.$disconnect();
  }
}

/**
 * Forgets the invite gate's per-IP failure tally.
 *
 * Every test here shares one IP, so a run that deliberately exhausts the
 * budget would otherwise lock out the next run for the whole window.
 */
export async function clearInviteLimit(): Promise<void> {
  const { default: Redis } = await import('ioredis');
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  try {
    const keys = await redis.keys('invite:*');
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}

/** Runs a callback with a throwaway Prisma client, for direct state surgery. */
export async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Spacing between mutating calls in tests that are not deliberately probing
 * the rate limiter. The limit is 5/sec, so 240ms keeps a sequence comfortably
 * under it without making the suite crawl.
 */
export const PACE = 240;

/** Runs a mutating call after a pause, so the rate limiter is not the subject. */
export async function paced<T>(fn: () => Promise<T>): Promise<T> {
  await sleep(PACE);
  return fn();
}
