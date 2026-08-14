import Link from 'next/link';

export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ maxWidth: '32rem' }}>
        <h1 style={{ fontSize: 'clamp(2.5rem, 9vw, 4.5rem)', margin: 0, letterSpacing: '0.08em' }}>
          AMBERVALE
        </h1>
        <p style={{ opacity: 0.75, marginTop: '0.75rem' }}>
          A farm-to-earn browser game. Placeholder landing page — the real title screen arrives in
          Phase 2.
        </p>
        <Link
          href="/play"
          style={{
            display: 'inline-block',
            marginTop: '2rem',
            padding: '0.85rem 2.25rem',
            borderRadius: '999px',
            background: 'var(--amber-glow)',
            color: '#2a1a05',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Play
        </Link>
      </div>
    </main>
  );
}
