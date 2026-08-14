/**
 * Sentry, opt-in.
 *
 * With no SENTRY_DSN set every function here is a no-op, so local development
 * and CI never reach out to anything. That is deliberate: error reporting
 * should be something you switch on for an environment, not something you have
 * to remember to switch off.
 */

import * as Sentry from '@sentry/node';
import { env } from '../env';

let enabled = false;

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
    // The server handles session cookies and wallet addresses; none of that
    // belongs in an error report.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['cookie'];
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });

  enabled = true;
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export const sentryEnabled = (): boolean => enabled;
