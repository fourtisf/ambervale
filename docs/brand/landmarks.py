"""
The landmarks banner: the same vale, empty and then not.

A row of eight buildings with prices under them is a shop window, and this
feature is not a shop — it is the answer to "a farm at hour twenty and a farm
at hour two were pixel-identical". So the banner argues that instead: one
continuous meadow, bare on the left, crowded with everything you built on the
right, and the sun low behind the built half so the silhouettes read as a
skyline rather than as a product grid.

Everything is backlit on purpose. Silhouette hides that these are simple
shapes, and it puts the emphasis where the feature's value actually is — the
outline of a farm that has had twenty hours put into it.
"""

import math
import random
import sys

sys.path.insert(0, '/tmp/claude-0/-home-user-ambervale/7288ee65-67c1-5aa4-85f0-6d76b626d884/scratchpad')
from gen import ridge_y, ridge_path, GRAIN, grain_rect

W, H = 1600, 900

R = [dict(base=470, amp=15, wl=1240, phase=0.4),
     dict(base=576, amp=13, wl=940, phase=2.1),
     dict(base=686, amp=10, wl=1460, phase=4.0)]
FG = dict(base=800, amp=8, wl=1080, phase=1.1)

INK = '#06160e'
RIM = '#ffd08a'
SUN_X, SUN_Y, SUN_R = 1180, 470, 124


def lit(shape):
    """Draws the shape twice: a warm copy nudged toward the sun, then the dark
    one over it. A flat black silhouette reads as a hole in the picture; a
    two-pixel rim on the sun side reads as an object standing in light."""
    return ('<g transform="translate(-5 -5)" fill="%s" opacity="0.95">%s</g>'
            '<g transform="translate(-2.5 -2.5)" fill="%s" opacity="0.55">%s</g>'
            '<g fill="%s">%s</g>' % (RIM, shape, '#c98a48', shape, INK, shape))


# --- the eight ------------------------------------------------------------

def well(x, b, s):
    return ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
            % (x - 26 * s, b - 34 * s, 52 * s, 34 * s, 5 * s,
               x - 21 * s, b - 88 * s, 5 * s, 56 * s,
               x + 16 * s, b - 88 * s, 5 * s, 56 * s,
               x, b - 116 * s, x - 36 * s, b - 84 * s, x + 36 * s, b - 84 * s))


def stones(x, b, s):
    out = []
    for dx, h, w in ((-46, 52, 15), (-20, 74, 14), (6, 84, 15), (34, 62, 13), (58, 38, 12)):
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
                   % (x + dx * s, b - h * s, w * s, h * s, 4 * s))
    return "".join(out)


def silo(x, b, s):
    return ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
            '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f"/>'
            % (x - 26 * s, b - 142 * s, 52 * s, 142 * s, 6 * s,
               x, b - 142 * s, 30 * s, 22 * s))


def watchtower(x, b, s):
    return ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
            % (x - 30 * s, b - 40 * s, 60 * s, 40 * s, 4 * s,
               x - 26 * s, b - 40 * s, x - 13 * s, b - 150 * s,
               x + 13 * s, b - 150 * s, x + 26 * s, b - 40 * s,
               x - 20 * s, b - 96 * s, 40 * s, 6 * s,
               x - 32 * s, b - 168 * s, 64 * s, 20 * s, 3 * s,
               x, b - 206 * s, x - 38 * s, b - 166 * s, x + 38 * s, b - 166 * s))


def greatoak(x, b, s):
    return ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f"/>'
            % (x - 11 * s, b - 88 * s, 22 * s, 88 * s, 5 * s,
               x - 46 * s, b - 116 * s, 44 * s,
               x + 46 * s, b - 112 * s, 41 * s,
               x, b - 146 * s, 54 * s,
               x - 14 * s, b - 178 * s, 30 * s))


def sundial(x, b, s):
    return ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
            '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
            % (x - 15 * s, b - 60 * s, 30 * s, 60 * s, 4 * s,
               x, b - 62 * s, 40 * s, 13 * s,
               x, b - 106 * s, x, b - 64 * s, x + 26 * s, b - 64 * s))


def beehives(x, b, s):
    out = []
    for dx, n in ((-38, 3), (0, 4), (38, 3)):
        for i in range(n):
            out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
                       % (x + (dx - 15) * s, b - (16 + i * 15) * s, 30 * s, 14 * s, 2 * s))
        out.append('<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
                   % (x + dx * s, b - (24 + n * 15) * s,
                      x + (dx - 20) * s, b - (12 + n * 15) * s,
                      x + (dx + 20) * s, b - (12 + n * 15) * s))
    return "".join(out)


def garden(x, b, s):
    out = ['<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
           % (x - 58 * s, b - 26 * s, 116 * s, 26 * s, 5 * s)]
    for i, (dx, hh) in enumerate(((-44, 30), (-26, 40), (-7, 34), (12, 44), (31, 32), (48, 38))):
        fx = x + dx * s
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f"/>'
                   % (fx - 2.2 * s, b - (22 + hh) * s, 4.4 * s, hh * s))
        out.append('<circle cx="%.1f" cy="%.1f" r="%.1f"/>' % (fx, b - (24 + hh) * s, 10 * s))
    return "".join(out)


def farmer(x, b, h):
    head_r = h * 0.165
    brim_rx = h * 0.255
    body_w = h * 0.26
    leg_h = h * 0.20
    hip = b - leg_h
    shoulder = hip - h * 0.26
    head_y = shoulder - head_r * 0.92
    brim_y = head_y - head_r * 0.42
    return ('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f"/>'
            '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f"/>'
            '<path d="M %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f Z"/>'
            '<circle cx="%.2f" cy="%.2f" r="%.2f"/>'
            '<ellipse cx="%.2f" cy="%.2f" rx="%.2f" ry="%.2f"/>'
            % (x - body_w * 0.46, hip, body_w * 0.32, leg_h, body_w * 0.10,
               x + body_w * 0.14, hip, body_w * 0.32, leg_h, body_w * 0.10,
               x - body_w * 0.44, hip + h * 0.02, x - body_w * 0.52, shoulder,
               x + body_w * 0.52, shoulder, x + body_w * 0.44, hip + h * 0.02,
               x, head_y, head_r,
               x, brim_y, brim_rx, head_r * 0.40))


def pine(x, base, h, fill):
    w = h * 0.56
    out = ['<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
           % (x - h * 0.036, base - h * 0.13, h * 0.072, h * 0.15, fill)]
    for i, f in enumerate((1.0, 0.76, 0.48)):
        y = base - h * (0.13 + 0.27 * i)
        top = base - h * (0.13 + 0.27 * i + 0.41)
        half = w * f / 2
        out.append('<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
                   % (x, top, x + half, y, x - half, y, fill))
    return "".join(out)


def build():
    random.seed(20260817)

    def clumps(lo, hi, groups, per, spread):
        out = []
        for g in range(groups):
            c = lo + (hi - lo) * (g + 0.5) / groups + random.uniform(-40, 40)
            out += [c + random.uniform(-spread, spread) for _ in range(random.randint(per - 1, per + 2))]
        return out

    far = "".join(pine(x, ridge_y(x, **R[0]) + 3, random.uniform(16, 27), '#2a4034')
                  for x in clumps(-40, W + 40, 11, 4, 44))
    mid = "".join(pine(x, ridge_y(x, **R[1]) + 3, random.uniform(28, 46), '#182d23')
                  for x in clumps(-30, W + 30, 8, 3, 52))

    rays = "".join(
        '<path d="M %d %d L %.0f %.0f L %.0f %.0f Z" fill="#ffd489" opacity="%.3f"/>'
        % (SUN_X, SUN_Y,
           SUN_X + math.cos(math.radians(a)) * 900, SUN_Y + math.sin(math.radians(a)) * 900,
           SUN_X + math.cos(math.radians(a + 5)) * 900, SUN_Y + math.sin(math.radians(a + 5)) * 900, op)
        for a, op in ((-172, 0.05), (-148, 0.036), (-124, 0.05), (-100, 0.03),
                      (-72, 0.042), (-46, 0.032), (-20, 0.04)))

    # The eight, placed by depth rather than in a row. A row is a product grid;
    # staggered across three ridges is a place.
    # Declared once each, so the same table drives the silhouette and the
    # shadow it throws. Far ridge first, near ridge second: painted in reading
    # order the watchtower — on the *further* ridge — overlapped the great oak
    # in front of it and the depth of the whole scene collapsed.
    PLACED = [
        (beehives, 700, 1, 1.05, 58, 84),
        (stones, 968, 1, 1.30, 70, 84),
        (silo, 1096, 1, 1.20, 30, 164),
        (watchtower, 1352, 1, 1.30, 38, 206),
        (garden, 612, 2, 0.95, 58, 60),
        (well, 838, 2, 1.25, 36, 116),
        (greatoak, 1268, 2, 1.25, 92, 208),
        (sundial, 1478, 2, 1.15, 40, 106),
    ]

    marks, shadows = [], []
    for fn, x, ri, sc, halfw, ht in PLACED:
        b = ridge_y(x, **R[ri]) + (4 if ri == 1 else 6)
        marks.append(lit(fn(x, b, sc)))
        # The sun sits low and behind, so shadows run toward the viewer and
        # splay away from its x. This is the single cheapest thing that turns a
        # row of cut-outs into objects standing on ground in late light.
        hw = halfw * sc
        length = ht * sc * 0.5
        off = (x - SUN_X) * 0.30
        shadows.append(
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="#02100a" opacity="0.34"/>'
            % (x - hw, b, x + hw, b,
               x + hw * 1.25 + off, b + length, x - hw * 1.25 + off, b + length))
    marks = "".join(marks)
    shadows = '<g filter="url(#soften)">%s</g>' % "".join(shadows)

    # Warm air pooling along every crest. Without it the ridges are three flat
    # cut-outs; with it there is distance between them.
    haze = "".join(
        '<ellipse cx="%d" cy="%.1f" rx="%d" ry="%d" fill="#ffc477" opacity="%.2f" filter="url(#hazy)"/>'
        % (SUN_X, ridge_y(SUN_X, **r) + 4, 640 - i * 90, 26 - i * 6, 0.20 - i * 0.06)
        for i, r in enumerate(R))

    motes = "".join(
        '<circle cx="%d" cy="%d" r="%.1f" fill="#ffd89a" opacity="%.2f"/>'
        % (random.randint(560, W - 40), random.randint(430, 720),
           random.uniform(1.2, 3.0), random.uniform(0.18, 0.6))
        for _ in range(54))

    tuft_xs, gx = [], -10
    while gx < W + 20:
        for _ in range(random.randint(2, 5)):
            tuft_xs.append(gx + random.uniform(-9, 9))
        gx += random.uniform(30, 70)
    tufts = "".join(
        '<path d="M %.1f %.1f q %.1f %.1f %.1f %.1f" fill="none" stroke="#040f0a" '
        'stroke-width="%.1f" stroke-linecap="round"/>'
        % (x, ridge_y(x, **FG) + 2, h * 0.3, -h * 0.62, h * 0.12, -h, max(1.5, h * 0.12))
        for x, h in ((x, random.uniform(9, 32)) for x in tuft_xs))

    # Blades standing right at the lens, near-black and much larger than the
    # ones on the ridge. A picture with nothing in front of it has no depth to
    # sell; this is the frame the rest of the scene sits inside.
    front = "".join(
        '<path d="M %.1f %d q %.1f %.1f %.1f %.1f" fill="none" stroke="#020a06" '
        'stroke-width="%.1f" stroke-linecap="round"/>'
        % (x, H + 10, h * 0.10, -h * 0.62, h * (0.05 + random.uniform(-0.09, 0.09)), -h,
           max(2.2, h * 0.026))
        for x, h in (
            (random.choice((random.uniform(-50, 470), random.uniform(W - 470, W + 50))),
             random.uniform(70, 210))
            for _ in range(80)))

    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"
     role="img" aria-label="Ambervale — coins that leave a mark">
  <title>AMBERVALE — landmarks</title>
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1b2a"/>
      <stop offset="0.26" stop-color="#26364a"/>
      <stop offset="0.48" stop-color="#6b5a4e"/>
      <stop offset="0.68" stop-color="#c98a48"/>
      <stop offset="0.84" stop-color="#f0b263"/>
      <stop offset="1" stop-color="#ffd694"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffe8b8" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="#ffd489" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ffd489" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="empty" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#02100a" stop-opacity="0.55"/>
      <stop offset="0.62" stop-color="#02100a" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#02100a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="footer" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#02100a" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#02100a" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#02100a" stop-opacity="0.98"/>
    </linearGradient>
    <linearGradient id="topshade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#02100a" stop-opacity="0.66"/>
      <stop offset="1" stop-color="#02100a" stop-opacity="0"/>
    </linearGradient>
    <filter id="soften" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="11"/>
    </filter>
    <filter id="hazy" x="-40%" y="-200%" width="180%" height="500%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
    <radialGradient id="bloom" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff2d0" stop-opacity="0.55"/>
      <stop offset="0.4" stop-color="#ffd489" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffc477" stop-opacity="0"/>
    </radialGradient>
    {grain}
  </defs>

  <rect width="{W}" height="{H}" fill="url(#sky)"/>
  <circle cx="{sx}" cy="{sy}" r="{sr3}" fill="url(#bloom)"/>
  {rays}
  <circle cx="{sx}" cy="{sy}" r="{sr2}" fill="url(#halo)"/>
  <circle cx="{sx}" cy="{sy}" r="{sr}" fill="#ffe6ae" opacity="0.92"/>

  <path d="{r0}" fill="#4a5a45"/>
  {far}
  <path d="{r1}" fill="#243428"/>
  {mid}
  {haze}

  <!-- the light behaving: what each thing throws, then the thing itself -->
  {shadows}
  {marks}
  {motes}

  <path d="{r2}" fill="#0c1b12"/>
  <!-- day one: one farmer, nothing built, held in shadow -->
  <g fill="{ink}">{figure}</g>
  <path d="{rfg}" fill="#040f0a"/>
  {tufts}
  {front}

  <!-- the left third kept dim, so "before" and "after" read without a caption -->
  <rect x="0" y="0" width="560" height="{H}" fill="url(#empty)"/>

  <rect width="{W}" height="360" fill="url(#topshade)"/>
  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
    <text x="74" y="86" font-size="15" font-weight="700" letter-spacing="6.5"
          fill="#f4b942" opacity="0.9">AMBERVALE · LANDMARKS</text>
    <text x="72" y="164" font-size="72" font-weight="800" letter-spacing="-1.8"
          fill="#f7ead2">Coins should leave a mark.</text>
    <line x1="74" y1="196" x2="286" y2="196" stroke="#f4b942" stroke-width="2" opacity="0.75"/>
    <text x="74" y="238" font-size="25" fill="#f7ead2" opacity="0.86">
      Eight landmarks you can build. Not one of them earns you anything.
    </text>
    <text x="74" y="274" font-size="21" fill="#f7ead2" opacity="0.62">
      They stand in the vale, visible from the road, and still there tomorrow.
    </text>
  </g>

  <rect x="0" y="700" width="{W}" height="200" fill="url(#footer)"/>
  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
     text-anchor="middle">
    <line x1="{c1}" y1="792" x2="{c2}" y2="792" stroke="#f7ead2" stroke-width="1" opacity="0.16"/>
    <text x="{W2}" y="832" font-size="19" font-weight="700" letter-spacing="6.2"
          fill="#f7ead2" opacity="0.92">
      GARDEN · WELL · BEEHIVES · STONES · SILO · OAK · TOWER · SUNDIAL
    </text>
    <text x="{W2}" y="864" font-size="16" fill="#f7ead2" opacity="0.52">
      40,800 coins for the set · +43 renown · hour twenty should look nothing like hour two
    </text>
    <text x="{W2}" y="893" font-size="16" font-weight="700" letter-spacing="7.5"
          fill="#f4b942" opacity="0.9">AMBERVALE.FUN</text>
  </g>
  {grainrect}
</svg>
'''.format(W=W, H=H, W2=W / 2, grain=GRAIN, rays=rays,
           sx=SUN_X, sy=SUN_Y, sr=SUN_R, sr2=SUN_R * 2.1, sr3=SUN_R * 4.6,
           haze=haze, shadows=shadows, motes=motes, front=front,
           c1=W / 2 - 300, c2=W / 2 + 300,
           r0=ridge_path(W, H, **R[0]), far=far,
           r1=ridge_path(W, H, **R[1]), mid=mid,
           marks=marks,
           r2=ridge_path(W, H, **R[2]),
           ink=INK, figure=farmer(300, ridge_y(300, **R[2]) + 9, 168),
           rfg=ridge_path(W, H, **FG), tufts=tufts,
           grainrect=grain_rect(W, H, 0.055))


open('/home/user/ambervale/docs/brand/landmarks.svg', 'w').write(build())
print('written')
