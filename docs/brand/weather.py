"""
The weather banner: one vale, four skies.

The obvious layout is a contact sheet — four boxes, four little scenes — and
it reads as a spec sheet rather than as a place. So the landscape is continuous
across the whole width and only the *sky* changes, band by band, left to right.
The same ridge, the same mill, the same farmer, four different days over them.
That is also literally what the feature is.

Bands run warm to cool so the eye has somewhere to travel: Golden Day, Clear
Skies, Rain, Morning Mist. The rain band is given the most contrast because it
is the one weather everybody recognises instantly at thumbnail size.
"""

import math
import random
import sys

sys.path.insert(0, '/tmp/claude-0/-home-user-ambervale/7288ee65-67c1-5aa4-85f0-6d76b626d884/scratchpad')
from gen import ridge_y, ridge_path, ridge_line, GRAIN, grain_rect

W, H = 1600, 900
BANDS = 4
BW = W / BANDS

# Ridges shared by every band — this is one landscape, not four.
R = [dict(base=548, amp=16, wl=1180, phase=0.4),
     dict(base=628, amp=14, wl=900, phase=2.1),
     dict(base=706, amp=11, wl=1420, phase=4.0)]
FG = dict(base=790, amp=8, wl=1040, phase=1.1)

SKIES = [
    dict(key='golden', name='GOLDEN DAY', note='+10% on every sale',
         top='#3d2a18', mid='#8a5a24', low='#e2a34c', glow='#ffd694',
         cast='#ffbe63', mode='screen', wash=0.20),
    dict(key='clear', name='CLEAR SKIES', note='A plain day’s work',
         top='#0d2740', mid='#1f5570', low='#6fa08a', glow='#cfe6d2',
         cast='#9fd8c0', mode='screen', wash=0.07),
    dict(key='rain', name='RAIN', note='Crops grow 15% faster',
         top='#101d29', mid='#28414f', low='#4d6a72', glow='#9fc0cc',
         cast='#2c4а57'.replace('а','a'), mode='multiply', wash=0.42),
    dict(key='mist', name='MORNING MIST', note='The crows stay away',
         top='#1b2c33', mid='#40606a', low='#9db6b6', glow='#e2ecef',
         cast='#cfe0e2', mode='screen', wash=0.30),
]


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


def windmill(x, base, s, col):
    """The one landmark tall enough to cross a band edge, which is the point:
    it stitches the panels into a single place."""
    w, h = 46 * s, 132 * s
    cx, cy = x, base - h + 8 * s
    sails = "".join(
        '<g transform="rotate(%.1f %.1f %.1f)">'
        '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
        '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s" opacity="0.8"/>'
        '</g>'
        % (14 + a, cx, cy,
           cx - 2.4 * s, cy - 96 * s, 4.8 * s, 96 * s, 1.8 * s, col,
           cx + 2.4 * s, cy - 90 * s, 15 * s, 68 * s, col)
        for a in (0, 90, 180, 270))
    return (
        '<g>'
        '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
        % (x - w / 2, base, x - w * 0.30, base - h, x + w * 0.30, base - h, x + w / 2, base, col) +
        '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/>'
        % (x - w * 0.40, base - h + 2 * s, x, base - h - 22 * s, x + w * 0.40, base - h + 2 * s, col) +
        '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="#ffcf72" opacity="0.9"/>'
        % (x - 7 * s, base - h * 0.42, 14 * s, 16 * s, 2.5 * s) +
        sails +
        '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (cx, cy, 6 * s, col) +
        '</g>')


def farmer(x, base, h, col):
    """Chibi proportions, as in the game. Eight-heads-tall came out as a
    lamppost in a hat; the head is over a third of him and the brim is wider
    than his shoulders, and the silhouette only reads as *this* farmer if it
    keeps that."""
    head_r = h * 0.165
    brim_rx = h * 0.255
    body_w = h * 0.26
    leg_h = h * 0.20
    hip = base - leg_h
    shoulder = hip - h * 0.26
    head_y = shoulder - head_r * 0.92
    brim_y = head_y - head_r * 0.42
    return (
        '<g fill="%s">'
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f"/>'
        '<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f"/>'
        '<path d="M %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f Z"/>'
        '<circle cx="%.2f" cy="%.2f" r="%.2f"/>'
        '<ellipse cx="%.2f" cy="%.2f" rx="%.2f" ry="%.2f"/>'
        '<path d="M %.2f %.2f q %.2f %.2f %.2f 0 Z"/>'
        '</g>'
        % (col,
           x - body_w * 0.46, hip, body_w * 0.32, leg_h, body_w * 0.10,
           x + body_w * 0.14, hip, body_w * 0.32, leg_h, body_w * 0.10,
           x - body_w * 0.44, hip + h * 0.02, x - body_w * 0.52, shoulder,
           x + body_w * 0.52, shoulder, x + body_w * 0.44, hip + h * 0.02,
           x, head_y, head_r,
           x, brim_y, brim_rx, head_r * 0.40,
           x - brim_rx * 0.52, brim_y - head_r * 0.14, brim_rx * 0.52, -head_r * 1.30, brim_rx * 1.04))


def crow(x, y, s, col):
    return ('<path d="M %.1f %.1f q %.1f %.1f %.1f 0 q %.1f %.1f %.1f 0" fill="none" '
            'stroke="%s" stroke-width="%.1f" stroke-linecap="round"/>'
            % (x - 9 * s, y, 4.5 * s, -6 * s, 9 * s, 4.5 * s, -6 * s, 9 * s, col, 1.9 * s))


def build():
    random.seed(20260817)

    # --- sky bands ------------------------------------------------------
    grads, bands, weather, labels, edges, clips, casts, rainfront = [], [], [], [], [], [], [], []
    for i, s in enumerate(SKIES):
        x0 = i * BW
        grads.append(
            '<linearGradient id="sky%d" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="%s"/>'
            '<stop offset="0.42" stop-color="%s"/>'
            '<stop offset="0.86" stop-color="%s"/>'
            '<stop offset="1" stop-color="%s"/></linearGradient>'
            % (i, s['top'], s['mid'], s['low'], s['glow']))
        bands.append('<rect x="%.1f" y="0" width="%.1f" height="%d" fill="url(#sky%d)"/>'
                     % (x0, BW + 1, H, i))
        clips.append('<clipPath id="band%d"><rect x="%.1f" y="0" width="%.1f" height="%d"/></clipPath>'
                     % (i, x0, BW + 1, H))

        # A soft seam rather than a hard rule: four scenes with borders read as
        # a spec sheet, and this is meant to read as one place over four days.
        if i:
            edges.append(
                '<rect x="%.1f" y="0" width="1.5" height="%d" fill="#f7ead2" opacity="0.13"/>'
                % (x0, H))

        cx = x0 + BW / 2
        sky_bits = []

        # --- per-sky weather ------------------------------------------------
        if s['key'] == 'golden':
            sky_bits.append('<circle cx="%.1f" cy="330" r="112" fill="url(#sunhalo)"/>' % cx)
            sky_bits.append('<circle cx="%.1f" cy="330" r="62" fill="#ffe6ae" opacity="0.95"/>' % cx)
            sky_bits.append("".join(
                '<path d="M %.1f 330 L %.0f %.0f L %.0f %.0f Z" fill="#ffd489" opacity="0.05"/>'
                % (cx, cx + math.cos(math.radians(a)) * 620, 330 + math.sin(math.radians(a)) * 620,
                   cx + math.cos(math.radians(a + 5)) * 620, 330 + math.sin(math.radians(a + 5)) * 620)
                for a in (-150, -120, -92, -64, -34)))
        elif s['key'] == 'clear':
            sky_bits.append("".join(
                '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#fff3d4" opacity="%.2f"/>'
                % (random.uniform(x0 + 20, x0 + BW - 20), random.uniform(40, 300),
                   random.choice((1.0, 1.5, 2.0)), random.uniform(0.25, 0.75))
                for _ in range(30)))
            sky_bits.append(crow(cx - 70, 210, 1.5, '#0d2430')
                           + crow(cx + 10, 250, 1.1, '#0d2430')
                           + crow(cx - 24, 158, 0.9, '#0d2430'))
        elif s['key'] == 'rain':
            # Drops are drawn to the ridge, not to the frame bottom: rain that
            # falls through the hills reads as an overlay laid on top of the
            # picture instead of weather happening inside it.
            drops = []
            for _ in range(150):
                dx = random.uniform(x0, x0 + BW)
                dy = random.uniform(-40, 700)
                ln = random.uniform(16, 34)
                drops.append(
                    '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#dfeaf2" '
                    'stroke-width="%.1f" stroke-linecap="round" opacity="%.2f"/>'
                    % (dx, dy, dx - ln * 0.24, dy + ln, random.uniform(1.0, 1.9),
                       random.uniform(0.18, 0.5)))
            sky_bits.append("".join(drops))
            sky_bits.append('<rect x="%.1f" y="0" width="%.1f" height="%d" fill="#5d7a86" opacity="0.22"/>'
                           % (x0, BW + 1, H))
        else:
            sky_bits.append("".join(
                '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#e2ecef" opacity="%.2f"/>'
                % (x0 + random.uniform(20, BW - 20), y, random.uniform(120, 210),
                   random.uniform(12, 26), random.uniform(0.22, 0.44))
                for y in (352, 402, 452, 500, 548, 596, 644, 692)))

        blur = ' filter="url(#soft)"' if s['key'] == 'mist' else ''
        weather.append('<g clip-path="url(#band%d)"%s>%s</g>' % (i, blur, "".join(sky_bits)))

        # The band's light laid back over the shared landscape. Without this the
        # ground keeps one flat green under four different skies, and the whole
        # thing reads as a green photograph with coloured rectangles pasted
        # behind it rather than as one place on four days.
        casts.append(
            '<rect x="%.1f" y="0" width="%.1f" height="%d" fill="%s" opacity="%.2f" '
            'style="mix-blend-mode:%s"/>'
            % (x0, BW + 1, H, s['cast'], s['wash'], s['mode']))

        # Rain falls in front of the hills as well as behind them.
        if s['key'] == 'rain':
            front = "".join(
                '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#e8f1f6" '
                'stroke-width="%.1f" stroke-linecap="round" opacity="%.2f"/>'
                % (dx, dy, dx - ln * 0.24, dy + ln, random.uniform(1.4, 2.4), random.uniform(0.22, 0.55))
                for dx, dy, ln in (
                    (random.uniform(x0, x0 + BW), random.uniform(0, H), random.uniform(20, 40))
                    for _ in range(70)))
            rainfront.append('<g clip-path="url(#band%d)">%s</g>' % (i, front))

        # --- caption --------------------------------------------------------
        labels.append(
            '<text x="%.1f" y="800" text-anchor="middle" font-family="ui-sans-serif, system-ui, '
            '-apple-system, Segoe UI, Roboto, sans-serif" font-size="27" font-weight="700" '
            'letter-spacing="4.2" fill="#f7ead2">%s</text>'
            '<text x="%.1f" y="832" text-anchor="middle" font-family="ui-sans-serif, system-ui, '
            '-apple-system, Segoe UI, Roboto, sans-serif" font-size="16.5" fill="#f7ead2" '
            'opacity="0.72">%s</text>'
            % (cx, s['name'], cx, s['note']))

    # --- one landscape across all four ------------------------------------
    def clumps(lo, hi, groups, per, spread):
        out = []
        for g in range(groups):
            c = lo + (hi - lo) * (g + 0.5) / groups + random.uniform(-46, 46)
            out += [c + random.uniform(-spread, spread) for _ in range(random.randint(per - 1, per + 2))]
        return out

    far = "".join(pine(x, ridge_y(x, **R[0]) + 3, random.uniform(18, 30), '#2f5a4a')
                  for x in clumps(-40, W + 40, 11, 4, 44))
    mid = "".join(pine(x, ridge_y(x, **R[1]) + 3, random.uniform(32, 54), '#1d4234')
                  for x in clumps(-30, W + 30, 8, 3, 54))
    near = "".join(pine(x, ridge_y(x, **R[2]) + 4, random.uniform(52, 82), '#0d2418')
                   for x in clumps(-20, W + 20, 6, 2, 60))

    tuft_xs, gx = [], -10
    while gx < W + 20:
        for _ in range(random.randint(2, 5)):
            tuft_xs.append(gx + random.uniform(-9, 9))
        gx += random.uniform(30, 70)
    tufts = "".join(
        '<path d="M %.1f %.1f q %.1f %.1f %.1f %.1f" fill="none" stroke="#061710" '
        'stroke-width="%.1f" stroke-linecap="round"/>'
        % (x, ridge_y(x, **FG) + 2, h * 0.3, -h * 0.62, h * 0.12, -h, max(1.5, h * 0.12))
        for x, h in ((x, random.uniform(9, 34)) for x in tuft_xs))

    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"
     role="img" aria-label="Ambervale — every day, a different vale">
  <title>AMBERVALE — weather</title>
  <defs>
    {grads}
    <radialGradient id="sunhalo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffe6ae" stop-opacity="0.85"/>
      <stop offset="0.55" stop-color="#ffd489" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#ffd489" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="seam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#000" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="footer" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#04120c" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#04120c" stop-opacity="0.86"/>
      <stop offset="1" stop-color="#04120c" stop-opacity="0.97"/>
    </linearGradient>
    <linearGradient id="topshade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#04120c" stop-opacity="0.62"/>
      <stop offset="1" stop-color="#04120c" stop-opacity="0"/>
    </linearGradient>
    {grain}
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
    {clips}
  </defs>

  <!-- sky, band by band -->
  {bands}
  {weather}

  <!-- one landscape, shared: same ridge, same mill, four days over them -->
  <path d="{r0}" fill="#1b4a3c"/>
  {far}
  <path d="{r1}" fill="#123528"/>
  {mid}
  {mill}
  <path d="{r2}" fill="#08251a"/>
  {near}
  {figure}
  <path d="{rfg}" fill="#04150e"/>
  {tufts}

  <!-- the day's light, cast back down over the shared land -->
  {casts}
  {rainfront}
  {edges}

  <!-- headline: top-left, clear of every band label -->
  <rect width="{W}" height="300" fill="url(#topshade)"/>
  <text x="72" y="118" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="66" font-weight="800" letter-spacing="-1.2" fill="#f7ead2">Every day, a different vale.</text>
  <text x="74" y="168" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="25" fill="#f7ead2" opacity="0.82">
    The sky decides how the farm works. The market decides what it is worth.
  </text>
  <text x="74" y="206" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="21" fill="#f4b942" opacity="0.95" letter-spacing="0.4">
    Every farm in the vale sees the same day — and tomorrow’s, a day early.
  </text>

  <!-- footer band carrying the captions and the wordmark -->
  <rect x="0" y="700" width="{W}" height="200" fill="url(#footer)"/>
  {labels}
  <text x="{W2}" y="874" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="18" font-weight="700" letter-spacing="7.5" fill="#f4b942" opacity="0.92">AMBERVALE.FUN</text>
  {grainrect}
</svg>
'''.format(W=W, H=H, W2=W / 2,
           grads="\n    ".join(grads), grain=GRAIN,
           bands="\n  ".join(bands), weather="\n  ".join(weather), edges="\n  ".join(edges),
           r0=ridge_path(W, H, **R[0]), far=far,
           r1=ridge_path(W, H, **R[1]), mid=mid,
           mill=windmill(1092, ridge_y(1092, **R[1]) + 8, 1.05, '#0b2419'),
           r2=ridge_path(W, H, **R[2]), near=near,
           figure=farmer(560, ridge_y(560, **R[2]) + 8, 152, '#061710'),
           rfg=ridge_path(W, H, **FG), tufts=tufts,
           labels="\n  ".join(labels), grainrect=grain_rect(W, H, 0.055),
           clips="\n    ".join(clips), casts="\n  ".join(casts),
           rainfront="\n  ".join(rainfront))


open('/home/user/ambervale/docs/brand/weather.svg', 'w').write(build())
print('written')
