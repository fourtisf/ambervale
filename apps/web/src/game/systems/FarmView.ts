/**
 * Renders authoritative farm state into the world.
 *
 * Everything here is a projection of what the server said. The client owns no
 * gameplay truth: growth is derived from the server's `plantedAt` plus a
 * one-time clock-skew offset, never from a local timer that could drift or be
 * wound forward.
 */

import {
  BUILDS,
  CROPS,
  NODES,
  PLOTS,
  TILE,
  isBuildKey,
  plotAt,
  nodeSlotAt,
  type CropKey,
} from '@ambervale/game-config';
import type Phaser from 'phaser';
import type { FarmState } from '@/lib/api';
import { CROP_STAGES, SPRITE_SCALE, cropTextureKey, rockTextureKey } from '../world/textures';
import type { AnimalLife } from './AnimalLife';
import type { DayNight } from './DayNight';
import type { Occlusion } from './Occlusion';

/** Growth fraction → sprite stage. Stage 3 is harvest-ready. */
function stageFor(progress: number): number {
  if (progress >= 1) return CROP_STAGES - 1;
  if (progress >= 0.62) return 2;
  if (progress >= 0.28) return 1;
  return 0;
}

interface PlotView {
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  /** The crow, created lazily — most plots never see one. */
  crow?: Phaser.GameObjects.Image;
  /** Point light for starglow at night, created lazily. */
  light?: Phaser.GameObjects.Light;
}

export class FarmView {
  private readonly scene: Phaser.Scene;
  private readonly dayNight: DayNight;

  private readonly plots = new Map<number, PlotView>();
  private readonly nodes = new Map<number, Phaser.GameObjects.Image>();
  /** Landmarks the player has built, keyed by BuildKey. */
  private readonly builds = new Map<string, Phaser.GameObjects.Image>();
  /** Cosmetic animal behaviour; the server owns whether a yield exists. */
  private animalLife?: AnimalLife;
  private occlusion?: Occlusion;
  private readonly ground = new Map<string, Phaser.GameObjects.Image>();

  private state: FarmState | null = null;
  /** serverNow - clientNow at hydration; added to Date.now() everywhere after. */
  private clockSkewMs = 0;
  private elapsed = 0;

  constructor(
    scene: Phaser.Scene,
    dayNight: DayNight,
    animalLife?: AnimalLife,
    occlusion?: Occlusion,
  ) {
    this.scene = scene;
    this.dayNight = dayNight;
    this.animalLife = animalLife;
    this.occlusion = occlusion;
    this.buildPlots();
  }

  /** Server time as this client best understands it. */
  now(): number {
    return Date.now() + this.clockSkewMs;
  }

  private buildPlots(): void {
    for (const slot of PLOTS) {
      const x = slot.x * TILE + TILE / 2;
      const y = slot.y * TILE + TILE / 2;

      const soil = this.scene.add
        .image(x, y, 'soil')
        .setScale(SPRITE_SCALE)
        .setDepth(slot.y * TILE - 20)
        .setPipeline('Light2D')
        .setVisible(false);

      const ring = this.scene.add
        .image(x, y, 'readyRing')
        .setScale(SPRITE_SCALE)
        .setDepth(slot.y * TILE - 10)
        .setVisible(false);

      const crop = this.scene.add
        .image(x, y + TILE / 2, cropTextureKey('sunflower', 0))
        .setOrigin(0.5, 1)
        .setScale(SPRITE_SCALE)
        .setDepth(slot.y * TILE)
        .setPipeline('Light2D')
        .setVisible(false);

      this.plots.set(slot.index, { soil, crop, ring });
    }
  }

  /** Applies a fresh authoritative snapshot. */
  hydrate(state: FarmState): void {
    // Take the skew once, from the payload that carried it.
    this.clockSkewMs = state.serverNow - Date.now();
    this.state = state;

    this.syncPlots(state);
    this.syncBuilds(state);
    this.syncNodes(state);
    this.syncAnimals(state);
    this.syncGround(state);
  }

  private syncPlots(state: FarmState): void {
    const byIndex = new Map(state.plots.map((p) => [p.index, p]));

    for (const [index, view] of this.plots) {
      const plot = byIndex.get(index);
      const slot = plotAt(index);
      if (!plot || !slot) continue;

      // A locked zone stays hidden (drawn as dashed ghosts) until it is bought.
      const usable = slot.zone === 'base' || state.expansion[slot.zone] === true;
      view.soil.setVisible(usable);

      // Watered ground stays visibly damp until the crop is lifted. Watering
      // costs a press and brings the harvest forward, and until now the field
      // looked exactly the same afterwards — so the only evidence it had
      // worked was a number in a toast that had already faded.
      const wetKey = plot.watered ? 'soilWet' : 'soil';
      if (view.soil.texture.key !== wetKey) view.soil.setTexture(wetKey);

      if (!usable || !plot.cropKey) {
        view.crop.setVisible(false);
        view.ring.setVisible(false);
        this.clearLight(view);
        continue;
      }

      view.crop.setVisible(true);
    }
  }

  /**
   * Draws whatever has been built, once each.
   *
   * Nothing is ever removed: a landmark cannot be unbuilt, so an image that
   * exists is correct forever and this only has to notice the new ones. Depth
   * comes from the tile row like everything else, so the player walks in front
   * of a tower below them and behind one above.
   */
  private syncBuilds(state: FarmState): void {
    for (const built of state.builds ?? []) {
      const key = built.key;
      if (this.builds.has(key)) continue;
      if (!isBuildKey(key)) continue;

      const def = BUILDS[key];
      const x = def.at.x * TILE + TILE / 2;
      const y = def.at.y * TILE + TILE / 2;

      const image = this.scene.add
        .image(x, y + TILE / 2, `build_${key}`)
        // Anchored at the foot, so tall things stand on the ground rather than
        // hovering over their own tile.
        .setOrigin(0.5, 1)
        .setScale(SPRITE_SCALE)
        .setDepth(def.at.y * TILE)
        .setPipeline('Light2D');

      this.builds.set(key, image);
      // Tall landmarks can hide the player; let Occlusion fade them like oaks.
      this.occlusion?.register(image, () => 1);
    }
  }

  private syncNodes(state: FarmState): void {
    for (const node of state.nodes) {
      const slot = nodeSlotAt(node.index);
      if (!slot) continue;

      let sprite = this.nodes.get(node.index);
      if (!sprite) {
        sprite = this.scene.add
          .image(slot.x * TILE + TILE / 2, slot.y * TILE + TILE, 'oak')
          .setOrigin(0.5, 1)
          .setScale(SPRITE_SCALE)
          .setDepth(slot.y * TILE)
          .setPipeline('Light2D');
        sprite.setData('baseAlpha', 1);
        this.nodes.set(node.index, sprite);
        // An oak is tall enough to swallow the player whole; let Occlusion
        // dim it, reading its own opacity through the data slot below.
        const owned = sprite;
        this.occlusion?.register(owned, () => (owned.getData('baseAlpha') as number) ?? 1);
      }

      const depleted = node.hp <= 0;
      if (node.kind === 'oak') {
        sprite.setTexture(depleted ? 'stump' : 'oak');
      } else {
        sprite.setTexture(rockTextureKey(depleted ? 0 : node.hp));
      }
      // A depleted node stays visible as a stump/rubble so the world does not
      // blink; it just cannot be harvested until respawnAt passes. The alpha
      // goes through the data slot so an occlusion fade can multiply into it
      // instead of the two systems fighting over one property.
      sprite.setData('baseAlpha', depleted ? 0.85 : 1);
      sprite.setAlpha(depleted ? 0.85 : 1);
    }
  }

  private syncAnimals(state: FarmState): void {
    for (const animal of state.animals) {
      this.animalLife?.ensure(animal.index, animal.kind === 'cow' ? 'cow' : 'chicken');
      if (animal.kind === 'cow') this.animalLife?.setMilkReady(animal.ready);
    }
  }

  private syncGround(state: FarmState): void {
    const seen = new Set<string>();

    for (const item of state.groundItems) {
      seen.add(item.id);
      if (this.ground.has(item.id)) continue;

      const sprite = this.scene.add
        .image(item.x, item.y, 'egg')
        .setOrigin(0.5, 1)
        .setScale(SPRITE_SCALE)
        .setDepth(item.y)
        .setPipeline('Light2D');
      this.ground.set(item.id, sprite);
    }

    // Drop anything the server no longer reports (collected elsewhere).
    for (const [id, sprite] of this.ground) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.ground.delete(id);
    }
  }

  private clearLight(view: PlotView): void {
    if (!view.light) return;
    this.dayNight.removeDynamicLight(view.light);
    view.light = undefined;
  }

  /**
   * Advances purely visual state: growth stages, the ready-crop bounce, egg
   * bobbing. Called every frame; does no network work.
   */
  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    const state = this.state;
    if (!state) return;

    const now = this.now();

    for (const plot of state.plots) {
      const view = this.plots.get(plot.index);
      if (!view || !plot.cropKey || plot.plantedAt === null || plot.readyAt === null) continue;

      const span = plot.readyAt - plot.plantedAt;
      const progress = span > 0 ? Math.min(1, (now - plot.plantedAt) / span) : 1;
      const stage = stageFor(progress);

      view.crop.setTexture(cropTextureKey(plot.cropKey, stage));

      // The crow, and the warning that one is coming.
      //
      // Made lazily because the overwhelming majority of plots never have one,
      // and a hidden sprite per plot is a real cost on a field of twenty-one.
      if (plot.crow) {
        if (!view.crow) {
          const slot = plotAt(plot.index)!;
          view.crow = this.scene.add
            .image(slot.x * TILE + TILE / 2, slot.y * TILE + TILE / 2 - 6, 'crow')
            .setOrigin(0.5, 1)
            .setScale(SPRITE_SCALE)
            // Above the crop it is sitting on, so it is never half-hidden by it.
            .setDepth(slot.y * TILE + 6)
            .setPipeline('Light2D');
        }
        // A small hop, on its own phase per plot so a field of crows does not
        // move as one block.
        view.crow.y =
          plotAt(plot.index)!.y * TILE +
          TILE / 2 -
          6 -
          Math.abs(Math.sin(this.elapsed / 320 + plot.index)) * 4;
        view.crow.setFlipX(plot.index % 2 === 0);
      } else if (view.crow) {
        view.crow.destroy();
        view.crow = undefined;
      }

      const ready = progress >= 1;
      view.ring.setVisible(ready);
      if (ready) {
        // Gentle bounce and pulse so a ready crop reads from across the farm.
        const bob = Math.sin(this.elapsed / 220 + plot.index) * 3;
        view.crop.y = plotAt(plot.index)!.y * TILE + TILE / 2 + TILE / 2 + bob;
        view.ring.setAlpha(0.55 + 0.45 * Math.sin(this.elapsed / 260 + plot.index));
        view.ring.setScale(SPRITE_SCALE * (1 + Math.sin(this.elapsed / 300) * 0.06));
      } else {
        view.crop.y = plotAt(plot.index)!.y * TILE + TILE / 2 + TILE / 2;
      }

      // Starglow lights the field at night once it is growing.
      const glows = CROPS[plot.cropKey as CropKey]?.glowsAtNight ?? false;
      if (glows && this.dayNight.isDark && !view.light) {
        view.light = this.dayNight.addDynamicLight(view.crop.x, view.crop.y - 20, 130, 0x9fe8ff);
      } else if ((!glows || !this.dayNight.isDark) && view.light) {
        this.clearLight(view);
      }
    }

    for (const [, sprite] of this.ground) {
      sprite.setScale(SPRITE_SCALE, SPRITE_SCALE * (1 + Math.sin(this.elapsed / 300) * 0.05));
    }
  }

  /**
   * The thwack: the tree shudders the instant the axe lands, before the server
   * has said anything. Purely optimistic — if the hit is rejected the shudder
   * was all that ever happened, which is exactly what a glancing blow looks
   * like. Origin is at the foot, so the angle wobble pivots where trunk meets
   * ground instead of spinning the whole sprite about its middle.
   */
  hitNode(index: number): void {
    const sprite = this.nodes.get(index);
    if (!sprite || sprite.getData('falling') === true) return;

    this.scene.tweens.killTweensOf(sprite);
    sprite.setScale(SPRITE_SCALE);
    this.scene.tweens.add({
      targets: sprite,
      angle: { from: (Math.random() < 0.5 ? -1 : 1) * 3.5, to: 0 },
      scaleX: { from: SPRITE_SCALE * 1.05, to: SPRITE_SCALE },
      scaleY: { from: SPRITE_SCALE * 0.95, to: SPRITE_SCALE },
      duration: 150,
      ease: 'Back.easeOut',
    });
  }

  /**
   * The last hit. A ghost of the standing sprite topples and fades while the
   * real one becomes the stump underneath it — the commit that swaps textures
   * lands milliseconds after this, so animating the real sprite would just be
   * overwritten mid-fall. Call this BEFORE committing the reply, while the
   * standing texture is still on the sprite.
   */
  fellNode(index: number, kind: 'oak' | 'rock'): void {
    const sprite = this.nodes.get(index);
    if (!sprite) return;

    this.scene.tweens.killTweensOf(sprite);
    sprite.setAngle(0).setScale(SPRITE_SCALE);

    if (kind === 'oak') {
      const ghost = this.scene.add
        .image(sprite.x, sprite.y, sprite.texture.key)
        .setOrigin(0.5, 1)
        .setScale(SPRITE_SCALE)
        .setDepth(sprite.depth + 1)
        .setPipeline('Light2D');
      // Hide the real sprite until the stump texture arrives, so the ghost
      // is not falling through a still-standing copy of itself.
      sprite.setData('falling', true);
      sprite.setAlpha(0);
      this.scene.tweens.add({
        targets: ghost,
        angle: (Math.random() < 0.5 ? -1 : 1) * 84,
        alpha: 0,
        duration: 640,
        ease: 'Quad.easeIn',
        onComplete: () => {
          ghost.destroy();
          sprite.setData('falling', false);
          sprite.setAlpha((sprite.getData('baseAlpha') as number) ?? 1);
        },
      });
    }

    // Rocks do not topple — they crack apart where they stand, and the burst
    // the caller plays is the whole show. Either way the ground remembers it.
    this.scene.cameras.main.shake(130, kind === 'oak' ? 0.0045 : 0.003);
  }

  /** Node hp, for the client's optimistic swing feedback. */
  nodeHp(index: number): number {
    const node = this.state?.nodes.find((n) => n.index === index);
    if (!node) return 0;
    if (node.respawnAt !== null && node.respawnAt <= this.now()) {
      const slot = nodeSlotAt(index);
      return slot ? NODES[slot.kind].hits : 0;
    }
    return node.hp;
  }

  destroy(): void {
    for (const view of this.plots.values()) {
      this.clearLight(view);
      view.soil.destroy();
      view.crop.destroy();
      view.crow?.destroy();
      view.ring.destroy();
    }
    this.plots.clear();
    for (const s of this.nodes.values()) s.destroy();
    for (const s of this.ground.values()) s.destroy();
    this.nodes.clear();
    this.ground.clear();
  }
}
