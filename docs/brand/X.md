# X assets

Two files, both generated from the same artwork the game itself draws with —
the farmer from `apps/web/public/brand/mark.svg`, the palette from
`apps/web/src/game/world/terrain.ts` and `textures.ts`.

| File           | Size     | Where it goes   |
| -------------- | -------- | --------------- |
| `x-avatar.png` | 400×400  | Profile picture |
| `x-header.png` | 1500×500 | Header banner   |

The `.svg` beside each PNG is the source of truth. Never hand-edit a PNG —
edit the SVG and re-render, or the two stop describing the same thing.

Re-rendering needs any SVG rasteriser; the repo deliberately does not carry
one, since this is done about twice a year:

```bash
# whichever of these you have
rsvg-convert -w 400  -h 400 docs/brand/x-avatar.svg -o docs/brand/x-avatar.png
rsvg-convert -w 1500 -h 500 docs/brand/x-header.svg -o docs/brand/x-header.png

# or Inkscape
inkscape docs/brand/x-header.svg -w 1500 -h 500 -o docs/brand/x-header.png
```

Check the result at the size it will be seen — the avatar is about 48px in a
timeline, and the header's bottom-left disappears under the avatar.

## What took three attempts

The first two rebuilds added polish — gradients, haze, grain — and still came
back looking cheap, because polish was never the problem.

**The avatar was the wrong category.** A flat disc with a drawing on it has no
reason to feel expensive however well it is shaded. It is now a struck object:
a bevelled rim lit from ten o'clock and dark at four, a recessed enamel field
with an inner shadow, and one dome highlight across the upper left. That last
one is what enamel under curved glass actually looks like, and it is worth
more than any amount of gradient work on the drawing inside.

**The banner was the wrong composition.** It was a panorama: everything the
same size, evenly spread, evenly lit, nothing for the eye to land on. It is
now built around one silhouette against one light — the windmill standing
across a large low sun, with everything else receding from it in tone, from
near-black grass to pale blue-green distance. A farmer stands on the near
ridge for scale, and crows cross the sky, because crows are a thing that
happens in this game.

Depth still comes from the same three cheap tricks, and they still matter:
haze along each crest, a slight blur on the far layers, and film grain at 8%
so nothing is a pure fill.

## Two things the layout is built around

**X crops the avatar to a circle.** The medallion is inset by 4% rather than
drawn hard against the edge, because the crop is the inscribed circle and a
ring on that exact line is one rounding error from being shaved on one side
only. The square is also filled rather than transparent: the file is shown
square in a few places, and transparent corners land white on a light client
and black on a dark one.

**The avatar sits on top of the header's bottom-left.** So nothing that has to
be read lives in the left 320px, the bottom 110px, or the outer eighth of
either side (a phone crops the sides). That corner is deliberately plain
hillside — under an avatar, it still looks like hillside.

## If you edit the header

The ridges come from `ridge_y()` and every tree is planted by calling that
same function at its own x. The first draft hard-coded tree baselines and half
the treeline floated above the hill it was standing on. Keep them sharing one
source of ground.
