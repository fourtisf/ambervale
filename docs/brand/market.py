"""
The market banner, third pass: not a landscape ABOUT the game — a frame OF it.

The previous versions were side-view vistas with a horizon and a sky. The game
has neither: it is a top-down field that fills the screen, mottled green,
crossed by tan paths, everything standing on a round contact shadow, with the
UI floating over it in dark-teal pills. Someone who plays the game recognises
that instantly, and someone who doesn't still gets a premium poster.

So this is composed like an idealised screenshot: the whole frame is field,
a path winds up from the bottom edge to the market stall, and the eight
landmarks stand around it at their world sizes — lower in frame means nearer
means larger, exactly the game's y-sort. The headline sits on the game's own
UI treatment (dark teal, cream text, amber accents) instead of on a sunset.
"""

import math
import random
import sys

sys.path.insert(0, '/tmp/claude-0/-home-user-ambervale/7288ee65-67c1-5aa4-85f0-6d76b626d884/scratchpad')
# The prop painters from the previous banner are already front-view sprites in
# the world palette — which is exactly how the game draws things standing in a
# top-down field. Import rather than fork, so a fix lands in both.
from marketbanner import (P, shade, well, beehives, stones, silo, greatoak,
                          watchtower, sundial, garden, stall, farmer, pine)
from gen import GRAIN, grain_rect

W, H = 1600, 900


# --- the world's furniture, small pieces the props sit among ----------------

def chicken(x, b, s):
    return (shade(x, b, 14 * s) +
            '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#f7f3ea"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="#efe6d4"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#f7f3ea"/>'
            '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
            '<path d="M %.1f %.1f q %.1f %.1f %.1f 0" stroke="#c9463d" stroke-width="%.1f" fill="none"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#2a1a05"/>'
            '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f"/>'
            '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f"/>'
            % (x, b - 9 * s, 12 * s, 9 * s,
               x - 12 * s, b - 12 * s, x - 18 * s, b - 20 * s, x - 8 * s, b - 15 * s,
               x + 8 * s, b - 20 * s, 6 * s,
               x + 13 * s, b - 20 * s, x + 19 * s, b - 18.4 * s, x + 13 * s, b - 16.8 * s, P['amber'],
               x + 5 * s, b - 26 * s, 3 * s, -3 * s, 6 * s, 2.2 * s,
               x + 10 * s, b - 21.5 * s, 1.3 * s,
               x - 4 * s, b, x - 4 * s, b + 3 * s, P['amber'], 1.6 * s,
               x + 4 * s, b, x + 4 * s, b + 3 * s, P['amber'], 1.6 * s))


def fence(x, y, n, s):
    """A run of the game's fenceH: posts with two rails."""
    out = []
    for i in range(n + 1):
        px_ = x + i * 34 * s
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
                   % (px_ - 2.6 * s, y - 26 * s, 5.2 * s, 26 * s, 2 * s, P['woodDark']))
    for ry in (20, 10):
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
                   % (x - 2 * s, y - ry * s, n * 34 * s + 4 * s, 4.6 * s, 2 * s, P['wood']))
    return "".join(out)


def plot(x, y, s, crop):
    """A soil plot with a sunflower row, straight from the field."""
    out = ['<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#6f5231"/>'
           % (x - 30 * s, y - 30 * s, 60 * s, 60 * s, 6 * s),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#7f6a44"/>'
           % (x - 26 * s, y - 26 * s, 52 * s, 52 * s, 5 * s)]
    if crop:
        for dx, dy in ((-13, -12), (11, -14), (-11, 12), (13, 10), (0, -1)):
            fx, fy = x + dx * s, y + dy * s
            out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
                       % (fx - 1.2 * s, fy - 10 * s, 2.4 * s, 10 * s, P['leaf']))
            out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
                       % (fx, fy - 12 * s, 5 * s, P['amber']))
            out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
                       % (fx, fy - 12 * s, 2 * s, P['woodDark']))
    return "".join(out)


def rock(x, b, s):
    return (shade(x, b, 20 * s) +
            '<path d="M %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f Q %.1f %.1f %.1f %.1f Z" fill="%s"/>'
            '<path d="M %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
            % (x - 18 * s, b, x - 16 * s, b - 22 * s, x + 2 * s, b - 20 * s,
               x + 14 * s, b - 14 * s, x + 20 * s, b - 4 * s, x + 16 * s, b, P['stone'],
               x - 10 * s, b - 18 * s, x, b - 22 * s, x + 2 * s, b - 20 * s,
               x - 2 * s, b - 8 * s, P['stoneLight']))


def bush(x, b, s):
    return (shade(x, b, 18 * s) +
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
            % (x - 8 * s, b - 8 * s, 10 * s, P['leafDark'],
               x + 8 * s, b - 8 * s, 9 * s, P['leafDark'],
               x, b - 13 * s, 10 * s, P['leaf']))


def mottle(x, y, r, fill, op):
    """One of the field's cloud-shaped tone patches: overlapping circles, hard
    edges, low contrast — the single most recognisable thing about the ground."""
    random.seed(int(x * 7 + y * 13))
    out = []
    for i in range(4):
        a = i * 1.7 + x * 0.01
        out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity="%.2f"/>'
                   % (x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.34,
                      r * random.uniform(0.55, 0.8), fill, op))
    return "".join(out)


def build():
    random.seed(20260819)

    # --- the ground -------------------------------------------------------
    mottles = []
    for _ in range(15):
        mx, my = random.uniform(-60, W + 60), random.uniform(-40, H + 40)
        mottles.append(mottle(mx, my, random.uniform(90, 190), '#5b9450', 0.55))
    for _ in range(11):
        mx, my = random.uniform(-60, W + 60), random.uniform(-40, H + 40)
        mottles.append(mottle(mx, my, random.uniform(80, 160), '#3f7238', 0.4))
    ground = "".join(mottles)

    # The path: bordered, winding, wider as it nears the viewer — the game's
    # roads are the veins of every screenshot.
    path_d = 'M 830 940 C 790 830 710 790 720 700 C 730 626 850 600 1000 576 C 1200 544 1400 520 1620 490'
    branch_d = 'M 726 692 C 600 660 380 664 -20 610'
    paths = (
        '<path d="%s" fill="none" stroke="#79603f" stroke-width="78" stroke-linecap="round"/>'
        '<path d="%s" fill="none" stroke="#79603f" stroke-width="54" stroke-linecap="round"/>'
        '<path d="%s" fill="none" stroke="#8b6e46" stroke-width="64" stroke-linecap="round"/>'
        '<path d="%s" fill="none" stroke="#8b6e46" stroke-width="42" stroke-linecap="round"/>'
        '<path d="%s" fill="none" stroke="#9a7a52" stroke-width="30" stroke-linecap="round" opacity="0.5"/>'
        % (path_d, branch_d, path_d, branch_d, path_d))

    # Flowers and tufts, everywhere, the way the field actually is.
    scatter = []
    for _ in range(70):
        sx, sy = random.uniform(30, W - 30), random.uniform(240, H - 30)
        kind = random.random()
        if kind < 0.45:
            scatter.append('<path d="M %.1f %.1f q %.1f %.1f %.1f %.1f" stroke="#2b5228" '
                           'stroke-width="1.8" fill="none" stroke-linecap="round"/>'
                           % (sx, sy, 2.4, -5, 1, -9))
            scatter.append('<path d="M %.1f %.1f q %.1f %.1f %.1f %.1f" stroke="#2b5228" '
                           'stroke-width="1.8" fill="none" stroke-linecap="round"/>'
                           % (sx + 4, sy, -1, -5, -2.4, -8))
        else:
            col = random.choice(('#fff3d0', '#d98cc8', '#f4d35e', '#9fe8ff'))
            scatter.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity="0.85"/>'
                           % (sx, sy, random.uniform(2.2, 3.4), col))
    scatter = "".join(scatter)

    # Pollen in the light, the game's idle sparkle.
    motes = "".join('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#ffd89a" opacity="%.2f"/>'
                    % (random.uniform(60, W - 60), random.uniform(260, H - 80),
                       random.uniform(1.2, 2.6), random.uniform(0.25, 0.6))
                    for _ in range(30))

    # --- everything standing, in y order (the game's draw order) ----------
    standing = []

    def put(y, svg):
        standing.append((y, svg))

    # far band — smaller
    put(340, pine(120, 340, 62, P['pine'], P['pineDark']))
    put(352, stones(300, 352, 0.82))
    put(344, beehives(540, 344, 0.78))
    put(356, pine(1050, 356, 54, P['pine'], P['pineDark']))
    put(344, watchtower(1246, 344, 0.82))
    put(352, silo(1490, 352, 0.84))
    put(360, bush(700, 360, 1.0))
    put(368, rock(950, 368, 0.9))

    # mid band
    put(500, well(180, 500, 1.0))
    put(430, bush(430, 430, 1.0))
    put(452, rock(70, 452, 0.9))
    put(500, bush(1140, 500, 1.1))
    put(540, sundial(1444, 540, 1.0))
    put(505, fence(940, 505, 4, 1.0))
    put(598, chicken(566, 598, 1.0))

    # the hero
    put(575, stall(700, 575, 1.5))
    put(650, farmer(920, 650, 132))
    put(668, chicken(586, 668, 1.15))
    put(700, chicken(648, 700, 1.05))

    # near band — larger
    put(730, plot(180, 700, 1.15, True))
    put(740, plot(320, 730, 1.2, True))
    put(770, garden(520, 770, 1.25))
    put(780, greatoak(1300, 780, 1.35))
    put(720, fence(1420, 720, 3, 1.2))
    put(760, rock(1120, 760, 1.2))
    put(820, pine(80, 860, 96, P['pine'], P['pineDark']))
    put(830, bush(1560, 830, 1.4))

    standing.sort(key=lambda t: t[0])
    props = "".join(svg for _, svg in standing)

    # --- the UI: pills in the game's own HUD style ------------------------
    names = ['GARDEN', 'WELL', 'BEEHIVES', 'STONES', 'SILO', 'OAK', 'TOWER', 'SUNDIAL']
    widths = [len(n) * 11.4 + 36 for n in names]
    gap = 14
    total = sum(widths) + gap * (len(names) - 1)
    px_ = (W - total) / 2
    pills = []
    for n, w_ in zip(names, widths):
        pills.append(
            '<g>'
            '<rect x="%.1f" y="788" width="%.1f" height="40" rx="20" fill="#0f3a4c" opacity="0.92"/>'
            '<rect x="%.1f" y="788" width="%.1f" height="40" rx="20" fill="none" '
            'stroke="#f5e6c8" stroke-opacity="0.22" stroke-width="1.4"/>'
            '<text x="%.1f" y="814" text-anchor="middle" font-family="ui-sans-serif, system-ui, '
            '-apple-system, Segoe UI, Roboto, sans-serif" font-size="15" font-weight="700" '
            'letter-spacing="2" fill="#f5e6c8">%s</text>'
            '</g>' % (px_, w_, px_, w_, px_ + w_ / 2, n))
        px_ += w_ + gap
    pills = "".join(pills)

    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"
     role="img" aria-label="The market at Ambervale, seen the way the game sees it">
  <title>AMBERVALE — the market</title>
  <defs>
    <radialGradient id="sunpool" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff0c8" stop-opacity="0.4"/>
      <stop offset="0.55" stop-color="#ffe6ae" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#ffe6ae" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="topshade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a2e3d" stop-opacity="0.58"/>
      <stop offset="0.66" stop-color="#0a2e3d" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#0a2e3d" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="footshade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a2e3d" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#0a2e3d" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#0a2e3d" stop-opacity="0.78"/>
    </linearGradient>
    <radialGradient id="vig" cx="0.5" cy="0.46" r="0.72">
      <stop offset="0" stop-color="#0a2e3d" stop-opacity="0"/>
      <stop offset="0.72" stop-color="#0a2e3d" stop-opacity="0"/>
      <stop offset="1" stop-color="#0a2e3d" stop-opacity="0.3"/>
    </radialGradient>
    {grain}
  </defs>

  <!-- the field, which is the whole world -->
  <rect width="{W}" height="{H}" fill="#4c8341"/>
  {ground}
  {paths}
  <circle cx="1240" cy="300" r="430" fill="url(#sunpool)"/>
  {scatter}

  <!-- everything standing on it, y-sorted like the game -->
  {props}
  {motes}

  <rect width="{W}" height="{H}" fill="url(#vig)"/>

  <!-- headline over the game's own dark-teal UI treatment -->
  <rect width="{W}" height="300" fill="url(#topshade)"/>
  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
    <rect x="70" y="56" width="308" height="36" rx="18" fill="#0f3a4c" opacity="0.9"/>
    <rect x="70" y="56" width="308" height="36" rx="18" fill="none" stroke="#f5e6c8"
          stroke-opacity="0.22" stroke-width="1.4"/>
    <text x="224" y="80" text-anchor="middle" font-size="14.5" font-weight="700"
          letter-spacing="5" fill="#f4b942">AMBERVALE · THE MARKET</text>
    <text x="72" y="170" font-size="68" font-weight="800" letter-spacing="-1.4"
          fill="#ffffff">The market sells more than seeds.</text>
    <line x1="76" y1="202" x2="288" y2="202" stroke="#f4b942" stroke-width="2.4" opacity="0.9"/>
    <text x="76" y="244" font-size="25" fill="#f5e6c8" opacity="0.95">
      Eight landmarks you can buy and build. Not one of them earns you anything.
    </text>
    <text x="76" y="280" font-size="21" fill="#ffe6b0" opacity="0.85">
      They stand in your vale, visible from the road, and still there tomorrow.
    </text>
  </g>

  <!-- footer: the landmark names as the game's HUD pills -->
  <rect x="0" y="700" width="{W}" height="200" fill="url(#footshade)"/>
  {pills}
  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
     text-anchor="middle">
    <text x="{W2}" y="856" font-size="16" fill="#f5e6c8" opacity="0.62">
      40,800 coins for the set · +43 renown · no wallet needed to start
    </text>
    <text x="{W2}" y="886" font-size="16" font-weight="700" letter-spacing="7.5"
          fill="#f4b942" opacity="0.95">AMBERVALE.FUN</text>
  </g>
  {grainrect}
</svg>
'''.format(W=W, H=H, W2=W / 2, grain=GRAIN, ground=ground, paths=paths,
           scatter=scatter, props=props, motes=motes, pills=pills,
           grainrect=grain_rect(W, H, 0.045))


open('/home/user/ambervale/docs/brand/market.svg', 'w').write(build())
print('written')
