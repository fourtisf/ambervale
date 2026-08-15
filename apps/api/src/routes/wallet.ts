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
import { z } from 'zod';
import { env } from '../env';
import { requireAdmin } from '../lib/admin';
import { ApiError, badRequest, conflict, rateLimited, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { allowMutation, takeActionLock } from '../lib/rateLimit';
import { createSession, destroySession } from '../lib/session';
import { parseBody } from '../lib/validate';
import { getFarmState } from '../services/farm';
import { amberBalance } from '../services/progression';
import {
  applySignIn,
  buildLinkMessage,
  issueNonce,
  previewFor,
  signatureIsValid,
  signInDomain,
  takeNonce,
} from '../services/walletAuth';

export { buildLinkMessage };

const AddressField = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Not an EVM address.');

const LinkBody = z.object({
  address: AddressField,
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Not a signature.'),
  chainId: z.number().int().positive(),
});

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  /** Issues a single-use nonce for the sign-in message. */
  app.post('/wallet/nonce', async (req, res) => {
    const user = req.requireUser();
    if (!(await allowMutation(user.id))) throw rateLimited();

    const nonce = await issueNonce(user.id);
    return res.send({ nonce, domain: signInDomain(), userId: user.id });
  });

  /**
   * What signing would do, asked before the wallet is ever prompted.
   *
   * Recovery abandons whatever farm is being played, so the player has to be
   * able to see that coming. Reports progress on both sides and nothing that
   * identifies the other account.
   */
  app.post('/wallet/preview', async (req, res) => {
    const body = parseBody(z.object({ address: AddressField }), req);
    const user = req.requireUser();
    if (!(await allowMutation(user.id))) throw rateLimited();

    return res.send(await previewFor(prisma, body.address, user.id));
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
    const nonce = await takeNonce(user.id);
    if (!nonce) throw badRequest('That sign-in request expired. Try again.');

    const message = buildLinkMessage({
      domain: signInDomain(),
      address: body.address,
      userId: user.id,
      nonce,
      chainId: body.chainId,
    });

    const valid = await signatureIsValid({
      address: body.address,
      signature: body.signature,
      message,
    });
    if (!valid) throw unauthorized('That signature does not match the address.');

    const headerDevice = req.headers['x-device-id'];
    const result = await applySignIn(prisma, {
      address: body.address,
      chainId: body.chainId,
      currentUserId: user.id,
      deviceId: typeof headerDevice === 'string' ? headerDevice : undefined,
    });

    // Recovery means this browser is now a different player. Swap the session
    // rather than trusting the old one: the cookie is the only thing that says
    // who you are, so it has to change with the account.
    if (result.userId !== user.id) {
      if (req.sessionId) await destroySession(req.sessionId);
      res.setSessionCookie(await createSession(result.userId));
    }

    const owner = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });

    return res.send({
      outcome: result.outcome,
      address: result.address,
      chainId: result.chainId,
      farm: await getFarmState(prisma, owner),
    });
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
    if (!requireAdmin(req, res)) return res;

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
