import type { FastifyReply, FastifyRequest } from 'fastify';
import { type z, type ZodType } from 'zod';

/**
 * Small zod bridge used by every route. Fastify's own JSON-schema validation is
 * bypassed in favour of zod so the request types match the shared game-config
 * types without a second schema language.
 */

export class ValidationError extends Error {
  public readonly issues: z.core.$ZodIssue[];

  constructor(issues: z.core.$ZodIssue[]) {
    super('Request validation failed');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError(result.error.issues);
  return result.data;
}

export const parseBody = <T extends ZodType>(schema: T, req: FastifyRequest): z.infer<T> =>
  parse(schema, req.body);

export const parseQuery = <T extends ZodType>(schema: T, req: FastifyRequest): z.infer<T> =>
  parse(schema, req.query);

export const parseParams = <T extends ZodType>(schema: T, req: FastifyRequest): z.infer<T> =>
  parse(schema, req.params);

/** Turns a ValidationError into a 400 with a flat, client-friendly issue list. */
export function sendValidationError(reply: FastifyReply, error: ValidationError): FastifyReply {
  return reply.status(400).send({
    error: 'BAD_REQUEST',
    message: error.message,
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}
