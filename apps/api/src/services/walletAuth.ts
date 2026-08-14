/**
 * The wallet as the account.
 *
 * Until now a farm belonged to a browser: a deviceId in localStorage, and a
 * cookie. Clear either and the farm was gone — which is survivable for a toy
 * and fatal for a game that promises anything earnable. A signature over a
 * single-use nonce proves an address, and the address is a durable identity
 * the player can carry to any device.
 *
 * Three outcomes, decided entirely by what the address already owns:
 *
 * - unknown address        → link it to the farm being played now
 * - address owns this farm → nothing to do
 * - address owns another   → sign in as that farm; the guest one is left behind
 *
 * The third is recovery, and it is the whole point. It is also the one that
 * can lose progress, so the caller is expected to have warned first — see
 * `previewFor`.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { verifyMessage } from 'viem';
import { env } from '../env';
import { redis } from '../lib/redis';

/** How long a sign-in nonce stays valid. */
const NONCE_TTL_SEC = 300;

const nonceKey = (userId: string) => `walletnonce:${userId}`;

export const signInDomain = (): string => new URL(env.WEB_ORIGIN[0] ?? 'http://localhost').host;

/**
 * The message the wallet signs.
 *
 * SIWE-shaped: domain, address, and a single-use nonce bound to the session
 * asking for it, so a signature captured on another site — or from this
 * player's own earlier attempt — cannot be replayed.
 */
export function buildLinkMessage(params: {
  domain: string;
  address: string;
  userId: string;
  nonce: string;
  chainId: number;
}): string {
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    '',
    'Link this wallet to your AMBERVALE farm.',
    '',
    `URI: ${params.domain}`,
    'Version: 1',
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Account: ${params.userId}`,
  ].join('\n');
}

export async function issueNonce(userId: string): Promise<string> {
  const nonce = randomUUID().replace(/-/g, '');
  await redis.set(nonceKey(userId), nonce, 'EX', NONCE_TTL_SEC);
  return nonce;
}

/** Consumes the nonce. Single-use, so a failed attempt cannot be retried. */
export const takeNonce = (userId: string): Promise<string | null> => redis.getdel(nonceKey(userId));

export async function signatureIsValid(params: {
  address: string;
  signature: string;
  message: string;
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: params.address as `0x${string}`,
      message: params.message,
      signature: params.signature as `0x${string}`,
    });
  } catch {
    // A malformed signature is a failed verification, not a server error.
    return false;
  }
}

// ---------------------------------------------------------------------------

export type WalletOutcome = 'linked' | 'already' | 'recovered';

export interface SignInResult {
  outcome: WalletOutcome;
  /** The account the session should now belong to. */
  userId: string;
  address: string;
  chainId: number;
}

/**
 * What connecting this address would do, so the UI can warn before the player
 * signs anything.
 *
 * Deliberately reports only whether the address is known and how far along the
 * farm behind it is — never who owns it.
 */
export async function previewFor(
  db: PrismaClient,
  address: string,
  currentUserId: string,
): Promise<{
  outcome: WalletOutcome;
  /** Set when signing would move the player to a different farm. */
  target?: { level: number; coins: number; renown: number };
  /** Progress on the farm being played now, which recovery would leave behind. */
  current?: { level: number; coins: number; renown: number };
}> {
  const wallet = await db.wallet.findUnique({
    where: { address: address.toLowerCase() },
    include: { user: true },
  });

  if (!wallet) return { outcome: 'linked' };
  if (wallet.userId === currentUserId) return { outcome: 'already' };

  const current = await db.user.findUniqueOrThrow({ where: { id: currentUserId } });

  return {
    outcome: 'recovered',
    target: { level: wallet.user.level, coins: wallet.user.coins, renown: wallet.user.renown },
    current: { level: current.level, coins: current.coins, renown: current.renown },
  };
}

/**
 * Applies a verified signature.
 *
 * On recovery the browser's deviceId is moved onto the recovered account. That
 * detail is load-bearing: without it the next `/auth/guest` on this device —
 * which happens on every reload once the cookie expires — would resolve back
 * to the abandoned guest farm, and the player would appear to lose their farm
 * all over again. The guest keeps a retired placeholder id so the unique index
 * still holds.
 */
export async function applySignIn(
  db: PrismaClient,
  params: { address: string; chainId: number; currentUserId: string; deviceId?: string },
): Promise<SignInResult> {
  const address = params.address.toLowerCase();

  return db.$transaction(async (tx) => {
    const existing = await tx.wallet.findUnique({ where: { address } });

    if (existing && existing.userId !== params.currentUserId) {
      if (params.deviceId) {
        // Retire the guest's claim on this device before handing it over —
        // deviceId is unique, so both rows cannot hold it at once.
        await tx.user.update({
          where: { id: params.currentUserId },
          data: { deviceId: `retired:${randomUUID()}` },
        });
        await tx.user.update({
          where: { id: existing.userId },
          data: { deviceId: params.deviceId },
        });
      }

      await tx.eventLog.create({
        data: {
          userId: existing.userId,
          kind: 'wallet.recover',
          payload: { address, from: params.currentUserId },
        },
      });

      return {
        outcome: 'recovered' as const,
        userId: existing.userId,
        address,
        chainId: existing.chainId,
      };
    }

    if (existing) {
      return {
        outcome: 'already' as const,
        userId: existing.userId,
        address,
        chainId: existing.chainId,
      };
    }

    // A farm may only carry one wallet, so an upsert on userId replaces any
    // address this account had before rather than accumulating them.
    const wallet = await tx.wallet.upsert({
      where: { userId: params.currentUserId },
      create: { userId: params.currentUserId, address, chainId: params.chainId },
      update: { address, chainId: params.chainId },
    });

    await tx.eventLog.create({
      data: { userId: params.currentUserId, kind: 'wallet.link', payload: { address } },
    });

    return {
      outcome: 'linked' as const,
      userId: params.currentUserId,
      address: wallet.address,
      chainId: wallet.chainId,
    };
  });
}
