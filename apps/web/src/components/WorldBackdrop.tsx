'use client';

import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { bridge } from '@/game/bridge';

type DebugWindow = Window & { __ambervaleBackdrop?: Phaser.Game };

/**
 * The living vale, as a page background.
 *
 * The landing page used to sit on a drawn scene. This is the actual world
 * instead — the same terrain, day cycle and weather the game runs, rendering
 * behind the front door. It needs no account to do it: the map comes from
 * game-config, so a visitor who has never played still gets a real place
 * rather than a picture of one.
 *
 * It boots with `gated` set, which is the flag that tells HudScene to stand
 * down. Without that the minimap would be sitting in the corner of a landing
 * page, which reads as a stray artefact rather than as the game.
 *
 * A second WebGL context is a real cost, so this deliberately does not mount
 * on a device that has told us it would rather not have one: `prefers-reduced-
 * motion` gets the still scene, which is also the sensible fallback for
 * anything that fails to give us a context at all.
 */
export default function WorldBackdrop({ fallback }: { fallback: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let cancelled = false;

    // The gate flag has to be set before the scenes start, not after: the HUD
    // is launched by WorldScene, so anything set later lands too late.
    bridge.emit('gated', true);

    void (async () => {
      try {
        const { createGame } = await import('@/game/createGame');
        if (cancelled) return;
        gameRef.current = createGame(parent);
        if (process.env.NODE_ENV !== 'production') {
          (window as DebugWindow).__ambervaleBackdrop = gameRef.current;
        }
      } catch {
        // A backdrop is decoration. If the world will not boot, the still
        // scene underneath is already showing and nobody needs to be told.
      }
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      bridge.reset();
      if (process.env.NODE_ENV !== 'production') {
        delete (window as DebugWindow).__ambervaleBackdrop;
      }
    };
  }, []);

  return (
    <div className="backdrop" aria-hidden>
      {/* The drawn scene sits underneath, so the hero is never blank while
          Phaser loads, and is the whole backdrop when it cannot. */}
      <div className="still" style={{ backgroundImage: `url('${fallback}')` }} />
      <div className="world" ref={hostRef} />

      <style jsx>{`
        .backdrop {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        .still {
          position: absolute;
          inset: 0;
          background-color: #0a2e3d;
          background-position: center bottom;
          background-size: cover;
          background-repeat: no-repeat;
        }
        .world {
          position: absolute;
          inset: 0;
        }
        .world :global(canvas) {
          display: block;
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
    </div>
  );
}
