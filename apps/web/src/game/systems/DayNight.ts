/**
 * The 300-second day/night cycle.
 *
 * Cycle position `u` runs [0,1): day until DAY.dayEnd, dusk until duskEnd,
 * night until nightEnd, then dawn back round to 0. Sessions open at
 * DAY.sessionStartU — just after sunrise, so a new player sees the farm lit.
 *
 * Darkness is driven through the Light2D ambient colour rather than a flat
 * black overlay, so the lamps, windows and starglow crops genuinely punch
 * holes in the night instead of sitting on top of a grey sheet.
 *
 * This class owns the clock and the lights only. The full-screen washes live
 * in SkyOverlays, on the HUD scene, because a scroll-locked object on the
 * world camera is still scaled by that camera's zoom.
 */

import { DAY, LAMPS, TILE, WINDOW_LIGHTS } from '@ambervale/game-config';
import type Phaser from 'phaser';

/** Peak darkness at full night, as a fraction of full black. */
export const MAX_DARKNESS = 0.62;

/** Ambient hue the world drifts toward at midnight. */
const NIGHT_TINT = { r: 0.42, g: 0.55, b: 1.0 };

const smooth = (t: number) => t * t * (3 - 2 * t);

export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';

export interface DayNightOptions {
  /** Starting cycle position; defaults to DAY.sessionStartU. */
  startU?: number;
}

export class DayNight {
  /** Normalised cycle position in [0,1). */
  u: number;

  private readonly scene: Phaser.Scene;
  private readonly lampLights: Phaser.GameObjects.Light[] = [];
  private readonly windowLights: Phaser.GameObjects.Light[] = [];
  /** Lights owned by gameplay (player, starglow crops) that dim with the sun. */
  private readonly dynamicLights = new Set<Phaser.GameObjects.Light>();

  constructor(scene: Phaser.Scene, options: DayNightOptions = {}) {
    this.scene = scene;
    this.u = options.startU ?? DAY.sessionStartU;

    scene.lights.enable();
    this.buildStaticLights();
    this.apply();
  }

  get phase(): DayPhase {
    if (this.u < DAY.dayEnd) return 'day';
    if (this.u < DAY.duskEnd) return 'dusk';
    if (this.u < DAY.nightEnd) return 'night';
    return 'dawn';
  }

  /** 0 in full daylight → 1 at the darkest point of night. */
  get nightAmount(): number {
    const u = this.u;
    if (u < DAY.dayEnd) return 0;
    if (u < DAY.duskEnd) return smooth((u - DAY.dayEnd) / (DAY.duskEnd - DAY.dayEnd));
    if (u < DAY.nightEnd) return 1;
    return smooth(1 - (u - DAY.nightEnd) / (1 - DAY.nightEnd));
  }

  /** True once it is dark enough for lamps and starglow to be worth lighting. */
  get isDark(): boolean {
    return this.nightAmount > 0.05;
  }

  private buildStaticLights(): void {
    for (const lamp of LAMPS) {
      this.lampLights.push(
        this.scene.lights.addLight(
          lamp.x * TILE + TILE / 2,
          lamp.y * TILE + TILE / 2 - 34,
          220,
          0xffc46b,
          0,
        ),
      );
    }
    for (const win of WINDOW_LIGHTS) {
      this.windowLights.push(
        this.scene.lights.addLight(
          win.x * TILE + TILE / 2,
          win.y * TILE + TILE / 2,
          win.r * TILE,
          0xffd79a,
          0,
        ),
      );
    }
  }

  update(deltaMs: number): void {
    this.u = (this.u + deltaMs / 1000 / DAY.cycleSec) % 1;
    this.apply();
  }

  /**
   * Winds the clock forward to sunrise. Sleeping at the house.
   *
   * Purely cosmetic, and deliberately so: growth, egg timers and respawns are
   * all server-side wall-clock, and letting a client skip them would be the
   * single largest exploit in the game. What sleeping buys is the view.
   */
  skipToDawn(): boolean {
    // Already daylight — nothing to skip, and pretending otherwise would just
    // yank the lighting for no reason.
    if (this.u < DAY.dayEnd) return false;
    this.u = DAY.sessionStartU;
    this.apply();
    return true;
  }

  /**
   * Registers a gameplay light (player lantern, starglow crop) that should
   * fade in and out with the night rather than burn at constant intensity.
   */
  addDynamicLight(x: number, y: number, radius: number, color: number): Phaser.GameObjects.Light {
    const light = this.scene.lights.addLight(x, y, radius, color, 0);
    this.dynamicLights.add(light);
    return light;
  }

  removeDynamicLight(light: Phaser.GameObjects.Light): void {
    this.dynamicLights.delete(light);
    this.scene.lights.removeLight(light);
  }

  /** Recomputes ambient colour and light intensities for the current `u`. */
  apply(): void {
    const night = this.nightAmount;

    const level = 1 - MAX_DARKNESS * night;
    const r = Math.round(255 * level * (1 - night * (1 - NIGHT_TINT.r)));
    const g = Math.round(255 * level * (1 - night * (1 - NIGHT_TINT.g)));
    const b = Math.round(255 * level * (1 - night * (1 - NIGHT_TINT.b)));
    this.scene.lights.setAmbientColor((r << 16) | (g << 8) | b);

    const intensity = night * 1.6;
    for (const l of this.lampLights) l.setIntensity(intensity);
    for (const l of this.windowLights) l.setIntensity(intensity * 0.85);
    for (const l of this.dynamicLights) l.setIntensity(intensity);
  }

  destroy(): void {
    for (const l of this.dynamicLights) this.scene.lights.removeLight(l);
    this.dynamicLights.clear();
  }
}
