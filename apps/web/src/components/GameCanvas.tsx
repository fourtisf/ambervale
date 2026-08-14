'use client';

import { useEffect, useRef } from 'react';
import type * as Phaser from 'phaser';

type DebugWindow = Window & { __ambervaleGame?: Phaser.Game };

/**
 * Mounts the Phaser game into a full-viewport div and tears it down cleanly.
 *
 * The game is created inside an effect (never during render) and the module is
 * imported lazily so Phaser never touches the server bundle. React 18 Strict
 * Mode double-invokes effects in dev, so creation is guarded by a cancellation
 * flag — otherwise every dev mount would leak a second WebGL context.
 */
export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    let cancelled = false;

    document.body.classList.add('playing');

    void (async () => {
      const { createGame } = await import('@/game/createGame');
      if (cancelled) return;
      gameRef.current = createGame(parent);
      if (process.env.NODE_ENV !== 'production') {
        // Handle for devtools poking and for automated smoke checks.
        (window as DebugWindow).__ambervaleGame = gameRef.current;
      }
    })();

    return () => {
      cancelled = true;
      document.body.classList.remove('playing');
      gameRef.current?.destroy(true);
      gameRef.current = null;
      if (process.env.NODE_ENV !== 'production') {
        delete (window as DebugWindow).__ambervaleGame;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="game-root"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        background: '#0a2e3d',
        overflow: 'hidden',
      }}
    />
  );
}
