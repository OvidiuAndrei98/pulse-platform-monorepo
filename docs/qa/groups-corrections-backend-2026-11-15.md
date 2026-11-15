# Groups corrections: backend evidence and verification

The full `Spottr_Grupuri_Corectii_15_Nov_Codex.md` was read as an additive correction brief. This report covers backend behavior only. Navbar, Discover Search animation and visual components were not edited in this scope.

## Observed causes, without inferred video diagnoses

Read-only requests were made to the user's existing `http://localhost:8081/api/v1/events`; no session was restarted and no remote group/event/account data was changed. These observations concern public responses without a bearer token; authenticated eligibility was then tested with actual local test users and the same HTTP handler.

1. **City spelling really loses an eligible event.** ROOF TOP, public ID `83f191e3-a9ac-468e-bbd3-40708d3a6f9b`, has city `Bucuresti`, start `2026-11-26T18:00:00Z` and end `2026-11-30T11:28:00Z`. The existing generic interval request for the night of 26 November returns it with `city=Bucuresti`; the identical request with `city=București` returns an empty array. The SQL previously compared `e.city = city`, so the loss occurs in the server filter, before DTO mapping or rendering.
2. **The 19 November empty result is not evidence of that event being missing.** AFTER DARK, ID `aafb7098-db23-43ac-b91e-2ec6772179e9`, starts `2026-11-20T11:29:00Z`, meaning 20 November at 13:29 Bucharest. It does not belong to the night of 19 November. Four older long-running events overlap the interval but their occurrence starts are on other nights. No eligible occurrence-start for night 19 was found among the seven public events returned during inspection.
3. **Generic Discover overlap filtering and outing eligibility differed.** Existing `/events` `startsAfter` checks the event's end, while proposal/confirmation rules check the occurrence start. Filtering a limited page locally after that overlap query is an unsuitable authoritative night catalog.
4. **“Let's go here” has a separately reproduced server failure.** The public POOL PARTY metadata starts `2026-11-08T18:00:00Z` and ends `2026-11-19T18:00:00Z`. Copying these public timestamps into an isolated fixture caused `POST /groups/{id}/outings {eventId}` to fail with `400 INVALID_PLAN_CONTEXT`, even though the event was still running. Its actual occurrence night was rejected by the manual future-night validation. The three captured future events and an accented-city variant succeeded in the same local test.

These are distinct cases. No results from another night were relabelled as eligible to conceal an empty result.

## Implemented server contract

### Exact night catalog

`GET /events?nightDate=YYYY-MM-DD&city=...&q=...&page=...`

- The new optional `nightDate` uses occurrence-start eligibility in `[06:00, following local 06:00)`, `Europe/Bucharest`, before SQL pagination.
- Both endpoints are constructed from consecutive local calendar dates. DST nights correctly span 23 or 25 UTC hours.
- Existing generic Discover `startsAfter`/`startsBefore` overlap behavior remains available unchanged. Mixing those parameters with `nightDate` returns `400 AMBIGUOUS_NIGHT_INTERVAL`; malformed dates return `400 INVALID_NIGHT_DATE`.
- Server city matching normalizes Unicode NFC, trims and compares case/diacritic-insensitively. Proposal/confirmation validation uses the same equivalence. Empty text remains a real list request; zero-price, sold-out or external-ticket events are not removed by an invented purchase-required filter.
- An explicit known still-running event keeps its original occurrence night and actual end, even when that occurrence started earlier. This does not broaden manual night search to overlapping festivals.

### Atomic outing context correction

`POST /outings/plans/{planID}/context`

```json
{
  "revision": 42,
  "city": "Bucuresti",
  "date": "2026-11-20",
  "confirmImpact": true
}
```

Use `dates: [date1, date2]` instead of `date` for an optional multi-night poll. `title` is optional. Exactly one date source is required. Success returns the updated `OutingPlan` with the same plan/group IDs.

- Only the outing coordinator may edit. Accepted group membership is checked and locked before the plan; completed outings cannot be rewritten.
- Material night/city/candidate changes reset current availability/preferences and version personal attendance. The previous context and answers are retained privately in `outing_plan_context_history`.
- Proposals remain as references/history and are revalidated against the new context. An incompatible selected destination is cleared only after explicit impact acknowledgement. A proposal cannot be confirmed while a date poll remains undecided.
- Existing messages, completed/pending orders, ticket ownership, QR credentials, invoice data and transfer purchase snapshots are not moved, cancelled or refunded.
- A title-only or equivalent city spelling change preserves responses and attendance.
- Stale conflicting revisions return `409 PLAN_CHANGED`; a lost acknowledgement retry of the same material edit does not repeat resets or notifications.
- An unacknowledged material edit with existing proposals/answers/destination returns `409 CONTEXT_CONFIRMATION_REQUIRED` and `impact` counts: `availabilityResponses`, `eventPreferences`, `attendanceResponses`, `proposalsKept`, `proposalsIncompatible`, `destinationCleared`, `ticketsUnaffected`.
- A target night already in the group returns `409 OUTING_EXISTS` with `existingPlanId`; it is never silently merged or overwritten.
- Coordinator failures use `403 OUTING_EDIT_FORBIDDEN`; ended outings use `409 OUTING_COMPLETED`.
- Availability/proposal/vote/choose/date/deadline actions accept an optional `revision`, allowing updated clients to reject old in-flight actions after context changes. Attendance already validates the destination round.
- Reopen with no chosen destination remains an explicit `409 PLAN_NOT_DECIDED`; it does not become a generic server error. Client menus must hide that impossible action.

## Verification actually executed

Real isolated PostgreSQL 18 on loopback port 55434; no production migrations, real charges, remote writes or push deliveries.

- `TestKnownPublicEventDTOCreatesOuting`: captured ROOF TOP, AFTER DARK, Best Party, accented-city AFTER DARK and the previously failing ongoing POOL PARTY all pass after the fix.
- `TestCatalogNightAndGroupEligibilityUseSameBoundariesAndCity`: actual event HTTP handler and proposal eligibility agree at 05:59/06:00, 23:00, next-day 01:00/05:59/06:00 and later-night boundaries. Canonical/display city spellings return the same IDs; an empty text request loads results.
- `TestCatalogNightFilterPrecedesPagination`: 25 eligible occurrences plus 25 older overlapping occurrences produce eligible pages of 20/5/0, with no duplicates or overlap-only substitutions.
- Common time/city tests cover November's explicit UTC interval, month/year transition, the March/October 2026 DST nights, invalid dates and composed/decomposed Romanian diacritics.
- Context tests cover same identity, coordinator/member permissions, impact acknowledgement, preserved order/invoice JSON and ticket holder/hash/generation, archived answers, replay-safe notifications, stale revisions, explicit duplicate-plan ID, title-only changes, completed outings, fixed→poll→fixed proposal revalidation and simultaneous conflicting edits.
- `go test -p 1 ./... -count=1` passed with the isolated integration database enabled: outings 17.874s, events 4.586s, payments 24.024s, promotions 3.965s; all API packages passed. Other separately opt-in suites without their own database variables may skip.
- The first parallel-package run had a promotion invoice-job claim fixture failure. That specific test passed alone; the full serial-package run then passed. The shared test database contains global worker queues, so serial package execution avoids cross-package fixture claims.
- The context-history migration was applied locally; empty-table Down/Up passed. Down with an actual snapshot correctly refused `OUTING_CONTEXT_ROLLBACK_REQUIRES_ARCHIVE`, preserved the snapshot, and only the exact disposable fixture rows were then cleaned.
- The separate payments reviewer ran `TestPendingGiftFulfillsOriginalEventAfterActualOutingContextEdit`: a real context POST preserved the original pending-order JSON; repeated local fulfillment then issued the original-event tickets and one offer using the original recipient/round. No real Stripe API was called.

## Files and deployment limits

Core changes: `api/internal/common/nightlife.go`, `api/internal/events/events.go`, `api/db/queries/events.sql` and its regenerated query, `api/internal/outings/context.go`, `group_outings.go`, `planning.go`, `plans.go`, `handler.go`; new regression files accompany them.

The additive migration is `20261115160000_outing_context_history.sql`. Its snapshots are private backend history, never conversation payloads; destructive rollback refuses nonempty history. Unicode normalization reuses the already-present `golang.org/x/text` version.

No new server code or migration was deployed to the user's real API. The new context route and authoritative night query require a later authorized backend rollout; a client reload alone cannot add them to the remote API. Browser/device layout, Liquid Glass, received timestamps and navigation screenshots are covered by the frontend work, not claimed in this backend report.
