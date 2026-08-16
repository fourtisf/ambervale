'use client';

import { useEffect } from 'react';
import { bridge } from '@/game/bridge';
import { fetchFarm } from '@/lib/api';

/**
 * Keeps the world honest while the player is only watching it.
 *
 * `fetchFarm` existed and was never called once: farm state only ever arrived
 * as the reply to an action. Crops and nodes survived that because they carry
 * timestamps the client can read for itself, but anything the *server* creates
 * on its own — an egg appearing under a hen, an order refilling on the board —
 * simply never showed up until the player happened to press something else,
 * somewhere else. Standing still and waiting, which is exactly what the game
 * tells you to do, was the one thing that could not work.
 *
 * Slow on purpose. This is a safety net for server-made things, not a
 * simulation tick; the client already extrapolates everything it can, and
 * every action still returns fresh state immediately.
 */
const EVERY_MS = 25_000;

export default function FarmRefresher() {
  useEffect(() => {
    let stopped = false;

    const refresh = async () => {
      // A hidden tab is not watching anything, and browsers throttle its
      // timers to roughly a minute regardless. Skipping is both cheaper and
      // closer to what actually happens.
      if (document.visibilityState !== 'visible' || !bridge.started) return;
      try {
        const farm = await fetchFarm();
        if (!stopped) bridge.emit('farm', { ...farm, __receivedAt: Date.now() });
      } catch {
        // A refresh is a courtesy: the next action will bring correct state
        // anyway, and a red toast for a failed background poll would be noise
        // about something the player never asked for.
      }
    };

    const timer = window.setInterval(() => void refresh(), EVERY_MS);
    // Coming back to the tab is the moment the screen is most likely to be
    // stale, and the moment a player is most likely to be looking at it.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
