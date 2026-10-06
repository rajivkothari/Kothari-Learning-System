# Rewards and Quest Tokens

Two separate economies. They never convert into each other.

## A. In-game rewards (frequent, thematic)

- Elevator Quest: elevator components, elevator styles, access cards, engineer ranks, control panels, buildings, areas, robot upgrades, cosmetics.
- Magic Tower: castle decorations, clothing, pets, furniture, crowns, wands, storybook items, new fantasy locations, room customization.

Mechanics:
- Defined per theme pack in an unlock catalog. Each unlock has a stable ID and an unlock condition (mission complete, rank reached, encounter cleared, skill level reached).
- Granted once. Re-earning is a no-op. Stored in `inventory`.
- Ranks come from a progression value driven by learning evidence, not time played.
- Progress bars show quest and rank progress. Clear quests, strong completion moments, long-term goals. No monetization patterns.

## B. Quest Tokens (scarce, real-world)

Tokens are redeemed for parent-defined real-world rewards. Because they map to real privileges, they use an append-only ledger.

### Principle: reward growth and mastery, never mistakes

The token economy must never create a strategy where answering wrong on purpose raises the expected payout. A 5-year-old will not reason this out on day one, but a 9-year-old will, and the rule must hold for every learner.

Bad (never do this):

```
First-try success:            +50
Fail three times, succeed:    +50 success +30 persistence = 80
```

Rules:
1. Within one activity or encounter, payout is non-increasing in wrong attempts and in assistance received. More errors never pay more. The payout for a given encounter is set by its difficulty relative to the learner, then reduced (never increased) by heavy assistance such as a demonstrated answer.
2. Persistence is recognized through growth measured across sessions on varied items, never through the error count of one sitting. Valid growth signals:
   - a skill moves to a higher level,
   - independence on a skill rises over time (fewer hints this week than last),
   - a skill that previously needed heavy assistance is later solved independently on new variants, after at least one day,
   - transfer evidence appears for a skill,
   - a hard encounter is cleared.
3. Growth rewards are once per skill per milestone (unique idempotency keys), so a learner cannot cycle a skill down and up to farm them.
4. Cross-session invariant: deliberately failing now and succeeding later must never yield more total tokens than succeeding now. Growth rewards are sized below the immediate reward they would replace, and a learner who succeeds first time still earns the level-up and mastery rewards that the struggling path earns later.
5. A hard encounter may pay more than an easy one because it is harder, not because it took longer.

These invariants get property tests when the token rules are implemented (M8): simulate response sequences and assert that inserting wrong answers never increases expected payout.

### What earns tokens

Events, never time:
- First completion of a meaningful mission.
- Clearing a Stretch challenge.
- Skill level milestones (to proficient, to mastered), once each.
- Transfer demonstrated for a skill, once.
- Clearing a Mastery Encounter (larger, scaled by the encounter's difficulty for this learner).
- Growth signals listed above, once per skill per milestone.

Repetition classes (see LEARNING_MODEL.md section 3):

| Class | Token value |
|---|---|
| Exact replay | none |
| Easy variation of mastered content | none |
| Due spaced review | none or very small, at most once per review cycle |
| Novel application of a mastered skill | small to moderate |
| Higher-order application / encounter | moderate to significant |

Never earned by: elapsed time, replaying mastered content, easy repetition, login frequency.

Amounts are relative to the learner's own challenge level. A kindergarten encounter and a Grade 4 encounter pay the same if they are equally hard for that learner. The formula stays internal. The learner sees "You earned 3 Quest Tokens for restoring the power!", not the math.

Tokens are never subtracted for academic failure.

Not built yet: the token algorithm and ledger. Only these principles are fixed.

Built in M2, revised in M3: the input the token system will consume. Three concepts stay separate (LEARNING_MODEL.md section 7):

- Learning evidence (`learning_events`): what happened. Never read by a reward rule directly.
- In-game progression signals (`GAME_PROGRESS` intents): practice credit, skill milestones, mission completion. These may drive section A (ranks, XP bars, unlocks). Routine practice lands here. No XP formula exists yet, and nothing is keyed to time or logins.
- Progression opportunities (`progression_events`): one-time keyed accomplishments with a best tier (none / low / normal / high). A later stronger demonstration upgrades the tier and records only the increment. Lifetime value per learner is the sum of best tiers, so struggling first can never out-earn succeeding first. This is what a future Quest Token rule will read.

The engine never knows token amounts. No token ledger, balance, or currency table exists yet (a test asserts it). Token rules built on top must keep the same invariants and get their own property tests. A token rule should key its `idempotencyKey` on the progression event id (`learner|key->tier`) so each upgrade pays at most once.

### Ledger

```ts
type LedgerEntryType =
  | "EARN" | "REDEEM_HOLD" | "REDEEM_RELEASE" | "REDEEM_COMMIT"
  | "PARENT_ADJUST" | "REVERSAL";

interface LedgerEntry {
  id: string;               // UUID
  learnerId: string;
  type: LedgerEntryType;
  amount: number;           // integer, signed
  reasonCode: string;       // "mission.firstComplete", "skill.mastered", "parent.bonus"
  sourceRef?: string;       // missionId, encounterId, skillId, redemptionId
  idempotencyKey: string;   // "earn:skill.mastered:math.add.within20" (unique per learner)
  ruleVersion: string;
  actor: "system" | "parent";
  note?: string;
  relatedEntryId?: string;
  createdAt: string;
}
```

Invariants:
- Entries are never updated or deleted. Corrections are new entries (`REVERSAL`, `PARENT_ADJUST`).
- `balance = sum(amount)`. Holds are negative entries, so tokens on hold are already excluded from the spendable balance. Parent Mode also shows "on hold" separately.
- `idempotencyKey` is unique per learner, enforced by the database.
- A learner action can never push the balance below zero. Parents can adjust freely, with a note.
- Every entry is explainable in Parent Mode: what, when, why, from which mission.

### Redemption flow

1. Learner taps an affordable reward -> `REDEEM_HOLD` (negative) + request `PENDING`. Screen shows "Reward requested!"
2. Parent Mode: Approve, Schedule, Decline and refund.
   - Approve -> `REDEEM_COMMIT` (amount 0, closes the hold), request `APPROVED`.
   - Schedule -> request `SCHEDULED` with a date, hold stays.
   - Decline -> `REDEEM_RELEASE` (positive refund), request `DECLINED`, optional kind note.
3. The app never authorizes a real-world privilege on its own.

### Parent reward catalog

Per learner. Fields: name, icon, token cost, active flag, availability (always, weekends, custom days), optional limit (per week/month), sort order. Starter templates: 15 / 30 min video-game time, choose family movie, movie night, choose dessert, stay up a little later, choose family activity, ice cream outing, custom.

## Presentation scale

| Event | Feedback |
|---|---|
| Single correct action | small, immediate, thematic. Under 1 second. Skippable. |
| Mission complete | short sequence, progress bar fill, unlock reveal |
| Mastery encounter cleared | full set piece: lights restore, music swells, characters react, area unlocks, token award, permanent accomplishment |

Routine success stays small so major success feels major.

Accomplishments are permanent records with date, title, and encounter, shown in a themed trophy room (Engineering Log in Elevator Quest, Royal Storybook in Magic Tower).
