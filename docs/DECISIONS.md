# Decisions

Standing architectural choices and the reasoning behind them. Change these
deliberately, not incidentally.

## Chain: Robinhood Chain (EVM)

**Status:** provisional — ALFA's decision line in the brief was left blank.

The brief's stated default is "Robinhood Chain EVM unless told otherwise", so
that is what Phase 7 targets. Robinhood Chain is an Arbitrum Orbit rollup,
which for our purposes means a stock EVM chain: `defineChain` with an id and an
RPC URL is all viem and wagmi need, and nothing in the code is Orbit-specific.

Chain ids and RPC URLs live in `apps/web/.env.example`, not in code, so the
real values can be filled in when published without a code change. Until then
they default to Arbitrum Sepolia / Arbitrum One, which are the closest working
stand-ins for an Orbit chain.

**If the decision changes to Solana**, the work is: write a second class
implementing `WalletProvider` in `apps/web/src/lib/wallet/provider.ts`, and
swap `verifyMessage` in `apps/api/src/routes/wallet.ts` for ed25519
verification. The interface deliberately speaks in strings — address, message,
signature — and never exposes an EVM-shaped type, so nothing else needs to
move. `Wallet.address` is a plain string column; `Wallet.chainId` would want
widening or reinterpreting.

## Wallet linking

One wallet per account and one account per wallet, enforced by unique indexes
on `Wallet.userId` and `Wallet.address`. Addresses are stored lower-cased, so
the constraint is genuinely one-account-per-wallet rather than
one-per-capitalisation.

Linking is SIWE-shaped: the server issues a single-use nonce, the wallet signs
a message naming the domain, the account and that nonce, and the server
verifies the signature recovers the claimed address. The nonce is consumed
before verification, so a failed attempt cannot be retried with the same one
and a captured signature cannot be replayed.

Linking proves control of an address. It never moves anything and grants no
in-game benefit.

## The $AMBER ledger

`AmberLedger` is append-only. The balance is `SUM(delta)` and is never stored
as a column, so it cannot drift from its own history — there is no second
number to reconcile, and every unit is traceable to the delivery or quest that
minted it.

Every mutation that touches $AMBER writes its ledger row inside the same
transaction as the thing that authorises it. For deliveries that is the
idempotency key; for claims it is the `ClaimIntent`.

## Claim flow

`ENABLE_CLAIM` defaults to **false** and gates the flow at the server, not the
UI:

- `GET /claim/quota` reports `claimable: 0` whatever the ledger says.
- `POST /claim/intent` returns 403 `CLAIMS_DISABLED` outright.

The claim button is still rendered, disabled, with "Claims open soon" — a
player should be able to see that the feature exists and that their balance is
being counted.

When enabled, a claim writes a `ClaimIntent` row **and** a negative
`claim_lock` ledger entry in one transaction. Nothing calls a chain. The
balance cannot go negative because the locked amount is exactly the balance
read in the same transaction.

`GET /admin/claim-intents` exports pending intents as CSV behind basic auth, so
payouts can be made by hand before any contract exists. An empty
`ADMIN_PASSWORD` disables the endpoint entirely.

**Deliberately not built yet:** any contract call, any private key on the
server, any automated payout. The accounting is correct first; the transfer
comes later.

## Server authority

The client may predict; the server decides. Concretely:

- A request says _what the player wants to do_, never _what the result should
  be_. `/act/sell` accepts `qty: "all"` and nothing else — a numeric quantity
  would just be a number to tamper with — and the server recomputes both the
  stack size and the price from the database and game-config.
- Every action replies with the whole farm rather than a delta. It costs a few
  KB and removes an entire class of bug: the client cannot accumulate a
  divergent view of its own inventory.
- Movement is _not_ authoritative, because position cannot mint anything. Every
  action taken from a position is checked, so walking through a wall gains a
  cheat nothing but a bad view.

## Timers

All timestamps crossing the wire are server epoch milliseconds, alongside
`serverNow`. The client records when a snapshot arrived and derives every
countdown from that offset, so a browser clock that is wrong — or wound
forward — never makes a crop look ready early.

Respawns, egg laying and delivery refills are computed lazily on read rather
than by a scheduler. A farm nobody has opened for a week comes back correct,
and there is no background job to keep alive.

## Rendering

The world is Phaser; the HUD, modals and toasts are React. They never touch
each other's objects — they exchange messages through one bridge and both read
the same authoritative `FarmState`.

Screen-space canvas UI lives on a separate `HudScene`, because
`setScrollFactor(0)` pins an object's position but does **not** exempt it from
the camera's zoom.

## The minute, not the menu

Six systems were added before anyone asked whether the loop underneath them was
worth repeating: crafting, dailies, renown, patronage, fishing, boards. Then the
game was played and the verdict was that it was boring, which those six systems
had done nothing about — they added breadth to a minute that was empty.

Three things were wrong, and all three were measurable rather than matters of
taste:

- **One verb.** Thirteen interaction kinds — plant, harvest, chop, mine, fish,
  mill, sell, deliver — were the same gesture with different labels: stand next
  to a thing, press the button. Nothing asked for timing, aim, or a decision
  under pressure.
- **A menu, not a choice.** Coins per second rose strictly with grow time
  (0.23 → 0.26 → 0.40 → 0.58), so the best unlocked crop was always the answer.
  Nothing made a shorter crop worth planting, because ready crops never spoiled.
- **Nothing could be lost.** No withering, no theft, no failure of any kind
  existed anywhere in the codebase. A game that cannot be lost is a spreadsheet
  that goes up, and it never needs to be watched.

So: prices sag under supply, crows arrive, and watering is a second verb whose
value depends on when it is done. The scarecrow buys forgiveness rather than
throughput — a punishment with nothing to spend against it is just a tax.

The market is **per player**. A shared order book is more interesting and is the
obvious later move, but it coordinates strangers: one whale could flatten a
market for everyone and grief would become a strategy. A player has to be able
to read the mechanic off their own actions before anything more elaborate earns
its complexity.

A sale is priced as the **average over the sale** rather than at its opening
price. The alternative makes one sale of a hundred pay more than a hundred sales
of one, which rewards exactly the flooding the mechanic exists to discourage.

Crow windows are longer than the longest crop on purpose. Ten minutes of ruin
against a six-minute starglow means nothing is ever lost by someone playing —
only by someone who walked away from a ready field, which is the behaviour being
priced. Losses are reported in the away card rather than silently applied: a
field three plots emptier than it was left owes an explanation.

## The economy has two halves

The first version of the game only ever added. Coins, $AMBER, wood and stone
all accumulated, and the only thing that consumed any of them was a single
one-time expansion — after which nothing in the game could be bought at all.
An accumulating counter is not an economy, and a token with no sink cannot be
priced.

So every mechanic added since exists to take value back out:

- **Upgrades** (`UPGRADES`) are the main sink. Coins carry the early tiers;
  later ones also cost $AMBER, priced against what a delivery pays so a tier is
  roughly a day of deliveries rather than a month.
- **Recipes** (`RECIPES`) consume raw produce and pay a margin, which is what
  finally gives wood, stone and surplus crops somewhere to go.
- **Daily goals** are the reason to come back tomorrow. Progress is measured as
  _counter now minus counter at the start of the day_, so they reuse the same
  monotonic counters the quest chain already had and need only one row per
  player — a baseline snapshot and a claimed bitmask. The goals themselves are
  derived from the date and never stored.
- **Level rewards** are paid inside `grant()`, the single function every
  XP-granting action funnels through. Paying anywhere else would mean either
  duplicating the "did we cross a level" check or silently missing a route.

Spending $AMBER is a negative row on the append-only ledger, never an edit to a
balance column. The balance stays `SUM(delta)` and a purchase stays auditable.

The root cellar raises what the _market_ pays and deliberately does not touch
delivery payouts: a coin-priced upgrade must never be able to inflate the
token.

## Buildings have verbs

The dock, windmill, barn and house were drawn from the first phase and did
nothing for five more. Each now carries exactly one verb — fish, mill, store,
sleep — which is cheaper than new art and makes the map worth crossing.

Sleeping is the one deliberately hollow verb: it winds the _client's_
day/night clock to sunrise and nothing else. Growth, egg timers and respawns
are all server-side wall-clock, and a client that could skip them would be the
largest exploit in the game. It buys the view, and the toast says so.

## The wallet is the account

A farm used to belong to a browser: a `deviceId` in localStorage and a signed
cookie. Clear either and it was gone. That is survivable for a toy and fatal
for a game that promises anything earnable, so a signature over a single-use
nonce now turns an address into a durable identity.

Three outcomes, decided entirely by what the address already owns: an unknown
address is linked to the farm being played, an address that owns this farm is a
no-op, and an address that owns a _different_ farm signs the player into that
one. The third is recovery and it is the point.

Two details are load-bearing:

- **The session is swapped, not reinterpreted.** The cookie is the only thing
  that says who you are, so recovery destroys the old session and mints a new
  one for the recovered account.
- **The deviceId moves with it.** The cookie expires eventually and the client
  falls back to `/auth/guest`; if the device still pointed at the abandoned
  guest the player would appear to lose their farm all over again. The guest
  keeps a `retired:` placeholder so the unique index still holds.

Recovery abandons whatever farm was being played, so `/wallet/preview` reports
what would be gained and lost _before_ the wallet is ever prompted. It names no
account — only levels and balances.

One wallet holds one farm. Carrying a farm across three devices works, but only
the most recent device auto-resumes without signing again; that is the cost of
keeping the device mapping a single column rather than a table, and it is the
right trade while the wallet is the durable half.

## Nobody else existed

The game had no way of showing a player that anyone else was playing, which for
something with a token in it is a strange omission — a score with nothing to
compare it against is not a score. Three ranked boards, a count of who played
today, and a handle derived from the account id rather than typed (asking for a
name is a signup form by another route).

The daily goals were already the same for everyone on a given date, deliberately
so; the boards are what finally makes that visible.

## Renown, and the sink that does not end

Every sink added before this one terminates: upgrade tiers cap out, meadows are
bought once. A finite sink only postpones the problem it solves, so the Vale
Fund has no end — the price of the next point of renown climbs forever, in
whichever currency the player has too much of.

Renown grants **no power at all**. It is a rank, and rank is what the boards
sort on. Letting the only unbounded drain in the economy also buy an unbounded
bonus would be the clearest possible way to ruin both.

## Every number in this game was a guess

`EventLog` has recorded every mutating action since the first phase, and until
now nothing read a single row. Meanwhile thirty seconds for a sunflower, 220
coins for the north meadow and 140 for the first point of renown were all
chosen without watching one person play.

`/admin/stats` is the cheapest possible correction: a nested funnel, a
retention figure, and the economy's totals. Nothing is sampled or estimated.
The intent is that what gets built next is argued from that page rather than
from taste — including arguments against everything already built.

The funnel is strictly nested; anything reached in any order is listed as a
milestone instead. Mixing the two is not a cosmetic error: it produced a "200%
of previous" row, which is a sequence announcing it was never a sequence.

## Saying what $AMBER is

The token can now be spent — upgrades, renown — and it still has no way out.
That combination is worse than either alone: a player who burns 60 $AMBER on
an axe today would rightly feel cheated if claims opened tomorrow.

So the game says so, at the point of spending rather than in a settings panel
nobody opens: $AMBER is an in-game balance, spending is permanent, and no date
is promised. That is a disclosure, not a policy — the policy is still a
decision the operator has to make, and `ENABLE_CLAIM` stays false until they
have made it.

## The invite gate lives on the server

The request was a code on the landing page. A code on the landing page is not a
gate: the bundle that checks it is public, `/play` is one address bar away, and
the API would happily create an account for anyone who typed a `curl`. So the
check is in the API, the answer is a signed cookie, and the landing screen is a
courtesy that saves someone a 403.

The hook that enforces it is global, with a short allowlist of open prefixes,
rather than a guard on each route. The alternative fails silently: a route
added six months from now would be public by default and nobody would notice
until it mattered. This way, being reachable without a pass is something a
route has to be named to get.

Two attempt limits, not one. The per-address budget assumes an attacker has one
address; anyone with a proxy pool walks through it, and ten thousand
combinations at full speed is minutes. The second ceiling — sixty failures a
minute across the whole site — bounds the door itself, at the honest cost that
someone hammering it can inconvenience real invitees for up to a minute.

Both limits rested on knowing who is calling, and `trustProxy: true` meant not
knowing: with every hop trusted, the address comes from the _leftmost_
`X-Forwarded-For` entry, which the caller writes. Rotating that header bought a
fresh budget per request and voided the cap entirely. Trust is now the single
hop the game actually runs behind, so the address is the one nginx appended.

None of this makes `1990` strong. Four digits is a soft lock, and the code says
so where someone changing it will read it: the limiter buys days instead of
minutes, and a longer code is the only real fix.

The gate is at the **front door**, and the world is behind it.

An earlier version put the code box only on /play, reasoning that one gate is
easier to keep right than two. True, and beside the point: a door belongs where
people arrive. The landing page now carries the same component in an inline
variant, so there is still only one of them, and the hero's backdrop is the
running game rather than a drawing of it — the terrain comes from the map and
needs no account, so a visitor who has never played still arrives at a real
place. The drawn scene stays underneath for anything that would rather not have
a second WebGL context, `prefers-reduced-motion` included.

The gate is drawn **over** the world, never in place of it. That started as a
bug: returning the gate instead of the game's tree unmounted the div Phaser had
already been handed, so the game booted into a detached 0×0 parent, failed to
build a framebuffer and never started a scene. The gate worked perfectly on top
of a permanently black screen — and it only surfaced because a screenshot was
taken of the running game rather than of the component.

Keeping the host mounted fixes that and pays for itself: the vale renders
behind the code box, because terrain comes from the map and needs no account.
Only the canvas HUD stands down, told through the bridge rather than by
reaching into the scene — `HudScene` is launched by `WorldScene`, so anything
React does on its own schedule lands before there is a scene to talk to. The
bridge mirrors the flag for exactly this reason.

## Known reconciliations

`docs/AMBERVALE_HANDOFF.md` and `docs/prototype/ambervale2.html` were never
supplied. The following are reconstructions from the phase briefs, not ports,
and should be checked against those files if they arrive. All are data, not
logic — correcting them is a config edit.

- World layout: path polylines, building coordinates, node and plot positions
  (`packages/game-config/src/world.ts`).
- `QUESTS` text and reward amounts (`packages/game-config/src/tuning.ts`).
- Delivery NPC names and tints.
- Tutorial copy (`apps/web/src/game/tutorial.ts`). Step order, targets and
  completion conditions follow the Phase 5 brief exactly.
- All procedural sprite art.
