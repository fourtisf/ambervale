"""
The market banner: the stall in the foreground, the property behind it.

The earlier landmark banner was silhouette against a sunset — handsome, and
nothing like the game, which is bright flat colour in full daylight. This one
is painted in the world's own palette, so somebody who clicks through from the
post arrives at the thing they were shown.

Composition is one idea: the market stall is the near, large, saturated
subject, and everything it sells stands out behind it across the vale. The
path runs from the bottom edge up to the counter, because a road into a picture
is the cheapest way to say "you can go there".
"""

import math
import random
import sys

sys.path.insert(0, '/tmp/claude-0/-home-user-ambervale/7288ee65-67c1-5aa4-85f0-6d76b626d884/scratchpad')
from gen import ridge_y, ridge_path, GRAIN, grain_rect

W, H = 1600, 900

R = [dict(base=430, amp=14, wl=1300, phase=0.4),
     dict(base=545, amp=13, wl=980, phase=2.1),
     dict(base=672, amp=10, wl=1500, phase=4.0)]
FG = dict(base=812, amp=7, wl=1120, phase=1.1)

# The world palette, exactly as textures.ts holds it.
P = dict(
    wall='#f0e2c0', wallShade='#dccaa2',
    roof='#b5473a', roofDark='#8f3529', roofLight='#c85c4d',
    wood='#8b5a2b', woodDark='#6b4420', woodLight='#a6733c',
    stone='#8a8f98', stoneDark='#6b7079', stoneLight='#a8adb6',
    leaf='#3f7a3a', leafDark='#2f5e2c', leafLight='#57a44c',
    pine='#2f5f45', pineDark='#224936',
    trunk='#6b4a2f', trunkDark='#4d3521',
    amber='#f4b942', amberDeep='#d99a28', cream='#f5e6c8',
)

SUN_X, SUN_Y, SUN_R = 1380, 330, 44


def pine(x, base, h, fill, trunk):
    w = h * 0.56
    out = ['<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
           % (x - h * 0.036, base - h * 0.13, h * 0.072, h * 0.15, trunk)]
    for i, f in enumerate((1.0, 0.76, 0.48)):
        y = base - h * (0.13 + 0.27 * i)
        top = base - h * (0.13 + 0.27 * i + 0.41)
        half = w * f / 2
        out.append('<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
                   % (x, top, x + half, y, x - half, y, fill))
    return "".join(out)


def shade(x, y, rx):
    return ('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#1d3b22" opacity="0.22"/>'
            % (x, y, rx, rx * 0.28))


# --- the property, in the colours the game draws them -----------------------

def well(x, b, s):
    return (shade(x, b, 30 * s) +
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
            '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#14232b"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
            % (x - 22 * s, b - 30 * s, 44 * s, 30 * s, 5 * s, P['stoneDark'],
               x - 22 * s, b - 36 * s, 44 * s, 11 * s, 5 * s, P['stone'],
               x, b - 31 * s, 16 * s, 5 * s,
               x - 18 * s, b - 64 * s, 4 * s, 30 * s, P['trunk'],
               x + 14 * s, b - 64 * s, 4 * s, 30 * s, P['trunk'],
               x, b - 82 * s, x - 26 * s, b - 60 * s, x + 26 * s, b - 60 * s, P['roofDark'],
               x, b - 79 * s, x + 2 * s, b - 60 * s, x + 26 * s, b - 60 * s, P['roof']))


def beehives(x, b, s):
    out = [shade(x, b, 34 * s)]
    for dx, n in ((-26, 3), (0, 4), (26, 3)):
        for i in range(n):
            out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
                       % (x + (dx - 10) * s, b - (11 + i * 10) * s, 20 * s, 9 * s, 1.6 * s,
                          P['wall'] if i % 2 == 0 else P['wallShade']))
        out.append('<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
                   % (x + dx * s, b - (18 + n * 10) * s,
                      x + (dx - 13) * s, b - (9 + n * 10) * s,
                      x + (dx + 13) * s, b - (9 + n * 10) * s, P['woodDark']))
    return "".join(out)


def stones(x, b, s):
    out = [shade(x, b, 42 * s)]
    for dx, h, w in ((-34, 34, 13), (-16, 46, 12), (2, 52, 13), (21, 38, 11), (38, 24, 10)):
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
                   % (x + dx * s, b - h * s, w * s, h * s, 3 * s, P['stoneDark']))
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
                   % (x + (dx + w * 0.52) * s, b - h * s, w * 0.48 * s, h * s, 3 * s, P['stoneLight']))
    return "".join(out)


def silo(x, b, s):
    out = [shade(x, b, 30 * s),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
           % (x - 20 * s, b - 96 * s, 40 * s, 96 * s, 4 * s, P['stone']),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
           % (x - 20 * s, b - 96 * s, 15 * s, 96 * s, 4 * s, P['stoneLight'])]
    for i in range(4):
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s" opacity="0.7"/>'
                   % (x - 20 * s, b - (80 - i * 20) * s, 40 * s, 2.4 * s, P['stoneDark']))
    out.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s"/>'
               % (x, b - 96 * s, 25 * s, 15 * s, P['roofDark']))
    out.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s"/>'
               % (x - 3 * s, b - 100 * s, 18 * s, 9 * s, P['roof']))
    return "".join(out)


def greatoak(x, b, s):
    return (shade(x, b, 48 * s) +
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
            % (x - 9 * s, b - 62 * s, 18 * s, 62 * s, 4 * s, P['trunkDark'],
               x - 9 * s, b - 62 * s, 7 * s, 62 * s, 4 * s, P['trunk'],
               x - 30 * s, b - 84 * s, 29 * s, P['leafDark'],
               x + 30 * s, b - 80 * s, 27 * s, P['leafDark'],
               x, b - 98 * s, 35 * s, P['leaf'],
               x + 14 * s, b - 116 * s, 17 * s, P['leafLight']))


def watchtower(x, b, s):
    return (shade(x, b, 30 * s) +
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity="0.45"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
            % (x - 22 * s, b - 30 * s, 44 * s, 30 * s, 3 * s, P['stoneDark'],
               x - 18 * s, b - 30 * s, x - 10 * s, b - 108 * s,
               x - 4 * s, b - 108 * s, x - 8 * s, b - 30 * s, P['trunk'],
               x + 18 * s, b - 30 * s, x + 10 * s, b - 108 * s,
               x + 4 * s, b - 108 * s, x + 8 * s, b - 30 * s, P['trunk'],
               x - 14 * s, b - 72 * s, 28 * s, 4 * s, P['wood'],
               x - 24 * s, b - 122 * s, 48 * s, 14 * s, 2 * s, P['wood'],
               x, b - 152 * s, x - 30 * s, b - 120 * s, x + 30 * s, b - 120 * s, P['roofDark'],
               x, b - 130 * s, 11 * s, P['amber'],
               x, b - 130 * s, 5 * s, P['cream']))


def sundial(x, b, s):
    return (shade(x, b, 28 * s) +
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
            '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s"/>'
            '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="#5f6b74"/>'
            % (x - 11 * s, b - 40 * s, 22 * s, 40 * s, 3 * s, P['stone'],
               x + 1 * s, b - 40 * s, 10 * s, 40 * s, 3 * s, P['stoneLight'],
               x, b - 43 * s, 28 * s, 10 * s, P['wallShade'],
               x, b - 45 * s, 23 * s, 8 * s, P['wall'],
               x, b - 74 * s, x, b - 46 * s, x + 18 * s, b - 46 * s))


def garden(x, b, s):
    out = [shade(x, b, 40 * s),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#6f5231"/>'
           % (x - 36 * s, b - 16 * s, 72 * s, 16 * s, 3 * s),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#7f6a44"/>'
           % (x - 36 * s, b - 16 * s, 72 * s, 5 * s, 3 * s)]
    for i, col in enumerate(('#e4574f', P['amber'], '#d98cc8', '#9fe8ff', '#e4574f', P['amber'])):
        fx = x + (-28 + i * 11) * s
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
                   % (fx - 1.6 * s, b - 30 * s, 3.2 * s, 15 * s, P['leafLight']))
        out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (fx, b - 32 * s, 6 * s, col))
    return "".join(out)


# --- the market stall, the hero --------------------------------------------

def stall(x, b, s):
    """Straight from the world's `market` painter: two posts, a plank counter,
    crates, and the striped awning that is the one shape in this game everybody
    recognises from a distance."""
    out = [shade(x, b, 96 * s)]
    # posts
    out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
               % (x - 86 * s, b - 124 * s, 10 * s, 124 * s, P['woodDark']))
    out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
               % (x + 76 * s, b - 124 * s, 10 * s, 124 * s, P['woodDark']))
    # counter
    out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
               % (x - 82 * s, b - 58 * s, 164 * s, 58 * s, 4 * s, P['wood']))
    out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
               % (x - 82 * s, b - 58 * s, 164 * s, 9 * s, 4 * s, P['woodLight']))
    # goods on the counter — crates, greens, and a coin-bright fruit
    out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
               % (x - 66 * s, b - 84 * s, 42 * s, 27 * s, 3 * s, P['woodLight']))
    out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
               % (x - 18 * s, b - 78 * s, 34 * s, 21 * s, 3 * s, P['wood']))
    out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (x + 34 * s, b - 70 * s, 13 * s, P['leafLight']))
    out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (x + 58 * s, b - 66 * s, 9 * s, P['amber']))
    out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity="0.8"/>'
               % (x + 58 * s, b - 68 * s, 3.4 * s, P['cream']))
    # striped awning
    for i in range(6):
        x0 = x - 92 * s + i * 30.6 * s
        out.append('<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
                   % (x0, b - 126 * s, x0 + 30.7 * s, b - 126 * s,
                      x0 + 32.7 * s, b - 96 * s, x0 + 2 * s, b - 96 * s,
                      P['roof'] if i % 2 == 0 else P['cream']))
    out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
               % (x - 96 * s, b - 130 * s, 192 * s, 9 * s, 3 * s, P['woodDark']))
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
    return (shade(x, b, h * 0.3) +
            '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="#3a5c86"/>'
            '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="#3a5c86"/>'
            '<path d="M %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f Z" fill="#5b86c4"/>'
            '<circle cx="%.2f" cy="%.2f" r="%.2f" fill="#f0c9a0"/>'
            '<ellipse cx="%.2f" cy="%.2f" rx="%.2f" ry="%.2f" fill="%s"/>'
            % (x - body_w * 0.46, hip, body_w * 0.32, leg_h, body_w * 0.10,
               x + body_w * 0.14, hip, body_w * 0.32, leg_h, body_w * 0.10,
               x - body_w * 0.44, hip + h * 0.02, x - body_w * 0.52, shoulder,
               x + body_w * 0.52, shoulder, x + body_w * 0.44, hip + h * 0.02,
               x, head_y, head_r,
               x, brim_y, brim_rx, head_r * 0.40, P['amber']))


def build():
    random.seed(20260818)

    def clumps(lo, hi, groups, per, spread):
        out = []
        for g in range(groups):
            c = lo + (hi - lo) * (g + 0.5) / groups + random.uniform(-40, 40)
            out += [c + random.uniform(-spread, spread) for _ in range(random.randint(per - 1, per + 2))]
        return out

    far = "".join(pine(x, ridge_y(x, **R[0]) + 3, random.uniform(20, 34), '#3d6b52', '#2f5540')
                  for x in clumps(-40, W + 40, 11, 4, 44))
    mid = "".join(pine(x, ridge_y(x, **R[1]) + 3, random.uniform(30, 50), P['pine'], P['pineDark'])
                  for x in clumps(-30, W + 30, 7, 2, 52) if x < 420 or x > 1560)

    rays = "".join(
        '<path d="M %d %d L %.0f %.0f L %.0f %.0f Z" fill="#fff0c8" opacity="%.3f"/>'
        % (SUN_X, SUN_Y,
           SUN_X + math.cos(math.radians(a)) * 1100, SUN_Y + math.sin(math.radians(a)) * 1100,
           SUN_X + math.cos(math.radians(a + 6)) * 1100, SUN_Y + math.sin(math.radians(a + 6)) * 1100, op)
        for a, op in ((104, 0.10), (124, 0.07), (146, 0.10), (166, 0.06), (66, 0.08), (44, 0.05)))

    # The property, spread across the mid ridge behind the stall.
    props = (garden(348, ridge_y(348, **R[1]) + 4, 0.95)
             + beehives(486, ridge_y(486, **R[1]) + 4, 1.0)
             + well(1010, ridge_y(1010, **R[1]) + 4, 1.05)
             + stones(1168, ridge_y(1168, **R[1]) + 4, 1.05)
             + silo(1310, ridge_y(1310, **R[1]) + 4, 1.0)
             + sundial(1424, ridge_y(1424, **R[1]) + 4, 1.0)
             + watchtower(1520, ridge_y(1520, **R[1]) + 4, 1.05))

    near_props = greatoak(176, ridge_y(176, **R[2]) + 6, 1.30)

    tuft_xs, gx = [], -10
    while gx < W + 20:
        for _ in range(random.randint(2, 5)):
            tuft_xs.append(gx + random.uniform(-9, 9))
        gx += random.uniform(34, 74)
    tufts = "".join(
        '<path d="M %.1f %.1f q %.1f %.1f %.1f %.1f" fill="none" stroke="#2b5228" '
        'stroke-width="%.1f" stroke-linecap="round"/>'
        % (x, ridge_y(x, **FG) + 2, h * 0.28, -h * 0.62, h * 0.10, -h, max(2.0, h * 0.11))
        for x, h in ((x, random.uniform(12, 40)) for x in tuft_xs))

    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"
     role="img" aria-label="The market at Ambervale, with every landmark behind it">
  <title>AMBERVALE — the market</title>
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f7f9e"/>
      <stop offset="0.32" stop-color="#5aa8bb"/>
      <stop offset="0.58" stop-color="#8fc0b4"/>
      <stop offset="0.80" stop-color="#f2cf96"/>
      <stop offset="1" stop-color="#ffdca6"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff6da" stop-opacity="0.95"/>
      <stop offset="0.42" stop-color="#ffe6ae" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#ffe6ae" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="path" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9a7a52"/>
      <stop offset="1" stop-color="#8b6e46"/>
    </linearGradient>
    <linearGradient id="topshade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07242f" stop-opacity="0.44"/>
      <stop offset="1" stop-color="#07242f" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="footer" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07242f" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#07242f" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#07242f" stop-opacity="0.95"/>
    </linearGradient>
    {grain}
  </defs>

  <rect width="{W}" height="{H}" fill="url(#sky)"/>
  <circle cx="{sx}" cy="{sy}" r="{sr2}" fill="url(#halo)"/>
  <circle cx="{sx}" cy="{sy}" r="{sr}" fill="#fff8e4" opacity="0.55"/>
  {rays}

  <path d="{r0}" fill="#6ba064"/>
  {far}
  <path d="{r1}" fill="#4c8341"/>
  {mid}

  <!-- everything the market sells, standing where it would stand -->
  {props}

  <path d="{r2}" fill="#3f7238"/>
  {nearprops}
  {stall}
  {farmer}

  <path d="{rfg}" fill="#356030"/>
  {tufts}

  <rect width="{W}" height="330" fill="url(#topshade)"/>
  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
    <text x="74" y="88" font-size="15" font-weight="700" letter-spacing="6.5"
          fill="#ffd88a" opacity="0.95">AMBERVALE · THE MARKET</text>
    <text x="72" y="166" font-size="70" font-weight="800" letter-spacing="-1.6"
          fill="#ffffff">The market sells more than seeds.</text>
    <line x1="74" y1="198" x2="286" y2="198" stroke="#f4b942" stroke-width="2.4" opacity="0.9"/>
    <text x="74" y="240" font-size="25" fill="#ffffff" opacity="0.9">
      Eight landmarks you can buy and build. Not one of them earns you anything.
    </text>
    <text x="74" y="276" font-size="21" fill="#ffe6b0" opacity="0.8">
      They stand in your vale, visible from the road, and still there tomorrow.
    </text>
  </g>

  <rect x="0" y="716" width="{W}" height="184" fill="url(#footer)"/>
  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
     text-anchor="middle">
    <text x="{W2}" y="828" font-size="19" font-weight="700" letter-spacing="5.8"
          fill="#f7ead2" opacity="0.94">
      GARDEN · WELL · BEEHIVES · STONES · SILO · OAK · TOWER · SUNDIAL
    </text>
    <text x="{W2}" y="860" font-size="16" fill="#f7ead2" opacity="0.55">
      40,800 coins for the set · +43 renown · no wallet needed to start
    </text>
    <text x="{W2}" y="890" font-size="16" font-weight="700" letter-spacing="7.5"
          fill="#f4b942" opacity="0.92">AMBERVALE.FUN</text>
  </g>
  {grainrect}
</svg>
'''.format(W=W, H=H, W2=W / 2, grain=GRAIN, rays=rays,
           sx=SUN_X, sy=SUN_Y, sr=SUN_R, sr2=SUN_R * 3.4,
           r0=ridge_path(W, H, **R[0]), far=far,
           r1=ridge_path(W, H, **R[1]), mid=mid, props=props,
           r2=ridge_path(W, H, **R[2]),
           py=ridge_y(700, **R[2]) + 6,
           nearprops=near_props,
           stall=stall(700, ridge_y(700, **R[2]) + 10, 1.35),
           farmer=farmer(880, ridge_y(880, **R[2]) + 14, 150),
           rfg=ridge_path(W, H, **FG), tufts=tufts,
           grainrect=grain_rect(W, H, 0.05))


open('/home/user/ambervale/docs/brand/market.svg', 'w').write(build())
print('written')
