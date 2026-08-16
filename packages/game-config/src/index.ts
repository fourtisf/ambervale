/**
 * AMBERVALE — shared configuration.
 *
 * `tuning` holds every gameplay number; `world` holds every fixed coordinate.
 * Client and server both import from here, so they cannot disagree.
 */

export * from './tuning';
export * from './economy';
export * from './field';
export * from './world';
export * from './builds';
export * from './weather';
