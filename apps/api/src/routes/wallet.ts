/**
 * Wallet linking and the (disabled) claim flow.
 *
 * Nothing in this file moves real value. It exists so that when a contract
 * does appear, the accounting is already correct and already audited: every
 * $AMBER that would ever leave the game leaves through a negative ledger
 * entry, written in the same transaction as the intent that authorises it.
 */

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { verifyMessage } from 'viem';
import { z } from 'zod';
import { env } from '../env';
import { ApiError, badRequest, conflict, rateLimited, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import { allowMutation, takeActionLock } from '../lib/rateLimit';
import { redis } from '../lib/redis';
import { parseBody } from '../lib/validate';
import { amberBalance } from '../services/progression';

/** How long a link nonce stays valid. */
const NONCE_TTL_SEC = 300;

const nonceKey = (userId: string) => `walletnonce:${userId}`;

const LinkBody = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Not an EVM address.'),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Not a signature.'),
  chainId: z.number().int().positive(),
});

/**
 * The message the wallet signs.
 *
 * SIWE-shaped: it names the domain, the account, and a single-use nonce, so a
 * signature captured from one site or one attempt cannot be replayed at
 * another.
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

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  /** Issues a single-use nonce for the link message. */
  app.post('/wallet/nonce', async (req, res) => {
    const user = req.requireUser();
    if (!(await allowMutation(user.id))) throw rateLimited();

    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await redis.set(nonceKey(user.id), nonce, 'EX', NONCE_TTL_SEC);

    const domain = new URL(env.WEB_ORIGIN[0] ?? 'http://localhost').host;
    return res.send({ nonce, domain, userId: user.id });
  });

  app.post('/wallet/link', async (req, res) => {
    const body = parseBody(LinkBody, req);
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'walletLink'))) {
      throw conflict('TOO_FAST', 'A link is already in flight.');
    }

    // Single-use: consumed before verification, so a failed attempt cannot be
    // retried with the same nonce.
    const nonce = await redis.getdel(nonceKey(user.id));
    if (!nonce) throw badRequest('That link request expired. Try again.');

    const domain = new URL(env.WEB_ORIGIN[0] ?? 'http://localhost').host;
    const message = buildLinkMessage({
      domain,
      address: body.address,
      userId: user.id,
      nonce,
      chainId: body.chainId,
    });

    const valid = await verifyMessage({
      address: body.address as `0x${string}`,
      message,
      signature: body.signature as `0x${string}`,
    });
    if (!valid) throw unauthorized('That signature does not match the address.');

    // Addresses are stored lower-cased so the unique index is genuinely
    // one-account-per-wallet rather than one-per-capitalisation.
    const address = body.address.toLowerCase();

    try {
      const wallet = await prisma.wallet.upsert({
        where: { userId: user.id },
        create: { userId: user.id, address, chainId: body.chainId },
        update: { address, chainId: body.chainId },
      });

      await prisma.eventLog.create({
        data: { userId: user.id, kind: 'wallet.link', payload: { address, chainId: body.chainId } },
      });

      return res.send({ address: wallet.address, chainId: wallet.chainId });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict('WALLET_TAKEN', 'That wallet is already linked to another farm.');
      }
      throw err;
    }
  });

  app.get('/wallet', async (req, res) => {
    const user = req.requireUser();
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    return res.send(
      wallet
        ? { linked: true, address: wallet.address, chainId: wallet.chainId }
        : { linked: false },
    );
  });

  // -------------------------------------------------------------------------
  // Claims — inert until ENABLE_CLAIM
  // -------------------------------------------------------------------------

  app.get('/claim/quota', async (req, res) => {
    const user = req.requireUser();
    const balance = await amberBalance(prisma as unknown as Prisma.TransactionClient, user.id);
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

    return res.send({
      amberBalance: balance,
      // Claimable is hard-zero while the flag is off, whatever the balance is.
      claimable: env.ENABLE_CLAIM ? balance : 0,
      enabled: env.ENABLE_CLAIM,
      walletLinked: wallet !== null,
    });
  });

  app.post('/claim/intent', async (req, res) => {
    const user = req.requireUser();

    if (!env.ENABLE_CLAIM) {
      throw new ApiError(403, 'CLAIMS_DISABLED', 'Claims are not open yet.');
    }
    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'claimIntent'))) {
      throw conflict('TOO_FAST', 'A claim is already in flight.');
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) throw badRequest('Link a wallet first.');

    const intent = await prisma.$transaction(async (tx) => {
      const balance = await amberBalance(tx, user.id);
      if (balance <= 0) throw conflict('INSUFFICIENT_ITEMS', 'Nothing to claim.', { balance });

      // The lock entry and the intent are written together. The balance can
      // never go negative because the amount is exactly what was there, and
      // the read and the write share a transaction.
      const row = await tx.claimIntent.create({
        data: { userId: user.id, amount: balance, status: 'pending' },
      });

      await tx.amberLedger.create({
        data: { userId: user.id, delta: -balance, reason: 'claim_lock', refId: row.id },
      });

      await tx.eventLog.create({
        data: { userId: user.id, kind: 'claim.intent', payload: { amount: balance, id: row.id } },
      });

      return row;
    });

    return res.send({ id: intent.id, amount: intent.amount, status: intent.status });
  });

  /**
   * Admin CSV of pending intents, so payouts can be made by hand before any
   * contract exists. Basic auth from env; not part of the player API.
   */
  app.get('/admin/claim-intents', async (req, res) => {
    const header = req.headers.authorization ?? '';
    const expected =
      'Basic ' + Buffer.from(`${env.ADMIN_USER}:${env.ADMIN_PASSWORD}`).toString('base64');

    if (!env.ADMIN_PASSWORD || header !== expected) {
      return res
        .status(401)
        .header('www-authenticate', 'Basic realm="ambervale"')
        .send('Unauthorized');
    }

    const intents = await prisma.claimIntent.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { user: { include: { wallet: true } } },
    });

    const rows = [
      'intentId,userId,address,chainId,amount,createdAt',
      ...intents.map((i) =>
        [
          i.id,
          i.userId,
          i.user.wallet?.address ?? '',
          i.user.wallet?.chainId ?? '',
          i.amount,
          i.createdAt.toISOString(),
        ].join(','),
      ),
    ].join('\n');

    return res
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="claim-intents.csv"')
      .send(rows);
  });
}
