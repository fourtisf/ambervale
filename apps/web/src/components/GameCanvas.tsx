'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { bridge } from '@/game/bridge';
import { authGuest, fetchInvite, type FarmState } from '@/lib/api';
import { audio } from '@/lib/audio';
import Controls from './Controls';
import InviteGate from './InviteGate';
import Hud from './Hud';
import { AwayWatcher } from './EconomyModals';
import ModalHost from './ModalHost';
import TitleScreen from './TitleScreen';
import TutorialBanner from './TutorialBanner';
import Toasts from './Toasts';

type DebugWindow = Window & { __ambervaleGame?: Phaser.Game };

/**
 * How many times one tab may auto-reload itself after a lost GPU context.
 *
 * A machine that keeps dropping the context would otherwise reload forever.
 * After the cap the page stays up and says so, which is at least diagnosable.
 */
const MAX_CONTEXT_RELOADS = 2;
const RELOAD_KEY = 'ambervale.contextReloads';

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
  /** null while we do not yet know whether the door is locked. */
  const [gated, setGated] = useState<boolean | null>(null);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ask the gate first. Calling /auth/guest without a pass returns 403,
      // and "Could not reach the farm" is the wrong thing to tell someone who
      // simply has not typed their code yet.
      const invite = await fetchInvite();
      if (invite.required && !invite.ok) {
        setGated(true);
        setLoading(false);
        return;
      }
      setGated(false);

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
    let detach: (() => void) | undefined;
    document.body.classList.add('playing');

    void (async () => {
      const { createGame } = await import('@/game/createGame');
      if (cancelled) return;
      gameRef.current = createGame(parent);
      if (process.env.NODE_ENV !== 'production') {
        (window as DebugWindow).__ambervaleGame = gameRef.current;
      }
      detach = watchContext(gameRef.current);
    })();

    return () => {
      cancelled = true;
      detach?.();
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
  // (watchContext is defined below the component, next to its constants.)
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

  if (gated) {
    return (
      <InviteGate
        onPass={() => {
          setGated(false);
          void connect();
        }}
      />
    );
  }

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
          <AwayWatcher />
        </>
      )}
      <Toasts />
    </>
  );
}

/**
 * Recovers from a lost WebGL context.
 *
 * When the GPU drops the context the canvas freezes on its last frame while
 * React carries on, so the HUD stays live and the joystick still moves its
 * knob — the world simply never advances. It is indistinguishable from a
 * gameplay bug unless something says otherwise, so this says otherwise.
 *
 * Reloading is the honest fix rather than a heavy-handed one: the farm is
 * entirely server-side, so a reload costs a few seconds and loses nothing.
 */
function watchContext(game: Phaser.Game): () => void {
  const canvas = game.canvas;
  if (!canvas) return () => {};

  const onLost = (event: Event) => {
    // Preventing the default is what allows a restore to be attempted at all.
    event.preventDefault();

    const seen = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0');
    if (seen >= MAX_CONTEXT_RELOADS) {
      bridge.toast('bad', 'Graphics keep failing on this device. Try closing some tabs.');
      return;
    }

    sessionStorage.setItem(RELOAD_KEY, String(seen + 1));
    bridge.toast('bad', 'Graphics context lost — reloading. Your farm is safe.');
    window.setTimeout(() => window.location.reload(), 1200);
  };

  const onRestored = () => {
    sessionStorage.setItem(RELOAD_KEY, '0');
  };

  // A tab returning to the foreground may come back with the loop asleep.
  const onVisible = () => {
    if (document.visibilityState === 'visible') game.loop.wake();
  };

  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
