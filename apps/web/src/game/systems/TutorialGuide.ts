/**
 * In-world tutorial guidance: the pulsing ring, the bouncing chevron, the
 * camera peek, and the logic that decides when a step is finished.
 *
 * Completion is judged from authoritative farm state, so the only way to
 * advance is to actually do the thing. The one exception is step 1, which is
 * pure proximity — nothing server-side records "walked into a field".
 */

import type Phaser from 'phaser';
import { bridge } from '../bridge';
import { FIELD_PROXIMITY, TUTORIAL, TUTORIAL_DONE } from '../tutorial';
import { apiPatch, type FarmState } from '@/lib/api';
import type { Interactions } from './Interactions';
import type { PlayerController } from './PlayerController';

/** How long the camera lingers on a new step's target. */
const PEEK_MS = 1350;

export class TutorialGuide {
  private readonly scene: Phaser.Scene;
  private readonly player: PlayerController;
  private readonly interactions: Interactions;

  private ring: Phaser.GameObjects.Arc;
  private chevron: Phaser.GameObjects.Text;

  private step = -1;
  private elapsed = 0;
  private advancing = false;
  /** World position of the current objective, for HudScene's edge arrow. */
  target: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, player: PlayerController, interactions: Interactions) {
    this.scene = scene;
    this.player = player;
    this.interactions = interactions;

    this.ring = scene.add.circle(0, 0, 34).setDepth(7500).setVisible(false);
    this.ring.setStrokeStyle(3, 0xf4b942, 0.9);

    this.chevron = scene.add
      .text(0, 0, '▼', {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '26px',
        color: '#f4b942',
        stroke: '#0a2e3d',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(7501)
      .setVisible(false);
  }

  private get farm(): FarmState | null {
    return bridge.farm;
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs;

    const farm = this.farm;
    if (!farm || !bridge.started) {
      this.hide();
      return;
    }

    const step = farm.user.tutorialStep;
    if (step === TUTORIAL_DONE || step >= TUTORIAL.length) {
      this.hide();
      this.interactions.forcedSeed = null;
      return;
    }

    const def = TUTORIAL[step]!;

    // New step: peek the camera at the objective, then hand it back.
    if (step !== this.step) {
      this.step = step;
      this.interactions.forcedSeed = def.forceSeed ?? null;
      const peek = def.target(farm) ?? def.approach(farm);
      if (peek) this.peekAt(peek.x, peek.y);
    }

    this.target = def.target(farm);
    this.drawMarker();
    void this.checkCompletion(farm, step, def);
  }

  private drawMarker(): void {
    if (!this.target) {
      this.hide();
      return;
    }

    const { x, y } = this.target;
    const pulse = 1 + Math.sin(this.elapsed / 260) * 0.14;

    this.ring.setPosition(x, y).setVisible(true).setScale(pulse);
    this.ring.setStrokeStyle(3, 0xf4b942, 0.55 + 0.45 * Math.sin(this.elapsed / 300));

    this.chevron.setPosition(x, y - 44 + Math.sin(this.elapsed / 220) * 6).setVisible(true);
  }

  private hide(): void {
    this.ring.setVisible(false);
    this.chevron.setVisible(false);
    this.target = null;
  }

  /**
   * Eases the camera to the objective and back, so a new step shows the player
   * where to go without teleporting them.
   */
  private peekAt(x: number, y: number): void {
    const cam = this.scene.cameras.main;
    const follow = (cam as unknown as { _follow?: Phaser.GameObjects.GameObject })._follow;
    if (!follow) return;

    cam.stopFollow();
    cam.pan(x, y, PEEK_MS, 'Sine.easeInOut', false, (_c, progress) => {
      if (progress < 1) return;
      cam.pan(this.player.x, this.player.y, PEEK_MS * 0.7, 'Sine.easeInOut', false, (_c2, p2) => {
        if (p2 >= 1) cam.startFollow(follow, true, 0.09, 0.09);
      });
    });
  }

  private async checkCompletion(
    farm: FarmState,
    step: number,
    def: (typeof TUTORIAL)[number],
  ): Promise<void> {
    if (this.advancing || def.textOnly) return;

    let complete = def.done(farm);

    // Step 1 has no server-side counter — it is simply "are you there yet".
    if (step === 1 && this.target) {
      complete = this.player.distanceTo(this.target.x, this.target.y) < FIELD_PROXIMITY;
    }

    if (!complete) return;

    this.advancing = true;
    try {
      const next = step + 1;
      await apiPatch('/tutorial/step', { step: next });
      const current = bridge.farm;
      if (current) {
        bridge.emit('farm', { ...current, user: { ...current.user, tutorialStep: next } });
      }
      if (next >= TUTORIAL.length) {
        bridge.toast('good', 'Tutorial complete — the farm is yours. Keep an eye on the quests.');
      }
    } catch {
      // A failed advance is harmless: the condition still holds, so the next
      // frame simply tries again.
    } finally {
      this.advancing = false;
    }
  }

  destroy(): void {
    this.ring.destroy();
    this.chevron.destroy();
  }
}
