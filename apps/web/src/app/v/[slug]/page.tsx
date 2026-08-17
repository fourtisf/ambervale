'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

// Phaser needs a real DOM and a WebGL context, so a visit is client-only too.
const VisitCanvas = dynamic(() => import('@/components/VisitCanvas'), {
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
      WALKING OVER…
    </div>
  ),
});

export default function VisitPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0]! : params.slug;
  return <VisitCanvas slug={slug} />;
}
