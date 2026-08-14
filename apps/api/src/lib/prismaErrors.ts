/**
 * Prisma error predicates.
 *
 * Unique-constraint races are a normal part of correct concurrent code here —
 * the index is the enforcement mechanism, not a bug — so recognising them
 * cleanly matters.
 */

import { Prisma } from '@prisma/client';

/** P2002: unique constraint violation. */
export function isUniqueViolation(err: unknown, target?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  if (!target) return true;

  const fields = err.meta?.['target'];
  if (Array.isArray(fields)) return fields.includes(target);
  return fields === target;
}

/** P2025: a required record was not found. */
export function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}
