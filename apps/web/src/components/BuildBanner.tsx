/**
 * The header on the Build sheet.
 *
 * Drawn from the same shapes and the same palette as the world painters in
 * `game/world/textures.ts`, deliberately — a header in some other illustrator's
 * style would be advertising a different game to the one behind the modal. The
 * eight things in this strip are the eight things that will appear in the vale,
 * in the colours they will appear in.
 *
 * Inline SVG rather than a Phaser texture because the sheet is DOM: the world's
 * versions are baked into a canvas atlas at boot and there is no way to hand one
 * to an <img> without a second render path.
 */

/** The world palette, as CSS. Same numbers as PALETTE, written once here. */
const C = {
  wall: '#f0e2c0',
  wallShade: '#dccaa2',
  roof: '#b5473a',
  roofDark: '#8f3529',
  wood: '#8b5a2b',
  woodDark: '#6b4420',
  stone: '#8a8f98',
  stoneDark: '#6b7079',
  stoneLight: '#a8adb6',
  leaf: '#3f7a3a',
  leafDark: '#2f5e2c',
  leafLight: '#57a44c',
  trunk: '#6b4a2f',
  trunkDark: '#4d3521',
  amber: '#f4b942',
  amberLight: '#f4d35e',
  cream: '#fff3d0',
  gnomon: '#5f6b74',
};

/** A soft contact shadow, so nothing floats. Matches `shadow()` in the atlas. */
const Shade = ({ x, y, rx }: { x: number; y: number; rx: number }) => (
  <ellipse cx={x} cy={y} rx={rx} ry={rx * 0.3} fill="#1d3b22" opacity="0.28" />
);

export default function BuildBanner() {
  return (
    <div className="banner">
      <svg viewBox="0 0 480 132" role="img" aria-label="The eight landmarks">
        <defs>
          <linearGradient id="bb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b4a5c" />
            <stop offset="0.55" stopColor="#3f7d7a" />
            <stop offset="1" stopColor="#7fae63" />
          </linearGradient>
          <linearGradient id="bb-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5b9450" />
            <stop offset="1" stopColor="#3f7238" />
          </linearGradient>
        </defs>

        <rect width="480" height="132" fill="url(#bb-sky)" />
        {/* One low hill so the strip has a horizon rather than a hard join. */}
        <path d="M0 84 Q 120 70 240 80 Q 360 90 480 76 L480 132 L0 132 Z" fill="url(#bb-grass)" />

        {/* garden — a low bed of colour, the first thing anyone can afford */}
        <g transform="translate(32 108)">
          <Shade x={0} y={2} rx={26} />
          <rect x={-24} y={-14} width={48} height={14} rx={3} fill="#7f6a44" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <rect x={-19 + i * 9.5} y={-25} width={1.6} height={12} fill={C.leaf} />
              <circle
                cx={-18.2 + i * 9.5}
                cy={-27}
                r={4}
                fill={['#e4574f', C.amber, '#d98cc8', '#9fe8ff', '#e4574f'][i]}
              />
            </g>
          ))}
        </g>

        {/* well */}
        <g transform="translate(90 110)">
          <Shade x={0} y={1} rx={20} />
          <rect x={-15} y={-20} width={30} height={20} rx={4} fill={C.stoneDark} />
          <rect x={-15} y={-24} width={30} height={8} rx={4} fill={C.stone} />
          <ellipse cx={0} cy={-21} rx={11} ry={3.4} fill="#14232b" />
          <rect x={-12} y={-42} width={2.6} height={20} fill={C.trunk} />
          <rect x={9.4} y={-42} width={2.6} height={20} fill={C.trunk} />
          <path d="M0 -52 L-16 -40 L16 -40 Z" fill={C.roofDark} />
          <path d="M0 -50 L-13 -40 L13 -40 Z" fill={C.roof} />
        </g>

        {/* beehives — three boxes with air between them */}
        <g transform="translate(148 110)">
          <Shade x={0} y={1} rx={24} />
          {[
            { x: -17, n: 3 },
            { x: 0, n: 4 },
            { x: 17, n: 3 },
          ].map((h) => (
            <g key={h.x}>
              {Array.from({ length: h.n }, (_, i) => (
                <rect
                  key={i}
                  x={h.x - 6.5}
                  y={-8 - i * 7}
                  width={13}
                  height={6.4}
                  rx={1.2}
                  fill={i % 2 === 0 ? C.wall : C.wallShade}
                />
              ))}
              <path
                d={`M${h.x} ${-12 - h.n * 7} L${h.x - 8} ${-6 - h.n * 7} L${h.x + 8} ${-6 - h.n * 7} Z`}
                fill={C.woodDark}
              />
            </g>
          ))}
        </g>

        {/* standing stones */}
        <g transform="translate(208 110)">
          <Shade x={0} y={1} rx={26} />
          {[
            [-22, 24, 9],
            [-10, 32, 8.5],
            [2, 36, 9],
            [14, 27, 8],
            [25, 17, 7],
          ].map(([dx, h, w]) => (
            <g key={dx}>
              <rect x={dx!} y={-h!} width={w!} height={h!} rx={2} fill={C.stoneDark} />
              <rect x={dx!} y={-h!} width={w! * 0.45} height={h!} rx={2} fill={C.stoneLight} />
            </g>
          ))}
        </g>

        {/* grain silo */}
        <g transform="translate(266 110)">
          <Shade x={0} y={1} rx={20} />
          <rect x={-13} y={-52} width={26} height={52} rx={3} fill={C.stone} />
          <rect x={-13} y={-52} width={10} height={52} rx={3} fill={C.stoneLight} />
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={-13}
              y={-44 + i * 9}
              width={26}
              height={1.4}
              fill={C.stoneDark}
              opacity="0.75"
            />
          ))}
          <ellipse cx={0} cy={-52} rx={15} ry={9} fill={C.roofDark} />
          <ellipse cx={-2} cy={-54} rx={11} ry={6} fill={C.roof} />
        </g>

        {/* the great oak */}
        <g transform="translate(326 110)">
          <Shade x={0} y={1} rx={26} />
          <rect x={-5} y={-30} width={10} height={30} rx={2.5} fill={C.trunkDark} />
          <rect x={-5} y={-30} width={4} height={30} rx={2.5} fill={C.trunk} />
          <circle cx={-14} cy={-42} r={14} fill={C.leafDark} />
          <circle cx={14} cy={-40} r={13} fill={C.leafDark} />
          <circle cx={0} cy={-48} r={17} fill={C.leaf} />
          <circle cx={-7} cy={-57} r={8.5} fill={C.leafLight} />
        </g>

        {/* watchtower — the tallest thing anyone owns */}
        <g transform="translate(386 110)">
          <Shade x={0} y={1} rx={20} />
          <rect x={-11} y={-16} width={22} height={16} rx={2.5} fill={C.stoneDark} />
          <path d="M-9 -16 L-6 -16 L-4 -40 L-7 -40 Z" fill={C.trunk} />
          <path d="M9 -16 L6 -16 L4 -40 L7 -40 Z" fill={C.trunk} />
          <rect x={-7} y={-28} width={14} height={2.2} fill={C.wood} />
          <rect x={-11} y={-46} width={22} height={5} rx={1.4} fill={C.wood} />
          <rect x={-10} y={-52} width={1.8} height={6} fill={C.trunk} />
          <rect x={8.2} y={-52} width={1.8} height={6} fill={C.trunk} />
          <path d="M0 -64 L-14 -52 L14 -52 Z" fill={C.roofDark} />
          <circle cx={0} cy={-49} r={4.6} fill={C.cream} opacity="0.5" />
          <circle cx={0} cy={-49} r={2.6} fill={C.amberLight} />
        </g>

        {/* sundial */}
        <g transform="translate(444 110)">
          <Shade x={0} y={1} rx={18} />
          <rect x={-7} y={-22} width={14} height={22} rx={2.5} fill={C.stone} />
          <rect x={-7} y={-22} width={5} height={22} rx={2.5} fill={C.stoneLight} />
          <ellipse cx={0} cy={-24} rx={17} ry={6} fill={C.wallShade} />
          <ellipse cx={0} cy={-25} rx={14} ry={4.6} fill={C.wall} />
          <path d="M0 -42 L0 -25 L11 -25 Z" fill={C.gnomon} />
        </g>
      </svg>

      <style jsx>{`
        .banner {
          margin: 0 0 0.85rem;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(245, 230, 200, 0.14);
          line-height: 0;
        }
        .banner svg {
          display: block;
          width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}
