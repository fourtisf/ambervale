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
