/**
 * Top-right minimap.
 *
 * The tile map is baked into a single small canvas texture once; per frame we
 * only move the viewport rectangle and the player dot, so the cost is two
 * transform updates rather than a second render pass over the world.
 */

import {
  BUILDS,
  LANDMARKS,
  MINIMAP_WIDTH,
  TILE,
  WORLD,
  isBuildKey,
  structureAt,
} from '@ambervale/game-config';
import type Phaser from 'phaser';
import { Tile, type WorldMap } from '../world/tilemap';

const TILE_CSS: Record<Tile, string> = {
  [Tile.Grass0]: '#3f7238',
  [Tile.Grass1]: '#4c8341',
  [Tile.Grass2]: '#5b9450',
  [Tile.Dirt]: '#8b6e46',
  [Tile.Water]: '#2f6f92',
  [Tile.Cave]: '#241f1c',
  [Tile.CaveWall]: '#38322b',
};

const PANEL_MARGIN = 12;
const BORDER = 2;

export class Minimap {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly viewRect: Phaser.GameObjects.Rectangle;
  private readonly playerDot: Phaser.GameObjects.Arc;
  private readonly scale: number;
  private readonly height: number;
  /** Build keys already marked, so repeated farm snapshots do not stack dots. */
  private readonly buildDots = new Set<string>();

  constructor(scene: Phaser.Scene, map: WorldMap) {
    this.scene = scene;
    this.scale = MINIMAP_WIDTH / WORLD.w;
    this.height = Math.round(WORLD.h * this.scale);

    this.bakeTexture(map);

    const frame = scene.add
      .rectangle(
        -BORDER,
        -BORDER,
        MINIMAP_WIDTH + BORDER * 2,
        this.height + BORDER * 2,
        0x0a2e3d,
        0.85,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(BORDER, 0xf5e6c8, 0.5);

    const image = scene.add
      .image(0, 0, 'minimap')
      .setOrigin(0, 0)
      .setDisplaySize(MINIMAP_WIDTH, this.height);

    const dots: Phaser.GameObjects.GameObject[] = [];
    for (const landmark of LANDMARKS) {
      const s = structureAt(landmark.key);
      dots.push(
        scene.add
          .circle(s.x * this.scale, s.y * this.scale, 2.4, landmark.color, 1)
          .setStrokeStyle(1, 0x0a2e3d, 0.7),
      );
    }

    this.viewRect = scene.add
      .rectangle(0, 0, 10, 10)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(1.5, 0xf5e6c8, 0.9)
      .setFillStyle(0xffffff, 0.06);

    // Added last so it sits above the landmarks.
    this.playerDot = scene.add.circle(0, 0, 3, 0xf4b942, 1).setStrokeStyle(1, 0x2a1a05, 0.9);

    this.container = scene.add
      .container(0, 0, [frame, image, ...dots, this.viewRect, this.playerDot])
      .setScrollFactor(0)
      .setDepth(10_000);

    this.reposition();
    scene.scale.on('resize', this.reposition, this);
  }

  /**
   * Marks landmarks the player has built.
   *
   * The fixed dots above are the same on every farm; these are not, which is
   * the point of them. Only builds carrying a `landmark` label are marked —
   * the flower garden sits inside the hub, where it would be one more dot in a
   * cluster of them, while a tower on the east ridge is genuinely how you find
   * your way about.
   */
  setBuilds(keys: readonly string[]): void {
    for (const key of keys) {
      if (this.buildDots.has(key) || !isBuildKey(key)) continue;
      const def = BUILDS[key];
      if (!def.landmark) continue;
      this.buildDots.add(key);
      const dot = this.scene.add
        .circle(def.at.x * this.scale, def.at.y * this.scale, 2.4, 0xf4d35e, 1)
        .setStrokeStyle(1, 0x0a2e3d, 0.7);
      // Below the viewport rectangle and the player dot, which were added last.
      this.container.addAt(dot, this.container.length - 2);
    }
  }

  /**
   * Paints the tile grid at the minimap's final pixel size, so the texture is
   * never scaled up and needs no filtering decision.
   */
  private bakeTexture(map: WorldMap): void {
    if (this.scene.textures.exists('minimap')) this.scene.textures.remove('minimap');
    const tex = this.scene.textures.createCanvas('minimap', MINIMAP_WIDTH, this.height);
    if (!tex) return;
    const ctx = tex.getContext();
    const step = this.scale;
    for (let ty = 0; ty < WORLD.h; ty++) {
      for (let tx = 0; tx < WORLD.w; tx++) {
        ctx.fillStyle = TILE_CSS[map.at(tx, ty)];
        // Ceil the span so neighbouring cells overlap instead of leaving seams.
        ctx.fillRect(tx * step, ty * step, Math.ceil(step), Math.ceil(step));
      }
    }
    tex.refresh();
  }

  private reposition(): void {
    const { width } = this.scene.scale;
    this.container.setPosition(width - MINIMAP_WIDTH - PANEL_MARGIN, PANEL_MARGIN);
  }

  /** Call once per frame with the main camera and the player's world position. */
  update(camera: Phaser.Cameras.Scene2D.Camera, playerX: number, playerY: number): void {
    const pxToMap = this.scale / TILE;

    this.viewRect.setPosition(
      (camera.worldView.centerX ?? 0) * pxToMap,
      (camera.worldView.centerY ?? 0) * pxToMap,
    );
    this.viewRect.setSize(camera.worldView.width * pxToMap, camera.worldView.height * pxToMap);
    this.playerDot.setPosition(playerX * pxToMap, playerY * pxToMap);
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  destroy(): void {
    this.scene.scale.off('resize', this.reposition, this);
    this.container.destroy();
  }
}
