import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: path.resolve(__dirname, '../.env') });

const boolish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4021),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  /**
   * Comma-separated allowlist of browser origins. A list rather than a single
   * value because http://localhost and http://127.0.0.1 are different origins,
   * and prod usually needs both an apex and a www host. Still an explicit
   * allowlist — never a wildcard, which credentialed CORS forbids anyway.
   */
  WEB_ORIGIN: z
    .string()
    .min(1)
    .transform((value, ctx) => {
      const origins = value
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

      if (origins.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'At least one origin is required.' });
        return z.NEVER;
      }
      for (const origin of origins) {
        try {
          new URL(origin);
        } catch {
          ctx.addIssue({ code: 'custom', message: `"${origin}" is not a valid URL.` });
          return z.NEVER;
        }
      }
      return origins;
    }),
  SESSION_SECRET: z.string().min(32),
  ENABLE_CLAIM: boolish.default(false),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Fail loudly before anything else boots; a half-configured API is worse
  // than one that refuses to start.
  console.error(`Invalid environment configuration:\n${issues}\n\nSee apps/api/.env.example`);
  process.exit(1);
}

export const env: Env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
