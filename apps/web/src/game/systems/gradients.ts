/**
 * Canvas-baked gradient textures.
 *
 * Phaser's Graphics API has no gradient fill, and the dusk/dawn washes and the
 * vignette all need one. Each is painted into a CanvasTexture once at boot and
 * then stretched over the viewport as a scroll-locked image.
 */

import type Phaser from 'phaser';

export type GradientStop = [offset: number, css: string];

function canvas(scene: Phaser.Scene, key: string, w: number, h: number) {
  const existing = scene.textures.exists(key);
  if (existing) scene.textures.remove(key);
  return scene.textures.createCanvas(key, w, h);
}

export function makeVerticalGradient(
  scene: Phaser.Scene,
  key: string,
  stops: GradientStop[],
  w = 8,
  h = 256,
): void {
  const tex = canvas(scene, key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (const [offset, css] of stops) grad.addColorStop(offset, css);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
}

export function makeRadialGradient(
  scene: Phaser.Scene,
  key: string,
  stops: GradientStop[],
  size = 256,
  innerRatio = 0,
): void {
  const tex = canvas(scene, key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, c * innerRatio, c, c, c);
  for (const [offset, css] of stops) grad.addColorStop(offset, css);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

/**
 * A vignette is the inverse of a radial glow: transparent at the centre,
 * opaque at the corners.
 */
export function makeVignette(scene: Phaser.Scene, key: string, size = 512): void {
  makeRadialGradient(
    scene,
    key,
    [
      [0, 'rgba(0,0,0,0)'],
      [0.62, 'rgba(0,0,0,0)'],
      [0.85, 'rgba(4,18,26,0.28)'],
      [1, 'rgba(4,18,26,0.62)'],
    ],
    size,
  );
}
