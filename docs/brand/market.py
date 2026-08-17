"""
The market banner, fourth pass: a frame OF the game, graded like the game.

Three parallel critics reviewed the previous render against real screenshots
and returned forty findings. The big ones, all fixed here:

- The field was dark, cool and vignetted like dusk; the game is bright, warm
  and flat-lit. Rebased the greens, killed the sun-pool and the teal vignette
  (the corner wash is now a deep WARM green multiply, much weaker).
- The mottling was hard-edged bokeh circles; the game's is soft low-contrast
  patches. The whole tone layer now runs through a blur and half the opacity.
- The paths were three stacked strokes with visible seams and a lighter centre
  stripe the game does not have. Now: borders first, then both fills, one flat
  warm tan, constant width, no stripe.
- The farmer was three times game scale with no face, brim, straps or legs.
  Redrawn to the sprite's actual anatomy, at road scale, standing ON the road.
- Stones and beehives sat inside the headline's text band; both now fill the
  midfield dead zones instead. The top 380px carries copy only.
- The stall stood on the junction; it now stands beside it, on grass, with its
  contact shadow visible.
- Tower and silo carried the same vivid red as the awning and pulled the eye
  off the hero; both are now smaller and their roofs muted toward brick.
- Confetti dots everywhere (including blue); now sparse white four-petal
  flower specks, and none on roads, props, text bands.
- HUD pills: white sentence-case labels, as in the game — gold is reserved
  for the accent line. Footer lifted clear of the bottom edge and its scrim
  deepened so the road no longer changes the text's background mid-sentence.
"""

import math
import random
import sys

sys.path.insert(0, '/tmp/claude-0/-home-user-ambervale/7288ee65-67c1-5aa4-85f0-6d76b626d884/scratchpad')
from marketbanner import (P, shade, well, beehives, stones, silo, greatoak,
                          watchtower, garden, stall, pine)
from gen import GRAIN, grain_rect

W, H = 1600, 900

# One flat warm tan, bordered darker — measured against the screenshots, not
# against the tile table (Light2D brightens the on-screen path well past it).
PATH_FILL = '#a1825a'
PATH_EDGE = '#7d6340'


# --- painters new or overridden for this composition ------------------------

def farmer2(x, b, h):
    """The game's farmer, at the game's scale: brim AND crown, a face, overall
    straps, separate legs. The previous one was a blue slab under a brimless
    ellipse, three times too large."""
    head_r = h * 0.20
    body_w = h * 0.34
    leg_h = h * 0.16
    hip = b - leg_h
    shoulder = hip - h * 0.30
    head_y = shoulder - head_r * 0.78
    brim_y = head_y - head_r * 0.30
    return (
        '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#1d3b22" opacity="0.26"/>'
        # legs
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="#2e4a6e"/>'
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="#2e4a6e"/>'
        # torso: shirt behind, overalls in front
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="#7fb069"/>'
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" fill="#3a5c86"/>'
        # straps
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="#3a5c86"/>'
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" fill="#3a5c86"/>'
        # face
        '<circle cx="%.2f" cy="%.2f" r="%.2f" fill="#f0c9a0"/>'
        '<circle cx="%.2f" cy="%.2f" r="%.2f" fill="#2a1a05"/>'
        '<circle cx="%.2f" cy="%.2f" r="%.2f" fill="#2a1a05"/>'
        # hat: crown dome first, brim over it — no scalp showing through
        '<path d="M %.2f %.2f a %.2f %.2f 0 0 1 %.2f 0 Z" fill="%s"/>'
        '<ellipse cx="%.2f" cy="%.2f" rx="%.2f" ry="%.2f" fill="%s"/>'
        % (x + 4, b, h * 0.26, h * 0.075,
           x - body_w * 0.36, hip, body_w * 0.3, leg_h, body_w * 0.09,
           x + body_w * 0.06, hip, body_w * 0.3, leg_h, body_w * 0.09,
           x - body_w * 0.5, shoulder, body_w, h * 0.32, body_w * 0.16,
           x - body_w * 0.42, shoulder + h * 0.10, body_w * 0.84, h * 0.23, body_w * 0.12,
           x - body_w * 0.30, shoulder + h * 0.015, body_w * 0.14, h * 0.11,
           x + body_w * 0.16, shoulder + h * 0.015, body_w * 0.14, h * 0.11,
           x, head_y, head_r,
           x - head_r * 0.38, head_y + head_r * 0.05, head_r * 0.11,
           x + head_r * 0.38, head_y + head_r * 0.05, head_r * 0.11,
           x - head_r * 0.72, brim_y, head_r * 0.72, head_r * 0.6, head_r * 1.44, P['amber'],
           x, brim_y, head_r * 1.5, head_r * 0.42, P['amberDeep']))


def sundial2(x, b, s):
    """Hour ticks and a gnomon seated on the face — the previous one scanned
    as a wizard hat on a pedestal."""
    out = [shade(x, b, 28 * s),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
           % (x - 11 * s, b - 40 * s, 22 * s, 40 * s, 3 * s, P['stone']),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
           % (x + 1 * s, b - 40 * s, 10 * s, 40 * s, 3 * s, P['stoneLight']),
           '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s"/>'
           % (x, b - 43 * s, 28 * s, 10 * s, P['wallShade']),
           '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s"/>'
           % (x, b - 45 * s, 23 * s, 8 * s, P['wall'])]
    for i in range(8):
        a = math.pi * (0.15 + 0.7 * i / 7) + math.pi
        out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity="0.85"/>'
                   % (x + math.cos(a) * 19 * s, b - 45 * s - math.sin(a) * 6 * s,
                      1.1 * s, P['stoneDark']))
    out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" opacity="0.5"/>'
               % (x, b - 45 * s, x + 13 * s, b - 42 * s, P['stoneDark'], 1.6 * s))
    out.append('<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="#5f6b74"/>'
               % (x, b - 62 * s, x, b - 45 * s, x + 11 * s, b - 45 * s))
    return "".join(out)


def chicken(x, b, s):
    return (shade(x, b, 13 * s) +
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
               x - 4 * s, b - 1, x - 4 * s, b + 2 * s, P['amber'], 1.6 * s,
               x + 4 * s, b - 1, x + 4 * s, b + 2 * s, P['amber'], 1.6 * s))


def fence(x, y, n, s):
    """The game's fenceH: brighter red-brown double rails on regular posts,
    with a contact shadow so it does not float."""
    out = ['<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#1d3b22" opacity="0.2"/>'
           % (x + n * 17 * s, y + 1, n * 19 * s, 5 * s)]
    for i in range(n + 1):
        px_ = x + i * 34 * s
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#7a4d28"/>'
                   % (px_ - 2.8 * s, y - 26 * s, 5.6 * s, 26 * s, 2 * s))
    for ry in (20, 10):
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#a06636"/>'
                   % (x - 2 * s, y - ry * s, n * 34 * s + 4 * s, 4.6 * s, 2 * s))
    return "".join(out)


def plot(x, y, s):
    """A sunflower plot in the field's own plot treatment: light border, soil,
    a crop standing in it — with a shadow, which it was missing."""
    out = ['<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#1d3b22" opacity="0.2"/>'
           % (x + 4, y + 30 * s, 34 * s, 9 * s),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#b08a5c"/>'
           % (x - 30 * s, y - 30 * s, 60 * s, 60 * s, 7 * s),
           '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#6f5231"/>'
           % (x - 25 * s, y - 25 * s, 50 * s, 50 * s, 5 * s)]
    for dx, dy in ((-12, -11), (11, -13), (-10, 12), (12, 10), (0, -1)):
        fx, fy = x + dx * s, y + dy * s
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
                   % (fx - 1.2 * s, fy - 9 * s, 2.4 * s, 9 * s, P['leaf']))
        out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
                   % (fx, fy - 11 * s, 4.6 * s, P['amber']))
        out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
                   % (fx, fy - 11 * s, 1.8 * s, P['woodDark']))
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


def lamp(x, b, s):
    """The game's amber waypoint lamp along its roads."""
    return (shade(x, b, 8 * s) +
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#6b4a2f"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s" '
            'stroke="#6b4a2f" stroke-width="%.1f"/>'
            % (x - 2 * s, b - 22 * s, 4 * s, 22 * s,
               x - 6 * s, b - 33 * s, 12 * s, 12 * s, 2 * s, P['amber'], 1.6 * s))


# --- geometry helpers -------------------------------------------------------

def cubic(p0, p1, p2, p3, t):
    mt = 1 - t
    return (mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0],
            mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1])


MAIN = [((830, 980), (790, 830), (710, 790), (720, 700)),
        ((720, 700), (730, 626), (850, 600), (1000, 576)),
        ((1000, 576), (1200, 544), (1400, 520), (1660, 486))]
BRANCH = [((726, 692), (600, 660), (380, 664), (-40, 608))]

ROAD_PTS = [cubic(*seg, t / 20) for seg in MAIN + BRANCH for t in range(21)]


def on_road(x, y, margin=46):
    return any((x - rx) ** 2 + (y - ry) ** 2 < margin ** 2 for rx, ry in ROAD_PTS)


def build():
    random.seed(20260819)

    # --- the ground: bright, warm, softly mottled -------------------------
    mottles = []
    for _ in range(14):
        mx, my = random.uniform(-60, W + 60), random.uniform(-40, H + 40)
        r = random.uniform(80, 170)
        for i in range(4):
            a = i * 1.7 + mx * 0.01
            mottles.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#5c9a4e" opacity="0.5"/>'
                           % (mx + math.cos(a) * r * 0.55, my + math.sin(a) * r * 0.34,
                              r * random.uniform(0.5, 0.75)))
    for _ in range(10):
        mx, my = random.uniform(-60, W + 60), random.uniform(-40, H + 40)
        r = random.uniform(70, 150)
        for i in range(4):
            a = i * 1.9 + mx * 0.013
            mottles.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#447a39" opacity="0.4"/>'
                           % (mx + math.cos(a) * r * 0.55, my + math.sin(a) * r * 0.34,
                              r * random.uniform(0.5, 0.75)))
    ground = '<g filter="url(#softground)">%s</g>' % "".join(mottles)

    # --- paths: borders under both fills, so the junction has no seam ------
    d_main = 'M 830 980 C 790 830 710 790 720 700 C 730 626 850 600 1000 576 C 1200 544 1400 520 1660 486'
    d_branch = 'M 726 692 C 600 660 380 664 -40 608'
    paths = (
        '<path d="%s" fill="none" stroke="%s" stroke-width="70" stroke-linecap="round"/>'
        '<path d="%s" fill="none" stroke="%s" stroke-width="66" stroke-linecap="round"/>'
        '<path d="%s" fill="none" stroke="%s" stroke-width="56" stroke-linecap="round"/>'
        '<path d="%s" fill="none" stroke="%s" stroke-width="52" stroke-linecap="round"/>'
        % (d_main, PATH_EDGE, d_branch, PATH_EDGE,
           d_main, PATH_FILL, d_branch, PATH_FILL))

    # --- flowers and tufts, kept off roads, props, and both text bands ----
    exclusions = [(450, 475, 90), (1140, 470, 95), (180, 500, 75), (1444, 540, 75),
                  (660, 548, 165), (960, 596, 55), (1300, 780, 120), (330, 585, 90),
                  (200, 700, 75), (1310, 400, 85), (1505, 408, 70), (120, 400, 55),
                  (1255, 620, 110), (1430, 760, 100), (80, 855, 60), (1050, 410, 45)]

    def clear(x, y):
        if y < 390 or y > 700:
            return False
        if on_road(x, y):
            return False
        return not any((x - ex) ** 2 + (y - ey) ** 2 < er ** 2 for ex, ey, er in exclusions)

    scatter = []
    placed = 0
    while placed < 26:
        sx, sy = random.uniform(40, W - 40), random.uniform(380, 720)
        if not clear(sx, sy):
            continue
        placed += 1
        if random.random() < 0.62:
            col = '#fff6e0' if random.random() < 0.8 else '#e8a8c8'
            petals = "".join('<circle cx="%.1f" cy="%.1f" r="2.1" fill="%s"/>'
                             % (sx + math.cos(a) * 2.8, sy + math.sin(a) * 2.8, col)
                             for a in (0, 1.57, 3.14, 4.71))
            scatter.append(petals + '<circle cx="%.1f" cy="%.1f" r="1.3" fill="%s"/>'
                           % (sx, sy, P['amber']))
        else:
            scatter.append('<path d="M %.1f %.1f q 1.6 -4.5 0.4 -8.5 M %.1f %.1f q -1.4 -4 -2.2 -7" '
                           'stroke="#3c6f33" stroke-width="2" fill="none" stroke-linecap="round"/>'
                           % (sx, sy, sx + 4, sy))
    scatter = "".join(scatter)

    # --- everything standing, y-sorted ------------------------------------
    standing = []

    def put(y, svg):
        standing.append((y, svg))

    def mute(svg):
        """Background treatment for the two red-roofed talls: the awning must
        hold the only vivid red on the page."""
        return svg.replace('#8f3529', '#7e463c').replace('#b5473a', '#96574a')

    # far band — below the copy, above the midfield
    put(400, pine(120, 400, 58, P['pine'], P['trunk']))
    put(410, pine(1050, 410, 50, P['pine'], P['trunk']))
    put(400, mute(watchtower(1310, 400, 0.72)))
    put(408, mute(silo(1505, 408, 0.74)))
    put(452, rock(70, 452, 0.9))
    put(430, bush(320, 430, 0.95))

    # midfield — the two former dead zones now hold the moved landmarks
    put(475, stones(450, 475, 1.0))
    put(470, beehives(1140, 470, 1.0))
    put(500, well(180, 500, 1.0).replace('#6b7079', '#39424a'))
    put(540, sundial2(1444, 540, 1.0))
    put(560, lamp(556, 560, 1.0))
    put(530, lamp(1082, 530, 1.0))

    # the hero, on grass beside the junction
    put(548, stall(660, 548, 1.5))
    put(596, farmer2(960, 596, 96))
    put(610, chicken(548, 610, 1.1))
    put(652, chicken(606, 652, 1.0))

    # near band
    put(620, fence(1180, 620, 4, 1.1))
    put(700, plot(200, 700, 1.15))
    put(585, garden(330, 585, 1.1))
    put(760, rock(1120, 760, 1.15))
    put(780, greatoak(1300, 780, 1.35))
    put(760, fence(1380, 760, 3, 1.2))
    put(855, pine(80, 855, 86, P['pine'], P['trunk']))
    put(830, bush(1560, 830, 1.35))

    standing.sort(key=lambda t: t[0])
    props = "".join(svg for _, svg in standing)

    # --- HUD pills: white sentence-case, as the game sets them ------------
    names = ['Garden', 'Well', 'Beehives', 'Stones', 'Silo', 'Oak', 'Tower', 'Sundial']
    widths = [len(n) * 9.6 + 40 for n in names]
    gap = 14
    total = sum(widths) + gap * (len(names) - 1)
    px_ = (W - total) / 2
    pills = []
    for n, w_ in zip(names, widths):
        pills.append(
            '<g>'
            '<rect x="%.1f" y="742" width="%.1f" height="40" rx="20" fill="#0f3a4c" opacity="0.94"/>'
            '<rect x="%.1f" y="742" width="%.1f" height="40" rx="20" fill="none" '
            'stroke="#f5e6c8" stroke-opacity="0.22" stroke-width="1.4"/>'
            '<text x="%.1f" y="768" text-anchor="middle" font-family="ui-sans-serif, system-ui, '
            '-apple-system, Segoe UI, Roboto, sans-serif" font-size="16.5" font-weight="600" '
            'fill="#f5e6c8">%s</text>'
            '</g>' % (px_, w_, px_, w_, px_ + w_ / 2, n))
        px_ += w_ + gap
    pills = "".join(pills)

    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"
     role="img" aria-label="The market at Ambervale, seen the way the game sees it">
  <title>AMBERVALE — the market</title>
  <defs>
    <filter id="softground" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <linearGradient id="topshade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a2e3d" stop-opacity="0.58"/>
      <stop offset="0.66" stop-color="#0a2e3d" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#0a2e3d" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="footshade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a2e3d" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#0a2e3d" stop-opacity="0.62"/>
      <stop offset="1" stop-color="#0a2e3d" stop-opacity="0.88"/>
    </linearGradient>
    <radialGradient id="vig" cx="0.5" cy="0.46" r="0.75">
      <stop offset="0" stop-color="#12301c" stop-opacity="0"/>
      <stop offset="0.74" stop-color="#12301c" stop-opacity="0"/>
      <stop offset="1" stop-color="#12301c" stop-opacity="0.24"/>
    </radialGradient>
    {grain}
  </defs>

  <!-- the field: bright, warm, flat-lit, the game's own daylight -->
  <rect width="{W}" height="{H}" fill="#4f8a42"/>
  {ground}
  {paths}
  {scatter}

  <!-- everything standing on it, y-sorted like the game -->
  {props}

  <rect width="{W}" height="{H}" fill="url(#vig)" style="mix-blend-mode:multiply"/>

  <!-- headline block, every element on one left edge -->
  <rect width="{W}" height="300" fill="url(#topshade)"/>
  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
    <rect x="74" y="54" width="356" height="38" rx="19" fill="#0f3a4c" opacity="0.92"/>
    <rect x="74" y="54" width="356" height="38" rx="19" fill="none" stroke="#f5e6c8"
          stroke-opacity="0.22" stroke-width="1.4"/>
    <text x="252" y="79" text-anchor="middle" font-size="14.5" font-weight="700"
          letter-spacing="4.2" fill="#f4b942">AMBERVALE · THE MARKET</text>
    <text x="74" y="172" font-size="68" font-weight="800" letter-spacing="-1.4"
          fill="#ffffff">The market sells more than seeds.</text>
    <line x1="76" y1="204" x2="288" y2="204" stroke="#f4b942" stroke-width="2.4" opacity="0.9"/>
    <text x="76" y="246" font-size="24" fill="#f5e6c8" opacity="0.95">
      Eight landmarks you can buy and build. Not one of them earns you anything.
    </text>
    <text x="76" y="284" font-size="24" fill="#f5e6c8" opacity="0.88">
      They stand in your vale, visible from the road, and still there tomorrow.
    </text>
  </g>

  <!-- footer: HUD pills, microcopy in full cream, breathing room below -->
  <rect x="0" y="672" width="{W}" height="228" fill="url(#footshade)"/>
  {pills}
  <g font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
     text-anchor="middle">
    <text x="{W2}" y="812" font-size="16" fill="#efe8c8" opacity="0.9">
      40,800 coins for the set · +43 renown · no wallet needed to start
    </text>
    <text x="{W2}" y="844" font-size="16" font-weight="700" letter-spacing="7.5"
          fill="#f4b942" opacity="0.95">AMBERVALE.FUN</text>
  </g>
  {grainrect}
</svg>
'''.format(W=W, H=H, W2=W / 2, grain=GRAIN, ground=ground, paths=paths,
           scatter=scatter, props=props, pills=pills,
           grainrect=grain_rect(W, H, 0.04))


open('/home/user/ambervale/docs/brand/market.svg', 'w').write(build())
print('written')
