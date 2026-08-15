/**
 * What players actually do.
 *
 * Every action has been writing an EventLog row since the first phase, and
 * nothing has ever read one. That is the expensive gap: every number in
 * game-config — thirty seconds for a sunflower, 220 coins for the north
 * meadow, 140 for the first point of renown — is a guess made without
 * watching a single person play.
 *
 * So this counts the only things worth arguing about: how far people get
 * before they stop, and whether they come back. Everything here is a plain
 * aggregate; nothing is sampled, cached or estimated.
 */

import { DELIVERIES, PATRONAGE } from '@ambervale/game-config';
import type { PrismaClient } from '@prisma/client';

const DAY_MS = 86_400_000;

export interface FunnelStep {
  label: string;
  count: number;
  /** Share of the farms that got past the step before it. */
  ofPrevious: number;
  /** Share of every farm that ever started. */
  ofAll: number;
}

/**
 * A milestone is something people reach, not something they pass through.
 *
 * Mixing the two is what produced a "200% of previous" row: claiming the
 * north meadow does not require having filled a delivery, so the two were
 * never a sequence and the ratio between them meant nothing.
 */
export interface Milestone {
  label: string;
  count: number;
  /** Share of the farms that actually played. */
  ofPlayed: number;
}

export interface Stats {
  generatedAt: number;
  windowDays: number;

  farms: {
    total: number;
    /** Farms that did anything at all beyond loading the page. */
    played: number;
    createdInWindow: number;
    activeToday: number;
    walletLinked: number;
  };

  /** Strictly nested: each step is a subset of the one above it. */
  funnel: FunnelStep[];
  /** Reached in any order, so counted against everyone who played. */
  milestones: Milestone[];

  retention: {
    /** Farms whose last visit was at least a day after their first. */
    returnedNextDay: number;
    returnedNextDayRate: number;
    /** Still visiting a week or more after signing up. */
    stillHereAfterWeek: number;
  };

  economy: {
    amberEarned: number;
    amberSpent: number;
    amberOutstanding: number;
    coinsHeld: number;
    deliveries: number;
    upgradesBought: number;
    renownBought: number;
  };

  /** Action volume in the window, most used first. */
  actions: { kind: string; count: number }[];

  /** Farms per day created, so a spike or a drought is visible. */
  signupsByDay: { day: string; count: number }[];
}

/** A farm that never planted anything is a page view, not a player. */
const PLAYED = { bootstrapped: true, plantedCount: { gt: 0 } } as const;

/**
 * The cohort the level steps of the funnel are measured within.
 *
 * The level thresholds have to be intersected with this rather than counted
 * across everyone, because XP is not only paid for harvesting — chopping,
 * mining and collecting eggs all grant it, so a farm can reach level 3 having
 * never taken a crop. Counting those farms under a step below them in the
 * funnel is how you get a stage reporting more people than the one it
 * supposedly drains from.
 */
const HARVESTED = { ...PLAYED, harvestedCount: { gt: 0 } } as const;

export async function readStats(db: PrismaClient, windowDays = 14): Promise<Stats> {
  const now = Date.now();
  const since = new Date(now - windowDays * DAY_MS);
  const startOfToday = new Date(Math.floor(now / DAY_MS) * DAY_MS);

  const [total, played, createdInWindow, activeToday, walletLinked] = await Promise.all([
    db.user.count({ where: { bootstrapped: true } }),
    db.user.count({ where: PLAYED }),
    db.user.count({ where: { bootstrapped: true, createdAt: { gte: since } } }),
    db.user.count({ where: { ...PLAYED, lastSeenAt: { gte: startOfToday } } }),
    db.wallet.count(),
  ]);

  // The funnel is built from level and counter thresholds rather than from
  // events, so it stays correct for farms that predate any given event kind.
  const [harvested, level3, delivered, level5, crafted, level8, expandedNorth, expandedEast] =
    await Promise.all([
      db.user.count({ where: { ...HARVESTED } }),
      db.user.count({ where: { ...HARVESTED, level: { gte: DELIVERIES.unlockLv } } }),
      db.user.count({ where: { ...PLAYED, deliveriesDone: { gt: 0 } } }),
      db.user.count({ where: { ...HARVESTED, level: { gte: PATRONAGE.unlockLv } } }),
      db.user.count({ where: { ...PLAYED, craftCount: { gt: 0 } } }),
      db.user.count({ where: { ...HARVESTED, level: { gte: 8 } } }),
      db.user.count({ where: { ...PLAYED, expansion: { north: true } } }),
      db.user.count({ where: { ...PLAYED, expansion: { east: true } } }),
    ]);

  // Every step here is genuinely a subset of the one above: you cannot
  // harvest without planting, and each level step is counted inside the
  // harvest cohort, so passing level 5 implies having passed level 3.
  const raw: [string, number][] = [
    ['Started a farm', total],
    ['Planted something', played],
    ['Harvested something', harvested],
    [`Reached level ${DELIVERIES.unlockLv} — deliveries open`, level3],
    [`Reached level ${PATRONAGE.unlockLv} — Vale Fund opens`, level5],
    ['Reached level 8 — starglow', level8],
  ];

  const milestones: Milestone[] = (
    [
      ['Filled a delivery', delivered],
      ['Claimed the north meadow', expandedNorth],
      ['Crafted at the mill', crafted],
      ['Claimed the east meadow', expandedEast],
      ['Linked a wallet', walletLinked],
    ] as [string, number][]
  ).map(([label, count]) => ({
    label,
    count,
    ofPlayed: played > 0 ? count / played : 0,
  }));

  const funnel: FunnelStep[] = raw.map(([label, count], i) => {
    const previous = i === 0 ? count : (raw[i - 1]?.[1] ?? 0);
    return {
      label,
      count,
      ofPrevious: previous > 0 ? count / previous : 0,
      ofAll: total > 0 ? count / total : 0,
    };
  });

  // "Returned" needs a real gap between first and last visit; one long
  // session would otherwise count as coming back.
  const playedFarms = await db.user.findMany({
    where: PLAYED,
    select: { createdAt: true, lastSeenAt: true },
  });
  const returned = playedFarms.filter(
    (u) => u.lastSeenAt.getTime() - u.createdAt.getTime() >= DAY_MS,
  ).length;
  const weekPlus = playedFarms.filter(
    (u) => u.lastSeenAt.getTime() - u.createdAt.getTime() >= 7 * DAY_MS,
  ).length;

  const [earnedAgg, spentAgg, coinsAgg, deliveriesAgg, upgradesAgg, renownAgg] = await Promise.all([
    db.amberLedger.aggregate({ _sum: { delta: true }, where: { delta: { gt: 0 } } }),
    db.amberLedger.aggregate({ _sum: { delta: true }, where: { delta: { lt: 0 } } }),
    db.user.aggregate({ _sum: { coins: true }, where: PLAYED }),
    db.user.aggregate({ _sum: { deliveriesDone: true }, where: PLAYED }),
    db.user.aggregate({ _sum: { upgradesBought: true }, where: PLAYED }),
    db.user.aggregate({ _sum: { renown: true }, where: PLAYED }),
  ]);

  const earned = earnedAgg._sum.delta ?? 0;
  const spent = Math.abs(spentAgg._sum.delta ?? 0);

  const actionRows = await db.eventLog.groupBy({
    by: ['kind'],
    where: { createdAt: { gte: since } },
    _count: { kind: true },
    orderBy: { _count: { kind: 'desc' } },
    take: 25,
  });

  // Grouped in SQL by date rather than pulled into memory: the table grows
  // without bound and this endpoint should not grow with it.
  const signups = await db.$queryRaw<{ day: Date; count: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
    FROM "User"
    WHERE "bootstrapped" = true AND "createdAt" >= ${since}
    GROUP BY 1 ORDER BY 1 ASC
  `;

  return {
    generatedAt: now,
    windowDays,
    farms: { total, played, createdInWindow, activeToday, walletLinked },
    funnel,
    milestones,
    retention: {
      returnedNextDay: returned,
      returnedNextDayRate: played > 0 ? returned / played : 0,
      stillHereAfterWeek: weekPlus,
    },
    economy: {
      amberEarned: earned,
      amberSpent: spent,
      amberOutstanding: earned - spent,
      coinsHeld: coinsAgg._sum.coins ?? 0,
      deliveries: deliveriesAgg._sum.deliveriesDone ?? 0,
      upgradesBought: upgradesAgg._sum.upgradesBought ?? 0,
      renownBought: renownAgg._sum.renown ?? 0,
    },
    actions: actionRows.map((r) => ({ kind: r.kind, count: r._count.kind })),
    signupsByDay: signups.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      count: Number(r.count),
    })),
  };
}

// ---------------------------------------------------------------------------

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * A page rather than a JSON blob, because the person who needs this is
 * reading it on a phone at midnight, not piping it into anything.
 */
export function renderStatsPage(s: Stats): string {
  const bar = (v: number) =>
    `<div class="bar"><i style="width:${(v * 100).toFixed(1)}%"></i></div>`;

  const funnel = s.funnel
    .map(
      (f) => `<tr>
        <td>${esc(f.label)}</td>
        <td class="n">${f.count}</td>
        <td class="n">${pct(f.ofAll)}</td>
        <td class="n ${f.ofPrevious < 0.5 ? 'drop' : ''}">${pct(f.ofPrevious)}</td>
        <td class="b">${bar(f.ofAll)}</td>
      </tr>`,
    )
    .join('');

  const milestones = s.milestones
    .map(
      (m) => `<tr>
        <td>${esc(m.label)}</td>
        <td class="n">${m.count}</td>
        <td class="n">${pct(m.ofPlayed)}</td>
        <td class="b">${bar(m.ofPlayed)}</td>
      </tr>`,
    )
    .join('');

  const actions = s.actions
    .map((a) => `<tr><td>${esc(a.kind)}</td><td class="n">${a.count}</td></tr>`)
    .join('');

  const signups = s.signupsByDay
    .map((d) => `<tr><td>${esc(d.day)}</td><td class="n">${d.count}</td></tr>`)
    .join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMBERVALE — stats</title><style>
:root{--ink:#0a2e3d;--cream:#f5e6c8;--amber:#f4b942;--paper:#efe6d5}
*{box-sizing:border-box}
body{margin:0;padding:28px 18px 60px;background:var(--paper);color:var(--ink);
 font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
.wrap{max-width:860px;margin:0 auto}
h1{font-size:1rem;letter-spacing:.3em;text-transform:uppercase;margin:0 0 4px}
.sub{opacity:.6;font-size:.82rem;margin:0 0 26px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:26px}
.card{background:#fff;border:1px solid rgba(10,46,61,.12);border-radius:14px;padding:14px}
.card b{display:block;font-size:1.5rem;line-height:1.1}
.card span{font-size:.72rem;opacity:.6}
section{background:#fff;border:1px solid rgba(10,46,61,.12);border-radius:16px;
 padding:6px 16px 14px;margin-bottom:20px}
h2{font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin:16px 0 8px}
table{width:100%;border-collapse:collapse;font-size:.86rem}
td{padding:7px 6px;border-bottom:1px solid rgba(10,46,61,.08);vertical-align:middle}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.drop{color:#b5473a;font-weight:700}
td.b{width:34%}
.bar{background:rgba(10,46,61,.1);border-radius:99px;height:8px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--amber)}
.note{font-size:.76rem;opacity:.62;line-height:1.6;margin:10px 0 0}
</style></head><body><div class="wrap">
<h1>Ambervale</h1>
<p class="sub">Last ${s.windowDays} days · generated ${new Date(s.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC</p>

<div class="cards">
  <div class="card"><b>${s.farms.played}</b><span>farms played</span></div>
  <div class="card"><b>${s.farms.activeToday}</b><span>active today</span></div>
  <div class="card"><b>${pct(s.retention.returnedNextDayRate)}</b><span>came back a day later</span></div>
  <div class="card"><b>${s.farms.walletLinked}</b><span>wallets linked</span></div>
  <div class="card"><b>${s.economy.amberOutstanding}</b><span>$AMBER outstanding</span></div>
</div>

<section>
  <h2>Where people stop</h2>
  <table><tbody>${funnel}</tbody></table>
  <p class="note">The fourth column is the share that got past the step above it.
  Anything under 50% is marked — that is where the game is losing people, and it
  is worth more than any opinion about what to build next.</p>
</section>

<section>
  <h2>Milestones reached</h2>
  <table><tbody>${milestones}</tbody></table>
  <p class="note">Reached in any order, so measured against everyone who planted
  something rather than against each other.</p>
</section>

<section>
  <h2>Economy</h2>
  <table><tbody>
    <tr><td>$AMBER earned, all time</td><td class="n">${s.economy.amberEarned}</td></tr>
    <tr><td>$AMBER spent (sinks)</td><td class="n">${s.economy.amberSpent}</td></tr>
    <tr><td>$AMBER outstanding</td><td class="n">${s.economy.amberOutstanding}</td></tr>
    <tr><td>Coins held by players</td><td class="n">${s.economy.coinsHeld}</td></tr>
    <tr><td>Deliveries filled</td><td class="n">${s.economy.deliveries}</td></tr>
    <tr><td>Upgrade tiers bought</td><td class="n">${s.economy.upgradesBought}</td></tr>
    <tr><td>Renown bought</td><td class="n">${s.economy.renownBought}</td></tr>
  </tbody></table>
  <p class="note">Outstanding is what a claim would have to honour if it opened today.</p>
</section>

<section>
  <h2>Actions (last ${s.windowDays} days)</h2>
  <table><tbody>${actions || '<tr><td>nothing yet</td><td class="n">0</td></tr>'}</tbody></table>
</section>

<section>
  <h2>New farms per day</h2>
  <table><tbody>${signups || '<tr><td>none</td><td class="n">0</td></tr>'}</tbody></table>
</section>
</div></body></html>`;
}
