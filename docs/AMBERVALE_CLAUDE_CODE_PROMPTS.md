# AMBERVALE — Complete Claude Code Prompts (Phases 0–8)

**How to use (Michael):**

1. Create the repo. Copy `AMBERVALE_HANDOFF.md` and `ambervale2.html` into `/docs/` (prototype goes to `/docs/prototype/ambervale2.html`). Commit.
2. Run **one prompt per fresh Claude Code session**, in order. Review the diff, run the acceptance checks, commit and tag (`phase-0`, `phase-1`, …) before moving on.
3. If Claude Code asks to expand scope mid-phase, say no — the next phase covers it.

Every prompt below is self-contained and paste-ready.

---

## PROMPT 0 — Scaffold

```
Read /docs/AMBERVALE_HANDOFF.md and skim /docs/prototype/ambervale2.html before writing any code. We are building AMBERVALE, a server-authoritative farm-to-earn browser game. This session is SCAFFOLD ONLY — no gameplay.

Build a pnpm monorepo:

apps/web — Next.js 14 (App Router, TypeScript). Routes: "/" (placeholder landing), "/play" (client-only page mounting an empty Phaser 3 scene that fills the viewport and renders a solid #0a2e3d background with an FPS counter). Phaser 3 latest, WebGL renderer, pixelArt false, roundPixels true.

apps/api — Fastify (TypeScript) with: /health returning { ok: true, ts }, Prisma initialized against PostgreSQL, Redis client (ioredis) with a ping on boot, zod for request validation, pino logging, CORS locked to the web origin from env.

packages/game-config — a typed, framework-free package exporting ALL tuning constants so client and server import the same numbers. Create these exact exports:

- TILE=64, WORLD={ w:56, h:44 }, PLAYER={ speed:195, reach:74 }
- JOYSTICK={ radius:46, minSpeedScale:0.35 }
- DAY={ cycleSec:300, dayEnd:0.40, duskEnd:0.50, nightEnd:0.88, sessionStartU:0.085 }
- XP_FOR_LEVEL: (lv:number)=>Math.floor(42*Math.pow(lv,1.5))
- CROPS: sunflower { growSec:30, seedCost:5, sell:12, xp:6, unlockLv:1 }, carrot { growSec:70, seedCost:12, sell:30, xp:13, unlockLv:2 }, pumpkin { growSec:170, seedCost:32, sell:100, xp:34, unlockLv:4 }, starglow { growSec:360, seedCost:90, sell:300, xp:90, unlockLv:8, glowsAtNight:true }
- FIRST_CROP_FAST_SEC=10
- GOODS: egg { sell:14, xpOnCollect:5 }, milk { sell:38, xpOnCollect:10 }, wood { sell:5 }, stone { sell:8 }
- NODES: oak { hits:3, yield:{wood:3}, xpOnFell:12, respawnSec:90, count:10 }, rock { hits:3, yield:{stone:2}, xpOnBreak:14, respawnSec:120, count:8 }
- ANIMALS: chicken { count:3, layMinSec:30, layMaxSec:60, maxGroundEggs:4 }, cow { count:1, milkIntervalSec:90 }
- DELIVERIES: { unlockLv:3, slots:3, slot2RepReq:10, slot3RepReq:25, repPerDelivery:3, xpPerDelivery:22, refillSec:60, eggOrderMinLv:5, eggOrderChance:0.3, qty:{ sunflower:[4,7], carrot:[3,5], pumpkin:[2,3], egg:[2,4] }, amberFormula:(sellValue:number,qty:number)=>Math.max(1,Math.round(sellValue*qty/25)) }
- EXPANSION_NORTH={ coins:220, wood:18, stone:8, plotsAdded:6, xp:60 }
- NEW_ACCOUNT={ coins:40, seeds:{ sunflower:3 }, level:1 }
- QUESTS: the 8-quest chain from handoff §4 as an array of { id, text, counter, target, reward:{ coins? , amber? } }

Also add: docker-compose.yml (postgres:16, redis:7, volumes, healthchecks), .env.example for both apps (DATABASE_URL, REDIS_URL, WEB_ORIGIN, API_URL, ENABLE_CLAIM=false), root scripts (dev runs api+web concurrently, db:migrate, db:studio), PM2 ecosystem.config.cjs with two apps (ambervale-api port 4021, ambervale-web port 4022), README with run instructions, ESLint+Prettier, strict tsconfig.

Acceptance: `pnpm dev` boots both apps with docker-compose services up; GET /health returns ok; /play shows the empty Phaser scene with FPS counter; `pnpm -r typecheck` passes. Commit everything including /docs. Stop here.
```

---

## PROMPT 1 — World render port (visuals only, no gameplay)

```
Read /docs/AMBERVALE_HANDOFF.md §2 and §4, then read /docs/prototype/ambervale2.html FULLY — this phase ports its world rendering into the Phaser 3 scene in apps/web. Visual parity with the prototype is the acceptance bar. No server calls, no player input beyond a free-fly debug camera (WASD) behind a ?debug=1 flag.

Port from the prototype, keeping identical constants and look:

1. Seeded generation: mulberry32 with seed 20260814, the PERM-table value noise, fbm(), and h01() hash exactly as written, so the world layout matches the prototype deterministically.
2. Tile map 56×44: east lake + south pond masks, dirt paths carved along the same PATHS polylines with radius 0.58, three grass tones from fbm.
3. Terrain baking: 14×14-tile chunks rendered once into Phaser RenderTextures using the same painter logic — mid-tone grass base, rounded tone patches, large-scale radial meadow shading, rounded dirt blobs with speckle, rounded deep-water blobs with inner gradient and foam edge strokes, lily pads, grass tufts/flowers/pebbles scatter with the same hash rules.
4. Static layout at the same coordinates: house, barn, windmill (separate rotating blades sprite, 0.85 rad/s), market with awning, delivery board with pinned notes, coop, dock over water, rowboat bobbing, 4 lamps, fences with the same rects/gaps, NORTH MEADOW sign and dashed ghost plots.
5. Procedural sprites: port every makeSpr painter (buildings, oak/oakA/pine/stump, rock 0–3 hp states, bush, sign) into functions that draw once into RenderTextures at 2× resolution at boot. No external image assets.
6. Ambient life (cosmetic only this phase): water shimmer lines on water tiles, chimney smoke puffs, drifting fireflies at night, dust motes.
7. Day/night: 300s cycle with the handoff phase boundaries, session starts at u=0.085. Implement night with Phaser Light2D: ambient darkness scaling to 0.62 alpha at full night, point lights on player-spawn position placeholder, the 4 lamps (warm), house windows, windmill window, coop; dusk and dawn full-screen tint gradients with the prototype colors; warm sun radial by day; vignette always. Starglow crop lights are wired in Phase 3.
8. Minimap: bake the tile map into a small texture (168px wide), render bottom-... actually top-right per prototype, with landmark dots and a viewport rectangle (player dot comes in Phase 3).
9. Cinematic title camera: before "start", camera eases along the CINE waypoint list (house → field → market → lake → windmill, 7s per segment, eased), zoom 0.86× of base; base zoom = clamp(min(vw,vh)/780, 0.62, 1.12).

Acceptance: side-by-side screenshots (day, dusk, night) closely match the prototype; stable ~60fps on a mid-range Android phone in Chrome (test with CPU 4× throttle in devtools ≥ 40fps); chunk textures bake in under 1.5s on desktop; `pnpm -r typecheck` passes. Commit as phase-1.
```

---

## PROMPT 2 — Auth + persistence + farm bootstrap

```
Read /docs/AMBERVALE_HANDOFF.md §3 and §5. This phase adds accounts and a refresh-proof saved farm. No gameplay mutations yet beyond bootstrap.

1. Auth: guest-first. POST /auth/guest issues a signed httpOnly session cookie bound to a generated userId + deviceId (uuid stored in localStorage on web and echoed in a header). Fastify plugin resolves req.user on every call. Structure it so email magic-link can be added later without schema changes (User.email nullable).
2. Prisma schema exactly per handoff §5: User, Plot, ResourceNode, Animal, GroundItem, InventoryItem, SeedItem, DeliverySlot, AmberLedger, Expansion, EventLog. AmberLedger is append-only; add a DB view or helper amberBalance(userId)=SUM(delta). Migrations committed.
3. Farm bootstrap on first authenticated call: create 9 base plots (indexes 0–8, zone "base") + 6 north plots (9–14, zone "north", locked behind Expansion.north=false), 10 oak ResourceNodes and 8 rock nodes with fixed indexes mapping to the Phase-1 layout coordinates (export an INDEX→coordinate map from game-config so client and server agree), 3 chickens + 1 cow with nextYieldAt seeded, NEW_ACCOUNT coins/seeds/level from game-config, tutorialStep=0, questIndex=0.
4. GET /farm: returns the full state in one payload — user (level, xp, coins, rep, amberBalance, tutorialStep, questIndex, expansion), plots (with plantedAt timestamps and fast flag), nodes (hp, respawnAt), animals (nextYieldAt), groundItems, inventory, seeds, deliverySlots. All times are server epoch ms; also return serverNow so the client can compute clock skew once.
5. Client: on /play load, call /auth/guest then /farm, hydrate the world — render plot states, node hp/stumps, ground eggs — and show a player character at spawn PX(19,19) with the Phase-1 camera switching from cinematic to follow after a Start button. Port the prototype title screen (live world behind, logo top, bottom-sheet panel) now.
6. Redis session cache keyed by session id; EventLog row for auth + bootstrap.

Acceptance: two different browsers get two different farms; refresh restores identical state; clearing cookies but keeping deviceId restores the same account; `prisma migrate reset && pnpm dev` boots clean. Commit as phase-2.
```

---

## PROMPT 3 — Core loop, server-authoritative

```
Read /docs/AMBERVALE_HANDOFF.md §3–§4. This phase makes the farm playable: plant, harvest, chop, mine, sell, buy seeds — every rule enforced server-side with numbers imported ONLY from packages/game-config.

Endpoints (all POST, zod-validated, authenticated, rate-limited):
- /act/plant { plotIndex, cropKey } — plot must exist, be unlocked-zone, be empty; crop unlockLv <= user.level; seed qty > 0. Decrement seed, set crop+plantedAt=now. If user has never planted before (persist firstPlantDone flag on User), set fast=true (FIRST_CROP_FAST_SEC growth). Reply with new plot row.
- /act/harvest { plotIndex } — crop present and now >= plantedAt + growSec (or FAST) * 1000, else 409 with remainingMs. Grant +1 inventory item, crop XP, clear plot.
- /act/chop { nodeIndex } and /act/mine { nodeIndex } — node alive; enforce 350ms min interval per node per user (Redis). Decrement hp; on 0: grant yield + xp, set respawnAt=now+respawnSec. A lazy repair pass on read: if respawnAt passed, restore hp before evaluating.
- /act/sell { itemKey, qty:"all" } — moves inventory to coins at game-config sell prices; increments soldCount stat.
- /act/buySeed { cropKey, qty:1|5 } — coins check, unlockLv check; increments boughtSeeds stat.

Cross-cutting:
- XP/level: apply XP_FOR_LEVEL loop server-side; response includes levelUps[] so the client can play the celebration.
- Rate limit: max 5 mutating calls/sec/user (Redis sliding window) → 429.
- Redis SETNX action lock per (userId,endpoint,entityIndex) for 250ms to kill double-submits.
- EventLog row per action with payload.
- Counters on User (plantedCount, harvestedCount, choppedCount, soldCount, boughtSeeds, milkCount, deliveriesDone) — quests read these in Phase 4.

Client:
- Port the full control scheme from the prototype: fixed virtual joystick bottom-left using Pointer Events + setPointerCapture (never touch events), tap-to-walk with target ripple, contextual action button, WASD+E. Movement is client-side; collision against water tiles and building solids as in the prototype.
- Interactions call the endpoints optimistically, reconcile from the response, and render the prototype's juice: growth stages per crop (port the drawPlotAndCrop painter incl. ready glow and "!" bounce), tool swing animations (hoe/axe/pick), particles, floating text, fly-to-HUD coins, WebAudio synth SFX ported from the prototype with mute toggle.
- Starglow ready/growing crops register Phaser point lights at night.
- Timers render from server timestamps + clock skew; on 409 remainingMs, show the countdown float exactly like the prototype.

Acceptance: full loop works end-to-end (plant→harvest→sell→buy) and survives refresh mid-growth; hitting harvest early returns 409 and the client shows time-left; spamming chop is capped; editing client JS cannot mint coins (verify by replaying a sell with qty tampered — server recomputes from DB). Commit as phase-3.
```

---

## PROMPT 4 — Deliveries, quests, $AMBER ledger

```
Read /docs/AMBERVALE_HANDOFF.md §3–§4. This phase adds the earn layer. $AMBER exists only as AmberLedger rows.

Deliveries:
- Slot lifecycle server-side. On farm read, ensure 3 DeliverySlot rows exist once user.level >= DELIVERIES.unlockLv; slot 2/3 usable only when rep >= 10 / 25 (still generated, shown locked with progress).
- Order generation is server-only and seeded (store seed on the row): item from crops unlocked at user.level excluding starglow; from level 5, 30% chance the order asks eggs; qty ranges and amberFormula from game-config.
- POST /act/deliver { slot, idempotencyKey } — slot open + unlocked; inventory sufficient (409 with have/need otherwise). Atomically (transaction): decrement inventory, insert AmberLedger(+amber, reason "delivery", refId slot row), rep += 3, xp += 22, deliveriesDone++, slot state=done, refillAt=now+60s. Idempotency: same key returns the original result.
- Lazy refill on read: done slots past refillAt regenerate a fresh order.

Quests:
- QUESTS chain from game-config evaluated server-side after every mutating action against the User counters (plantedCount>=3, harvestedCount>=3, soldCount>=1, choppedCount>=1, level>=3, deliveriesDone>=1, milkCount>=1, expansion.north). On completion: grant reward (coins or AmberLedger +1 "quest"), advance questIndex, include questCompleted in the action response so the client toasts + bursts.
- /act/expand — validate EXPANSION_NORTH costs, deduct, set Expansion.north=true, unlock north plots, +60 XP.

Client:
- Port the deliveries modal (rep header, NPC avatars with the 5 prototype names/tints, need rows with have-count coloring, locked-slot progress bars, done-state countdown), delivery board world "!" indicator, $AMBER fly particles to the amber pill, quest card with progress bar, expand modal, and the amber pill showing ledger balance from /farm.

Acceptance: a fresh account can reach level 3, complete a delivery, and the AmberLedger shows exactly the formula amount; replaying /act/deliver with the same idempotencyKey does not double-pay; locked slot 2 rejects deliver attempts server-side; quest rewards land once each. Commit as phase-4.
```

---

## PROMPT 5 — Guided tutorial + UI completion

```
Read the TUT array and tutorial UI in /docs/prototype/ambervale2.html and port it verbatim in behavior. Tutorial progress persists server-side (User.tutorialStep, PATCH /tutorial/step guarded to only move forward or to 99=skipped/done).

The 10 steps, targets, and completion conditions (mirror the prototype):
0 intro text + Start button · 1 walk into the fenced field (proximity < 150 of field center) · 2 plant a sunflower (plantedCount>=1; force-select sunflower seed on step start) · 3 chop an oak while it grows (choppedCount>=1 or wood>0) · 4 harvest the first crop (harvestedCount>=1; live countdown text while growing) · 5 get 3 crops planted (plantedCount>=3, live "x/3") · 6 sell at the market (soldCount>=1) · 7 buy sunflower seeds ×5 (boughtSeeds>=5) · 8 reach level 3 (live "Level x/3") · 9 complete a delivery (deliveriesDone>=1) → finish celebration + goal recap toast, then reveal the quest card.

Port exactly: the banner (step counter, live-updating text, Guide me, Next on text steps, Skip), the in-world pulsing ring + bouncing chevron marker, the edge-of-screen arrow with "Objective" label when the target is off-camera, the camera peek (1.3–1.4s ease to target on step start), and Guide-me auto-walk to the per-step approach points.

Also finish remaining UI to prototype parity: bag modal (inventory grid), market modal with Buy/Sell tabs and locked-seed rows, settings modal (mute persisted per device, Connect Wallet placeholder toast, Reset run = destructive server reset endpoint with confirm), toasts system with the four variants, level ring XP arc animation, minimap player dot + landmark dots live.

Acceptance: a brand-new account can be steered start-to-finish through all 10 steps using only Guide me + taps; refreshing mid-tutorial resumes at the same step; Skip jumps to free play with the quest card visible. Commit as phase-5.
```

---

## PROMPT 6 — Animals + world life + audio

```
Read /docs/AMBERVALE_HANDOFF.md §4 (Goods, ANIMALS). Server-side yields, client-side charm.

Server:
- Chickens: each of the 3 has nextYieldAt; a lazy pass on /farm read materializes due eggs as GroundItem rows (cap 4 total; if at cap, push nextYieldAt forward). POST /act/collectEgg { groundItemId } → +1 egg inventory, +5 XP, delete row.
- Cow: nextYieldAt every 90s → milkReady flag derived server-side. POST /act/collectMilk → +1 milk, +10 XP, milkCount++, reset nextYieldAt.
- Eggs become valid delivery items already (Phase 4 covers it) — verify.

Client:
- Port chicken wander/peck AI, egg lay hop + ground egg bobbing, cow paddock wander with tail/head animation and the milk speech bubble, all as cosmetic client behavior synced to server flags for collectability.
- Port the WebAudio synth (all SFX incl. moo) and add light ambience: sparse bird chirps by day, crickets at night, both generated (no audio files), tied to the day cycle, behind the same mute toggle.
- Smoke, fireflies, dust — verify they run only when the tab is visible (document.visibilitychange pause).

Acceptance: eggs appear over time and survive refresh until collected; cap of 4 holds; milk collectable every 90s exactly (server clock); an order asking eggs can be fulfilled. Commit as phase-6.
```

---

## PROMPT 7 — Wallet connect + claim scaffolding (flagged OFF)

```
Read /docs/AMBERVALE_HANDOFF.md §7–§8. ALFA's chain decision: ___ (Robinhood Chain EVM unless told otherwise). Nothing in this phase moves real value.

1. Wallet connect on web: if EVM — wagmi + viem, injected + WalletConnect, chain config for Robinhood Chain (Arbitrum Orbit) testnet + mainnet ids from env. Abstract behind a WalletProvider interface so a Solana adapter could replace it.
2. POST /wallet/link { address, signature } — SIWE-style message signed client-side, verified server-side, one wallet per account and one account per wallet (unique constraints; friendly 409s).
3. Claim scaffolding: ENABLE_CLAIM env (default false). GET /claim/quota returns amberBalance and claimable=0 while disabled. POST /claim/intent (only when enabled) writes a ClaimIntent row { userId, amount, status:"pending" } and inserts a negative AmberLedger entry reason "claim_lock" — no chain call. Admin-only GET /admin/claim-intents CSV export (basic auth from env) so payouts can start manual before the contract exists.
4. Settings modal: real Connect Wallet flow replacing the placeholder toast; linked state shown; claim button visible but disabled with "Claims open soon" while the flag is off.
5. Add DECISIONS.md recording the chain choice and the claim flow design.

Acceptance: wallet links and persists; a second account cannot link the same wallet; with ENABLE_CLAIM=false no intent can be created (verified by direct API call); ledger stays consistent (balance never negative). Commit as phase-7.
```

---

## PROMPT 8 — Hardening + deploy

```
Read /docs/AMBERVALE_HANDOFF.md §3 and §7. This phase is production readiness — no features.

1. Load test with k6: scripted user doing the core loop; targets: 200 concurrent users, p95 < 250ms on mutating endpoints, zero 5xx, no ledger drift (assert SUM checks pre/post).
2. Abuse audit: attempt double-deliver (parallel same idempotencyKey and different keys same slot), harvest-before-time, negative-qty sells, node-spam past rate limits, replayed auth cookies — each must fail safely; add regression tests for all.
3. Observability: Sentry (api+web), pino redaction, request ids, slow-query log; /metrics basic counters.
4. Ops: nightly pg_dump to offsite (cron), Redis persistence config, PM2 max-memory restart, Nginx config (gzip, websocket-ready, cache static, security headers), Cloudflare in front (orange-cloud, cache rules for /_next/static, WAF basic) — mirror the Fourtis VPS pattern.
5. Launch checklist in /docs/LAUNCH.md: env matrix, migration order, rollback steps, feature flags state, smoke script.
6. Performance pass on client: verify Light2D count budget at night, texture memory < 200MB on mobile, bundle < 1.5MB gz for /play.

Acceptance: k6 report committed and passing; all abuse tests green in CI; one-command deploy documented and executed to the staging VPS. Tag v1.0.0-rc1. Commit as phase-8.
```

---

## Backlog prompts (post-v1, run only when ALFA says go)

- **Crows:** ready crops idle > 45s spawn a crow that steals in 12s unless tapped; shoo = +2 XP. Server decides spawn/steal from timestamps.
- **Kitchen:** house becomes interactive — recipes Custard (egg+milk, 4m, sells 90) and Pumpkin Pie (pumpkin+egg, 8m, sells 220), server cook timers, one cooking slot (second slot = coin sink).
- **$AMBER sink:** Amber Monument cosmetic, 15 $AMBER via negative ledger entry, renders on the farm.
- **Decoration shop:** coin-sink cosmetics with placement grid.
- **BGM:** generative day/night music layer.
