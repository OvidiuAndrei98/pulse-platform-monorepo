# Groups 22:08 audit — shared presentation and local API

Date: 2026-11-15. Scope: `Spottr_2208_Corectii_Card_Foto_Scroll_Codex_RO.md`, shared presentation/state and backend correctness only. Native/Next layout, scroll capture and device observations are reported by their respective reviewers.

## Implemented

- `groupConversationRows` visually groups two or more consecutive historical snapshots for the same outing. Ordinary text, a shared event, another outing, the current invitation, an unresolved outing or an unloaded sequence gap ends a group. The original messages remain unchanged and available for expansion, including their individual authors, times and context snapshots.
- Both chronological and inverted inputs retain their order. An aggregate key uses its oldest sequence's message ID, so adding a newer update does not replace that aggregate's key. No author is assigned to the aggregate itself.
- Existing API snapshots identify the original decision round/date/city/destination, but do **not** distinguish an initial invitation from every specific type of change. The common copy therefore describes history **versions**, rather than inventing what changed or who made every change. English and Romanian labels use the existing translation system.
- `pinnedOutingPresentation` shares the same selection and text rules across clients: accepted, unexpired, non-cancelled/non-completed outings only; an ongoing outing first, otherwise the nearest upcoming eligible outing, with a stable ID tie-break. Visiting a historical detail is not a pin action. The start of an undecided night uses 06:00 **Europe/Bucharest**, including DST, rather than 06:00 UTC.
- An undecided pinned outing displays its night once and its city/selection state below. It never presents the first suggestion as the chosen destination. A legitimate zero-suggestion state is not rendered as an error. The returned eligible count lets the UI disclose additional outings.

## Actual backend finding

The new real-PostgreSQL regression `TestRepeatedAttendanceKeepsSavedResponseAndRevision` failed before the fix: submitting the same already-saved attendance answer again changed both the outing revision and `responded_at`.

The attendance UPSERT now updates only when the answer differs. The outing revision changes only if an attendance row was inserted or changed. A deliberate `yes` → `no` remains a real change. Existing membership, current decision-round and event-availability checks still run before that no-op decision. This is not a relaxation of stale-response authorization.

This no-op defect did **not** create a chat message. It is not evidence that the repeated historical rows in the submitted video were duplicate server notifications.

The separate regression `TestGroupHistoryNoOpAndRetriedDecisionsDoNotDuplicateMessages` passed against the implementation before the attendance fix. It verifies:

- Saving the same canonical date/city/title does not change the context, revision or message history.
- Replaying creation, or deliberately reusing the same group/night, does not create another invitation.
- Choosing the same destination again does not emit another snapshot/notification; a stale revision still returns 409.
- Retrying an acknowledged reopen preserves its resulting revision and history count.
- A real context edit creates exactly one new historical snapshot; retrying it or saving its identical result does not create another.
- Original snapshots remain readable by the accepted second member.

No database history was removed or migrated to achieve the visual grouping.

## Executed verification

**89 shared-core tests passed**, in two runs from `packages/app-core`:

```text
node --import ./node_modules/tsx/dist/loader.mjs --test tests/group-conversation-presentation.test.ts tests/group-presentation.test.ts tests/groups-corrections.test.ts tests/permanent-groups.test.ts tests/outing-checkout-recovery.test.ts
node --import ./node_modules/tsx/dist/loader.mjs --test tests/groups-settings.test.ts tests/groups-pagination.test.ts tests/outing-decisions.test.ts
```

The first run passed 58 tests, including eight new grouping/pinning regressions; the second passed 31. Shared `tsc --noEmit` also passed. Node initially failed inside the Windows sandbox before executing tests (`uv_os_get_passwd`); the reported successful runs used approved local execution outside that sandbox.

**81 Go tests/subtests passed**, with one explicit skip:

```text
go test ./internal/outings ./internal/common -count=1 -json -timeout 180s
```

- `internal/outings`: 76 passed. The opt-in browser fixture test was skipped in this ordinary suite.
- `internal/common`: five passed.
- Raw output: ignored local artifact `api/.tmp/groups-2208-go-tests.jsonl`.

These tests execute real HTTP handlers and PostgreSQL transactions with synthetic identities. They include catalog eligibility for a known selected night, canonical city spelling, filtering before pagination, midnight/DST/year boundaries, creator/member permissions, reopening and current-round responses. Shared tests verify old catalog responses cannot overwrite a newer date/city context. No new missing-event API defect was established in this phase.

## Isolation and limits

The database was the existing isolated cluster at `postgresql://friends_qa@127.0.0.1:55436/spottr_security_test?sslmode=disable`, stored under `api/.tmp/friends-contract-pg`. The guard refuses another host or database name. No migration was added or executed in this phase, and no remote server was modified.

At the UI reviewer's request, the updated opt-in fixture was then started on loopback 8086 for focused creator/member share/return verification. It uses real groups/event handlers and local synthetic bearer identities in place of JWT login. Its fresh metadata is in ignored `api/.tmp/friends-browser-fixture.json`. The related browser results belong to the UI report; they are not inferred from the Go suite. User sessions on 8081/8082 were not stopped or restarted.

After both UI reviewers finished, the fixture was shut down through its test-only stop endpoint. `TestFriendsBrowserFixtureServer` then passed (1326.80 seconds), including its local cleanup. The isolated PostgreSQL cluster on 55436 was stopped normally with `pg_ctl`; its local test files and QA artifacts were retained. This opt-in fixture pass is separate from the 81 tests/subtests above. Browser observations and their limits are recorded in [the 22:08 browser report](groups-2208-browser-2026-11-15.md).

No paid Stripe purchase, native payment sheet, production login, push delivery, physical iPhone/Android gesture or frame-rate measurement was performed by this backend/shared pass. UI return-to-chat geometry and interactive keyboard behavior require the separate app checks.
