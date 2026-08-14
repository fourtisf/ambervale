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

export const BASE = process.env.TEST_API_URL ?? 'http://localhost:4021';

export interface Response<T = Record<string, unknown>> {
  status: number;
  body: T;
}

/** A browser-like client: its own deviceId and its own cookie jar. */
export function createClient() {
  const jar = new Map<string, string>();
  const deviceId = randomUUID();

  async function call<T = Record<string, unknown>>(
    path: string,
    payload?: unknown,
    method?: string,
  ): Promise<Response<T>> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-device-id': deviceId,
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

  return { call, deviceId };
}

export type Client = ReturnType<typeof createClient>;

/** Registers a fresh guest account and returns its client plus first farm. */
export async function newPlayer(): Promise<{ client: Client; farm: FarmLike }> {
  const client = createClient();
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
    tutorialStep: number;
    counters: Record<string, number>;
  };
  plots: {
    index: number;
    zone: string;
    cropKey: string | null;
    plantedAt: number | null;
    readyAt: number | null;
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
  expansion: { north: boolean };
  quest: { id: string; current: number; target: number } | null;
  upgrades: Record<string, number>;
  shop: {
    key: string;
    tier: number;
    maxTier: number;
    unlockLv: number;
    next: { effect: string; cost: Record<string, unknown> } | null;
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
    goals: { id: string; target: number; current: number; done: boolean }[];
  };
  away: {
    awayMs: number;
    eggsLaid: number;
    nodesRegrown: number;
    cropsReady: number;
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

/** Runs a callback with a throwaway Prisma client, for direct state surgery. */
export async function withDb<T>(
  fn: (db: import('@prisma/client').PrismaClient) => Promise<T>,
): Promise<T> {
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
