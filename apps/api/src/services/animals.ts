/**
 * Chickens and the cow.
 *
 * Yields are materialised lazily on read, from timestamps, exactly like node
 * respawns: a farm nobody has opened for a week still comes back with the
 * right number of eggs, and no scheduler has to be running for that to be
 * true. The client's chickens wander and peck purely for charm — whether an
 * egg exists is decided here.
 */

import { ANIMALS } from '@ambervale/game-config';
import type { Prisma } from '@prisma/client';
import { randomCoopPoint } from './farm';

const ms = (sec: number) => sec * 1000;

/** Randomised gap until a hen's next egg. */
function nextLayDelayMs(): number {
  const { layMinSec, layMaxSec } = ANIMALS.chicken;
  return ms(layMinSec + Math.random() * (layMaxSec - layMinSec));
}

/**
 * Materialises due eggs and cow milk.
 *
 * Eggs are capped at ANIMALS.chicken.maxGroundEggs. At the cap a due hen does
 * not lose her egg — her timer is pushed forward instead, so the yield resumes
 * the moment the yard is cleared rather than being silently thrown away.
 */
export async function materialiseAnimalYields(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
): Promise<{ eggsLaid: number; milkReady: boolean }> {
  const due = await tx.animal.findMany({
    where: { userId, nextYieldAt: { lte: now } },
    orderBy: { index: 'asc' },
  });
  if (due.length === 0) {
    const cow = await tx.animal.findFirst({ where: { userId, kind: 'cow' } });
    return { eggsLaid: 0, milkReady: cow?.ready ?? false };
  }

  let groundEggs = await tx.groundItem.count({ where: { userId, itemKey: 'egg' } });
  let eggsLaid = 0;
  let milkReady = false;

  for (const animal of due) {
    if (animal.kind === 'cow') {
      // The cow holds her milk until collected; the timer does not restart
      // until someone actually milks her.
      await tx.animal.update({ where: { id: animal.id }, data: { ready: true } });
      milkReady = true;
      continue;
    }

    if (groundEggs >= ANIMALS.chicken.maxGroundEggs) {
      // At the cap: push the timer forward rather than dropping the egg.
      await tx.animal.update({
        where: { id: animal.id },
        data: { nextYieldAt: new Date(now.getTime() + nextLayDelayMs()) },
      });
      continue;
    }

    const point = randomCoopPoint();
    await tx.groundItem.create({
      data: { userId, itemKey: 'egg', x: point.x, y: point.y },
    });
    await tx.animal.update({
      where: { id: animal.id },
      data: { nextYieldAt: new Date(now.getTime() + nextLayDelayMs()) },
    });

    groundEggs += 1;
    eggsLaid += 1;
  }

  if (!milkReady) {
    const cow = await tx.animal.findFirst({ where: { userId, kind: 'cow' } });
    milkReady = cow?.ready ?? false;
  }

  return { eggsLaid, milkReady };
}

/** Restarts the cow's clock after milking. */
export async function resetCowTimer(tx: Prisma.TransactionClient, animalId: string): Promise<void> {
  await tx.animal.update({
    where: { id: animalId },
    data: {
      ready: false,
      nextYieldAt: new Date(Date.now() + ms(ANIMALS.cow.milkIntervalSec)),
    },
  });
}
