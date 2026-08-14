/**
 * Sentry, browser side.
 *
 * With NEXT_PUBLIC_SENTRY_DSN unset this initialises nothing, so local
 * development and CI never reach out. Error reporting is switched on per
 * environment rather than switched off per developer.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_CHAIN_ENV ?? 'development',
    tracesSampleRate: 0.1,
    // The game is a canvas; session replay would capture nothing useful and
    // cost every player bandwidth.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}
