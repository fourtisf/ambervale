# docs/

## Expected contents

| File                               | Status         | Needed by         |
| ---------------------------------- | -------------- | ----------------- |
| `AMBERVALE_CLAUDE_CODE_PROMPTS.md` | ✅ present     | all phases        |
| `AMBERVALE_HANDOFF.md`             | ❌ **missing** | Phases 0–8        |
| `prototype/ambervale2.html`        | ❌ **missing** | Phases 1, 3, 5, 6 |

## Missing files

Neither the handoff spec nor the prototype was supplied when Phase 0 was built.
They are the normative source for:

- **§2 / §4** — world layout, ambient life, the 8-quest chain, Goods and
  ANIMALS tables.
- **§3** — server authority rules, rate limits, abuse model.
- **§5** — the Prisma schema (User, Plot, ResourceNode, Animal, GroundItem,
  InventoryItem, SeedItem, DeliverySlot, AmberLedger, Expansion, EventLog).
- **§7 / §8** — chain decision, claim flow, deploy topology.
- `prototype/ambervale2.html` — the seeded world generator, every `makeSpr`
  painter, the control scheme, the tutorial `TUT` array and the WebAudio synth.
  **Phase 1 cannot start without it**: its acceptance bar is visual parity with
  this file.

Drop both into place before running Prompt 1:

```
docs/AMBERVALE_HANDOFF.md
docs/prototype/ambervale2.html
```

## Assumptions made in Phase 0 without the handoff

`QUESTS` in `packages/game-config` was reconstructed from the completion
conditions enumerated in Prompt 4, which lists exactly eight counters in this
order: `plantedCount>=3`, `harvestedCount>=3`, `soldCount>=1`,
`choppedCount>=1`, `level>=3`, `deliveriesDone>=1`, `milkCount>=1`,
`expansion.north`.

The **quest text and reward amounts are invented placeholders** — handoff §4 is
the authority. Reconcile `QUESTS` against it before Phase 4 ships, and treat any
mismatch as a game-config fix, not a server fix.
