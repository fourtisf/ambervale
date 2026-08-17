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
  woodLight: '#a6733c',
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

function BuildScene() {
  return (
    <>
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
      <path d="M0 114 Q 130 104 258 112 Q 380 119 480 108 L480 168 L0 168 Z" fill="url(#bb-mid)" />

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
      <path d="M0 142 Q 150 134 300 141 Q 400 145 480 137 L480 168 L0 168 Z" fill="url(#bb-near)" />

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
    </>
  );
}

/** Buy seeds — the field, one crop at every stage of its life. */
function BuyScene() {
  const row = (x: number, y: number, s: number, stage: number, colour: string) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={0} rx={19} ry={6} fill="#6f5231" />
      <ellipse cx={0} cy={-1.5} rx={16} ry={4.6} fill="#8a6a41" />
      {stage === 0 && <circle cx={0} cy={-4} r={2.6} fill={C.leafLight} />}
      {stage >= 1 && <rect x={-1.4} y={-14} width={2.8} height={13} fill={C.leaf} />}
      {stage >= 1 && <ellipse cx={-6} cy={-11} rx={5.5} ry={3} fill={C.leafLight} />}
      {stage >= 1 && <ellipse cx={6} cy={-13} rx={5.5} ry={3} fill={C.leafLight} />}
      {stage >= 2 && <circle cx={0} cy={-19} r={7} fill={colour} />}
      {stage >= 2 && <circle cx={0} cy={-19} r={3} fill={C.cream} opacity="0.8" />}
    </g>
  );

  return (
    <>
      {/* far: two rows just breaking the soil */}
      <g opacity="0.72">
        {row(96, 92, 0.6, 0, C.amber)}
        {row(178, 90, 0.6, 1, C.amber)}
        {row(300, 91, 0.6, 1, C.amber)}
        {row(392, 89, 0.6, 0, C.amber)}
      </g>

      <path d="M0 114 Q 130 104 258 112 Q 380 119 480 108 L480 168 L0 168 Z" fill="url(#bb-mid)" />
      <g>
        {row(74, 118, 0.85, 1, C.amber)}
        {row(196, 120, 0.85, 2, '#e8863c')}
        {row(322, 119, 0.85, 1, C.amber)}
        {row(430, 117, 0.85, 2, '#e4574f')}
      </g>

      <path d="M0 142 Q 150 134 300 141 Q 400 145 480 137 L480 168 L0 168 Z" fill="url(#bb-near)" />
      <Cast x={62} y={150} w={20} len={11} />
      <Cast x={196} y={152} w={20} len={11} />
      <Cast x={330} y={151} w={20} len={11} />
      <Cast x={432} y={148} w={20} len={11} />
      {row(62, 150, 1.25, 2, C.amber)}
      {row(196, 152, 1.25, 2, '#e8863c')}
      {row(330, 151, 1.25, 2, '#9fe8ff')}
      {row(432, 148, 1.25, 1, C.amber)}
    </>
  );
}

/** Sell — the stall, its striped awning, and what is on the counter. */
function SellScene() {
  return (
    <>
      <g opacity="0.7">
        <g transform="translate(96 92)">
          <rect x={-16} y={-13} width={32} height={13} rx={2} fill={C.wood} />
          <path d="M-19 -13 L19 -13 L14 -22 L-14 -22 Z" fill={C.roofDark} />
        </g>
        <g transform="translate(404 90)">
          <rect x={-14} y={-12} width={28} height={12} rx={2} fill={C.wood} />
          <path d="M-17 -12 L17 -12 L12 -20 L-12 -20 Z" fill={C.roofDark} />
        </g>
      </g>

      <path d="M0 114 Q 130 104 258 112 Q 380 119 480 108 L480 168 L0 168 Z" fill="url(#bb-mid)" />
      <Cast x={110} y={118} w={22} len={14} />
      <Cast x={382} y={116} w={20} len={14} />
      {/* barrels and sacks, the trade going on around the stall */}
      <g transform="translate(110 118)">
        <rect x={-20} y={-16} width={16} height={16} rx={3} fill={C.woodDark} />
        <rect x={-20} y={-16} width={6} height={16} rx={3} fill={C.wood} />
        <rect x={2} y={-13} width={15} height={13} rx={3} fill={C.wallShade} />
        <rect x={2} y={-13} width={6} height={13} rx={3} fill={C.wall} />
      </g>
      <g transform="translate(382 116)">
        <rect x={-14} y={-14} width={14} height={14} rx={3} fill={C.woodDark} />
        <rect x={2} y={-10} width={12} height={10} rx={2.5} fill={C.wood} />
      </g>

      <path d="M0 142 Q 150 134 300 141 Q 400 145 480 137 L480 168 L0 168 Z" fill="url(#bb-near)" />
      <Cast x={240} y={150} w={54} len={13} />
      {/* the stall itself, drawn from the world's market painter */}
      <g transform="translate(240 150)">
        <rect x={-48} y={-30} width={96} height={30} rx={3} fill={C.wood} />
        <rect x={-48} y={-30} width={96} height={5} rx={3} fill={C.woodLight} />
        <rect x={-52} y={-64} width={5} height={34} fill={C.woodDark} />
        <rect x={47} y={-64} width={5} height={34} fill={C.woodDark} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d={`M${-50 + i * 16.7} -64 L${-33.3 + i * 16.7} -64 L${-30 + i * 16.7} -50 L${-46.7 + i * 16.7} -50 Z`}
            fill={i % 2 === 0 ? C.roof : C.cream}
          />
        ))}
        {/* goods on the counter */}
        <rect x={-38} y={-42} width={20} height={12} rx={2} fill={C.woodLight} />
        <circle cx={-6} cy={-36} r={6} fill={C.leafLight} />
        <circle cx={8} cy={-34} r={5} fill="#e8863c" />
        <circle cx={26} cy={-36} r={5.5} fill={C.amber} />
        <circle cx={26} cy={-37} r={2} fill={C.cream} opacity="0.85" />
      </g>
    </>
  );
}

/** Upgrades — the mill and the barn, the two buildings work comes out of. */
function UpgradesScene() {
  return (
    <>
      <g opacity="0.7">
        <g transform="translate(110 92)">
          <path d="M-9 0 L-6 -26 L6 -26 L9 0 Z" fill={C.wall} />
          <path d="M-11 -26 L0 -37 L11 -26 Z" fill={C.roofDark} />
        </g>
        <g transform="translate(392 90)">
          <rect x={-13} y={-18} width={26} height={18} rx={2} fill={C.roofDark} />
          <path d="M-16 -18 L0 -30 L16 -18 Z" fill={C.woodDark} />
        </g>
      </g>

      <path d="M0 114 Q 130 104 258 112 Q 380 119 480 108 L480 168 L0 168 Z" fill="url(#bb-mid)" />
      <Cast x={372} y={120} w={30} len={14} />
      {/* the barn */}
      <g transform="translate(372 120)">
        <rect x={-28} y={-30} width={56} height={30} rx={2.5} fill={C.roof} />
        <rect x={-28} y={-12} width={56} height={12} fill={C.roofDark} />
        <path d="M-32 -30 L-16 -44 L16 -44 L32 -30 Z" fill={C.woodDark} />
        <rect x={-9} y={-24} width={18} height={24} fill={C.wall} />
        <rect x={-1.2} y={-24} width={2.4} height={24} fill={C.woodDark} />
        <circle cx={0} cy={-37} r={4} fill={C.amber} />
      </g>

      <path d="M0 142 Q 150 134 300 141 Q 400 145 480 137 L480 168 L0 168 Z" fill="url(#bb-near)" />
      <Cast x={150} y={150} w={26} len={13} />
      {/* the windmill, sails turning over the near ridge */}
      <g transform="translate(150 150)">
        <path d="M-18 0 L-11 -50 L11 -50 L18 0 Z" fill={C.wall} />
        <path d="M4 -50 L11 -50 L18 0 L8 0 Z" fill={C.wallShade} />
        <path d="M-14 -50 L0 -64 L14 -50 Z" fill={C.roof} />
        <rect x={-6} y={-40} width={12} height={12} rx={2} fill={C.amber} />
        <rect x={-5} y={-18} width={10} height={18} rx={1.5} fill={C.woodDark} />
        <g transform="rotate(18 0 -58)">
          {[0, 90, 180, 270].map((a) => (
            <g key={a} transform={`rotate(${a} 0 -58)`}>
              <rect x={-1.6} y={-90} width={3.2} height={32} rx={1} fill={C.woodDark} />
              <rect x={1.6} y={-88} width={8} height={24} fill={C.cream} opacity="0.85" />
            </g>
          ))}
          <circle cx={0} cy={-58} r={3.4} fill={C.woodDark} />
        </g>
      </g>
    </>
  );
}

export type ShopScene = 'buy' | 'sell' | 'upgrades' | 'build';

const LABEL: Record<ShopScene, string> = {
  buy: 'The field, with a crop at every stage',
  sell: 'The market stall at dusk',
  upgrades: 'The mill and the barn',
  build: 'The vale at dusk, with every landmark',
};

/**
 * One scaffold, four subjects.
 *
 * The sky, the three ground planes, the haze and the fireflies are identical
 * across every tab on purpose — four headers in four different treatments would
 * read as four different screens rather than four shelves of one shop.
 */
export default function ShopBanner({ scene = 'build' }: { scene?: ShopScene }) {
  return (
    <div className="banner">
      <svg viewBox="0 0 480 168" role="img" aria-label={LABEL[scene]}>
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
        {scene === 'buy' ? (
          <BuyScene />
        ) : scene === 'sell' ? (
          <SellScene />
        ) : scene === 'upgrades' ? (
          <UpgradesScene />
        ) : (
          <BuildScene />
        )}

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
