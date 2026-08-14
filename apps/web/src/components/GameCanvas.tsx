'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { bridge } from '@/game/bridge';
import { authGuest, type FarmState } from '@/lib/api';
import { audio } from '@/lib/audio';
import Controls from './Controls';
import Hud from './Hud';
import ModalHost from './ModalHost';
import TitleScreen from './TitleScreen';
import TutorialBanner from './TutorialBanner';
import Toasts from './Toasts';

type DebugWindow = Window & { __ambervaleGame?: Phaser.Game };

/**
 * Mounts the Phaser game and owns the React side of the shell.
 *
 * Auth and the initial farm read happen here, not in the scene: the world can
 * boot and run its title camera while the network is still in flight, so a
 * slow connection shows a living farm rather than a spinner.
 */
export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const [farm, setFarm] = useState<FarmState | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { farm: state } = await authGuest();
      state.__receivedAt = Date.now();
      setFarm(state);
      bridge.emit('farm', state);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not reach the farm. ${err.message}`
          : 'Could not reach the farm.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Boot Phaser. Strict Mode double-invokes effects in dev, so creation is
  // guarded by a cancellation flag — otherwise every mount leaks a WebGL
  // context.
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
        (window as DebugWindow).__ambervaleGame = gameRef.current;
      }
    })();

    return () => {
      cancelled = true;
      document.body.classList.remove('playing');
      gameRef.current?.destroy(true);
      gameRef.current = null;
      bridge.reset();
      if (process.env.NODE_ENV !== 'production') {
        delete (window as DebugWindow).__ambervaleGame;
      }
    };
  }, []);

  // Strict Mode double-invokes effects in dev; one auth call is enough.
  const connectedRef = useRef(false);
  useEffect(() => {
    if (connectedRef.current) return;
    connectedRef.current = true;
    void connect();
  }, [connect]);

  const handleStart = useCallback(() => {
    // Browsers only allow an AudioContext to start inside a user gesture.
    audio.resume();
    setStarted(true);
    bridge.emit('start', undefined);
  }, []);

  return (
    <>
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
      {!started ? (
        <TitleScreen
          farm={farm}
          loading={loading}
          error={error}
          onStart={handleStart}
          onRetry={() => void connect()}
        />
      ) : (
        <>
          <Hud onOpen={(modal) => bridge.emit('modal', modal)} />
          <TutorialBanner />
          <Controls />
          <ModalHost />
        </>
      )}
      <Toasts />
    </>
  );
}
