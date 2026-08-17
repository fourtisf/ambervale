/**
 * The header on the Build sheet.
 *
 * A flat row of eight icons on a green strip is a legend, not a shop window.
 * This is a scene: dusk over the vale, the sun low behind the ridge, and the
 * eight things standing in it at three different distances — near ones large
 * and warm, far ones small and washed into the haze.
 *
 * Colours come from the world painters in `game/world/textures.ts` and nowhere
 * else. The same stone greys, the same roof red, the same three greens in the
 * oak. A header in another illustrator's palette would be advertising a
 * different game to the one running behind the modal.
 *
 * Inline SVG rather than the game's own textures because the sheet is DOM:
 * those are baked into a canvas atlas at boot, and handing one to an <img>
 * would mean a second render path for a picture that never changes.
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

/** Sun position, in viewBox units. Everything is lit and shaded from here. */
const SUN = { x: 322, y: 80 };

/**
 * A cast shadow running toward the viewer and away from the sun's x.
 *
 * The single cheapest thing that stops a silhouette reading as a sticker: it
 * puts the object *on* the ground rather than in front of it.
 */
function Cast({ x, y, w, len }: { x: number; y: number; w: number; len: number }) {
  const off = (x - SUN.x) * 0.22;
  return (
    <path
      d={`M${x - w} ${y} L${x + w} ${y} L${x + w * 1.5 + off} ${y + len} L${x - w * 1.5 + off} ${y + len} Z`}
      fill="#12301f"
      opacity="0.3"
      filter="url(#bb-soft)"
    />
  );
}

/** A conifer for the far ridge — small, and only ever a silhouette. */
const Pine = ({ x, y, h }: { x: number; y: number; h: number }) => (
  <path
    d={`M${x} ${y - h} L${x + h * 0.3} ${y} L${x - h * 0.3} ${y} Z`}
    fill="#224936"
    opacity="0.55"
  />
);

export default function BuildBanner() {
  return (
    <div className="banner">
      <svg viewBox="0 0 480 168" role="img" aria-label="The vale at dusk, with every landmark">
        <defs>
          {/* Dusk, taken from the game's own night cycle rather than invented:
              deep teal overhead falling to amber at the horizon. */}
          <linearGradient id="bb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16455a" />
            <stop offset="0.34" stopColor="#2a6472" />
            <stop offset="0.62" stopColor="#5c8f6e" />
            <stop offset="0.84" stopColor="#c08d4e" />
            <stop offset="1" stopColor="#f0b968" />
          </linearGradient>
          <radialGradient id="bb-bloom" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff3d0" stopOpacity="0.85" />
            <stop offset="0.42" stopColor="#f4b942" stopOpacity="0.22" />
            <stop offset="1" stopColor="#f4b942" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bb-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5d8f68" />
            <stop offset="1" stopColor="#4a7a58" />
          </linearGradient>
          <linearGradient id="bb-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#42783c" />
            <stop offset="1" stopColor="#33602f" />
          </linearGradient>
          <linearGradient id="bb-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c5528" />
            <stop offset="1" stopColor="#1d3d1c" />
          </linearGradient>
          <linearGradient id="bb-vig" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#031018" stopOpacity="0.22" />
            <stop offset="0.4" stopColor="#031018" stopOpacity="0" />
            <stop offset="1" stopColor="#031018" stopOpacity="0.34" />
          </linearGradient>
          <filter id="bb-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
          <filter id="bb-haze" x="-40%" y="-300%" width="180%" height="700%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <rect width="480" height="168" fill="url(#bb-sky)" />

        {/* the sun, low and behind everything */}
        <circle cx={SUN.x} cy={SUN.y} r={74} fill="url(#bb-bloom)" />
        <circle cx={SUN.x} cy={SUN.y} r={21} fill="#ffe6ae" opacity="0.9" />

        {/* far ridge, its treeline, and the warm air pooling along it */}
        <path d="M0 88 Q 110 76 232 84 Q 350 91 480 78 L480 168 L0 168 Z" fill="url(#bb-far)" />
        {[18, 40, 58, 74, 96, 118, 150, 176, 206, 236, 268, 300, 340, 372, 404, 436, 462].map(
          (x, i) => (
            <Pine key={x} x={x} y={86 + Math.sin(i) * 3} h={9 + ((i * 7) % 6)} />
          ),
        )}
        <ellipse
          cx={SUN.x}
          cy={87}
          rx={190}
          ry={7}
          fill="#f4b942"
          opacity="0.5"
          filter="url(#bb-haze)"
        />

        {/* --- far distance: the two tallest, small and hazy --------------- */}
        <g opacity="0.72">
          {/* grain silo */}
          <g transform="translate(150 92)">
            <rect x={-7} y={-30} width={14} height={30} rx={2} fill={C.stone} />
            <rect x={-7} y={-30} width={5} height={30} rx={2} fill={C.stoneLight} />
            <ellipse cx={0} cy={-30} rx={9} ry={5} fill={C.roofDark} />
          </g>
          {/* watchtower */}
          <g transform="translate(408 88)">
            <rect x={-6} y={-9} width={12} height={9} rx={1.5} fill={C.stoneDark} />
            <path d="M-5 -9 L-3 -9 L-2 -25 L-4 -25 Z" fill={C.trunk} />
            <path d="M5 -9 L3 -9 L2 -25 L4 -25 Z" fill={C.trunk} />
            <rect x={-7} y={-29} width={14} height={3.4} rx={1} fill={C.wood} />
            <path d="M0 -39 L-9 -30 L9 -30 Z" fill={C.roofDark} />
            <circle cx={0} cy={-31} r={3.4} fill={C.amberLight} opacity="0.45" />
            <circle cx={0} cy={-31} r={1.7} fill={C.cream} />
          </g>
        </g>

        {/* --- middle ground ---------------------------------------------- */}
        <path
          d="M0 114 Q 130 104 258 112 Q 380 119 480 108 L480 168 L0 168 Z"
          fill="url(#bb-mid)"
        />

        <Cast x={64} y={114} w={22} len={16} />
        <Cast x={236} y={116} w={14} len={18} />

        {/* standing stones */}
        <g transform="translate(64 114)">
          {[
            [-20, 18, 7.5],
            [-9, 25, 7],
            [2, 28, 7.5],
            [13, 20, 6.5],
            [23, 13, 6],
          ].map(([dx, h, w]) => (
            <g key={dx}>
              <rect x={dx!} y={-h!} width={w!} height={h!} rx={2} fill={C.stoneDark} />
              <rect
                x={dx! + w! * 0.55}
                y={-h!}
                width={w! * 0.45}
                height={h!}
                rx={2}
                fill={C.stoneLight}
              />
            </g>
          ))}
        </g>

        {/* beehives */}
        <g transform="translate(236 116)">
          {[
            { x: -14, n: 3 },
            { x: 0, n: 4 },
            { x: 14, n: 3 },
          ].map((h) => (
            <g key={h.x}>
              {Array.from({ length: h.n }, (_, i) => (
                <rect
                  key={i}
                  x={h.x - 5.4}
                  y={-6 - i * 5.6}
                  width={10.8}
                  height={5.1}
                  rx={1}
                  fill={i % 2 === 0 ? C.wall : C.wallShade}
                />
              ))}
              <path
                d={`M${h.x} ${-9.5 - h.n * 5.6} L${h.x - 6.6} ${-4.6 - h.n * 5.6} L${h.x + 6.6} ${-4.6 - h.n * 5.6} Z`}
                fill={C.woodDark}
              />
            </g>
          ))}
        </g>

        {/* --- near ground: the big ones, warm and detailed ---------------- */}
        <path
          d="M0 142 Q 150 134 300 141 Q 400 145 480 137 L480 168 L0 168 Z"
          fill="url(#bb-near)"
        />

        <Cast x={30} y={146} w={24} len={10} />
        <Cast x={124} y={144} w={13} len={13} />
        <Cast x={322} y={146} w={26} len={13} />
        <Cast x={430} y={142} w={16} len={12} />

        {/* flower garden */}
        <g transform="translate(30 146)">
          <rect x={-23} y={-11} width={46} height={11} rx={2.5} fill="#7f6a44" />
          <rect x={-23} y={-11} width={46} height={3} rx={2.5} fill="#96805a" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              {/* Stems start inside the bed and are drawn in the light green,
                  not the dark one: at leaf-dark on dusk grass they vanished and
                  the flowers read as five dots floating over a plank. */}
              <rect x={-18 + i * 9} y={-19} width={1.8} height={9} fill={C.leafLight} />
              <circle
                cx={-17.1 + i * 9}
                cy={-20.5}
                r={3.4}
                fill={['#e4574f', C.amber, '#d98cc8', '#9fe8ff', '#e4574f'][i]}
              />
              <circle cx={-17.1 + i * 9} cy={-21.3} r={1.1} fill={C.cream} opacity="0.85" />
            </g>
          ))}
        </g>

        {/* stone well */}
        <g transform="translate(124 144)">
          <rect x={-13} y={-17} width={26} height={17} rx={3.5} fill={C.stoneDark} />
          <rect x={-13} y={-20} width={26} height={7} rx={3.5} fill={C.stone} />
          <rect x={5} y={-20} width={8} height={7} rx={3.5} fill={C.stoneLight} />
          <ellipse cx={0} cy={-17.5} rx={9.5} ry={3} fill="#14232b" />
          <rect x={-10.5} y={-36} width={2.4} height={17} fill={C.trunk} />
          <rect x={8.1} y={-36} width={2.4} height={17} fill={C.trunk} />
          <path d="M0 -45 L-14.5 -34 L14.5 -34 Z" fill={C.roofDark} />
          <path d="M0 -43.5 L1 -34 L14.5 -34 Z" fill={C.roof} />
        </g>

        {/* the great oak — the near anchor, and the only thing that crosses the
            sun, which is what stops the strip reading as a shelf of goods */}
        <g transform="translate(322 146)">
          <rect x={-4.5} y={-26} width={9} height={26} rx={2} fill={C.trunkDark} />
          <rect x={-4.5} y={-26} width={3.4} height={26} rx={2} fill={C.trunk} />
          <circle cx={-13} cy={-36} r={13} fill={C.leafDark} />
          <circle cx={13} cy={-34} r={12} fill={C.leafDark} />
          <circle cx={0} cy={-42} r={15.5} fill={C.leaf} />
          <circle cx={7} cy={-49} r={7.5} fill={C.leafLight} />
          <circle cx={-6} cy={-46} r={5.5} fill={C.leafLight} opacity="0.7" />
        </g>

        {/* sundial */}
        <g transform="translate(430 142)">
          <rect x={-6} y={-19} width={12} height={19} rx={2} fill={C.stone} />
          <rect x={0.5} y={-19} width={5.5} height={19} rx={2} fill={C.stoneLight} />
          <ellipse cx={0} cy={-21} rx={15} ry={5.4} fill={C.wallShade} />
          <ellipse cx={0} cy={-22} rx={12.4} ry={4.2} fill={C.wall} />
          <path d="M0 -36 L0 -22 L9.5 -22 Z" fill={C.gnomon} />
        </g>

        {/* fireflies, the way the game draws them at dusk */}
        {[
          [92, 118],
          [180, 132],
          [268, 110],
          [356, 128],
          [402, 118],
          [148, 140],
          [300, 136],
        ].map(([x, y], i) => (
          <circle key={x} cx={x} cy={y} r={i % 2 ? 1.5 : 1.1} fill={C.amberLight} opacity="0.6" />
        ))}

        <rect width="480" height="168" fill="url(#bb-vig)" />
      </svg>

      <style jsx>{`
        .banner {
          margin: 0 0 0.9rem;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(245, 230, 200, 0.16);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
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
