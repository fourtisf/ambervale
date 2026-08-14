'use client';

import dynamic from 'next/dynamic';

// Phaser needs a real DOM and a WebGL context, so /play is client-only.
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#0a2e3d',
        color: '#f5e6c8',
        letterSpacing: '0.2em',
        fontSize: '0.8rem',
      }}
    >
      LOADING…
    </div>
  ),
});

export default function PlayPage() {
  return <GameCanvas />;
}
