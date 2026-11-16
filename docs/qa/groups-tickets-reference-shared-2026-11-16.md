# Ticket drawer and single-reference corrections: shared/API verification

Date: 16 November 2026. Scope: `Spottr_16Nov_Corectii_Bilete_Card_Unic_Raspuns_RO.md`, shared contracts/copy, message refresh and isolated API/database checks. Native and Next layout/gesture results are reported by their owners separately.

## Demonstrated defect and correction

The shared `GroupsStore.loadMessages` dropped a requested refresh when another message poll was already running. A mutation such as Propose increments the store version, so the older poll is correctly ignored; however, the mutation's own follow-up message read was also skipped. The cached shared event could therefore keep its old, unbound representation until another external poll or focus refresh.

`group-reference-refetch.test.ts` reproduces the exact ordering: load the unbound source, suspend an old message poll, save Propose with `sourceMessageId`, complete the stale poll, and inspect the canonical card. Before the fix, the source still had no `outingId`. After the fix, one coalesced fresh read hydrates the source immediately after the in-flight read finishes. The source ID, author, timestamp and list anchor remain unchanged; the history entry is projected compactly. There is no optimistic duplicate insertion or new animation.

This is a proven cache-refresh defect. It does **not**, by itself, establish the cause of the two persistent posters in the supplied physical-device recording. The exact request/response and installed bundle from that recording were not available. No claim that the device ran an old client or server is made.

## Propose traced through actual local handlers and PostgreSQL

The current operation is:

1. `POST /outings/groups/:groupId/messages` creates the explicit shared occurrence.
2. `POST /outings/groups/:groupId/outings` receives `eventId`, **`sourceMessageId`**, and its idempotent `requestId`.
3. A group-locked transaction binds that source to the outing/event tuple and retains its original author, time, content and sequence. The proposal initiator is kept separately in the outing/option data.
4. The source is the canonical `referenceMessageId`. A separate creation/decision audit can remain persisted, but its reference points to the source and the shared projection makes it compact history rather than another poster.
5. Group/message reads, including bounded explicit old references, return the current association for both accepted accounts. The client reconciles messages by ID.

New request/database tests execute two Propose requests concurrently from different accepted actors with different operation IDs and the same explicit source. The result is **one outing, one canonical source, one audit record, and zero unbound records for that transition**. Retrying both operations and repeatedly reconnecting through a fresh handler preserves the same source. Attendance changes `yes → no → unanswered → unanswered → yes` do not append a message.

A second test deliberately omits `sourceMessageId` after two independent intentional shares. Those shares remain independent and the new standalone outing gets its own canonical reference. The server does not guess which earlier share was intended from the event ID, title or photograph. This demonstrates why the explicit source contract is required; it is not evidence that the recorded device omitted it.

Existing explicit-reference tests were rerun for wrong source/event/group, rollback, stale revision/attendance round, changed nightlife context, two outings using the same event, history beyond 50 messages, and membership visibility. No global deduplication or historical deletion was added.

## Other shared changes

- Added English/Romanian compact drawer labels: Continue, For you / Who for, ticket type, type selection, unit price, You, unavailable selection, the zero-recipient explanation and the existing eight-recipient limit. The Tickets heading reuses existing copy.
- Reused existing `Vin / Nu vin`, ticket count, fee and total copy. No prices or fee formula were hardcoded in the new labels.
- Direct RSVP withdrawal already uses `answer: "unanswered"` with the authoritative `decisionRound`. Existing authorization and stale-round guards remain intact. UI owners serialize rapid user intentions; the shared mutation guard was not relaxed globally.
- No Stripe, invoice, refund, inventory, recipient-authorization or ticket-visibility policy changed in this pass.
- The subsequent visual steering adds `groups.proposeOuting` and `groupUpdateSummary`. The summary compares only consecutive stored messages for the same outing, with present snapshots and the same or immediately following decision round. Date, city, destination and title changes can then be named and attributed to the current message's original author. Missing snapshots, sequence gaps, another outing, skipped rounds or a missing author use a neutral fallback. RSVP, purchases and unseen actions are never inferred from the current plan. This adds no API metadata or migration.

## Executed checks

The database was only `spottr_security_test` at `127.0.0.1:55436`, role `friends_qa`. The helper refuses non-loopback hosts and another database name. Synthetic IDs were isolated per test. No production data, deployment or migration was used.

From `api`, with `ISOLATION_TEST_DATABASE_URL` set to that local database:

```powershell
go test ./internal/outings -run 'Test(ParallelPropose|MissingSource|Explicit)' -count=1 -v -timeout 120s
```

**5 tests passed**, including the two new tests. The first local shared-store attempt used an incomplete test option and failed schema validation; after making that fixture valid, the pre-fix run failed on the intended missing-source-association assertion. The corrected implementation then passed the regression.

From `packages/app-core`:

```powershell
$qaTests = rg --files tests | Where-Object {
  $_ -match '(group|outings|outing-checkout|permanent)' -and $_ -match '\.test\.ts$'
}
node --import ./node_modules/tsx/dist/loader.mjs --test @qaTests
node node_modules/typescript/bin/tsc --noEmit
```

The first pass completed **113 shared tests**, zero failures; TypeScript checking passed. The focused history/pagination/reference subset also passed 16 tests. After the compact update-summary helper was added, the affected shared suite was rerun: **118 tests passed**, including five new cases for actual field deltas, original authors, mixed changes, missing/gapped history, normalized city/date ordering and neutral fallback. TypeScript checking passed after the helper addition.

After adding the final Continue and maximum-recipient labels, the focused two-test reference/copy file passed again, including interpolation of the recipient count in both languages. The eight-recipient limit is the existing server validation in `outing_recipients.go`; it was not changed for the UI.

## Browser fixture and limits

The opt-in API fixture listens only on `127.0.0.1:8086` and uses the same isolated PostgreSQL database. It serves actual group, event and free-ticket handlers; its synthetic bearer identities replace JWT login only. Native and Next own separate QA groups. Extra synthetic free events are now created and cleaned by the fixture itself: `nativeFreeEventId` for an independent native ownership scenario and `webFreeEventId` for Next. Their metadata is separate, so one suite's purchases cannot change another suite's recipient state.

The real paid `POST /events/:id/tickets/purchase` route was also added to this opt-in fixture. It deliberately has **no Stripe credentials**. A real HTTP request reached the production handler and returned 503, sanitized by the router to `diagnosticCode: HTTP_SERVER_ERROR`. The handler checks its configuration **before** decoding/validating the purchase payload, so that result verifies routing and the safe unconfigured-service response, not recipient validation or payment success. Browser suites may inspect their actual three-step payload separately; this fixture cannot charge anyone. Provider simulation and recipient authorization remain covered by the prior focused Go tests documented in the single-flow report.

The browser reviewer subsequently reported **76 passing checks** on a separate group against these real handlers. The actual Propose request contained `sourceMessageId`. The source retained its ID/author/time and a single photograph after a member answer, deliberately failed response, retry, withdrawal, creator refetch, three picker returns and reselection. A second outing for the same event remained independent; reference hydration beyond 50 messages also passed. Artifact: `apps/spottr-native/artifacts/groups-16nov-real-api-results.json`. This confirms the current request/projection path; it still does not identify the installed code or exact request from the user's recording.

The final browser ticket artifacts were inspected after both UI owners finished:

- Native Web: `apps/spottr-native/artifacts/groups-16nov-ticket-api-results.json`, **27/27 checks passed**, zero browser runtime errors. Actual free booking for self/friend, private pending transfer, recipient acceptance and a separate one-person registration passed. The selected people/type/quantity/extra consent survived the paid three-step form and reached the real unconfigured purchase route.
- Next: `apps/pulse-app/.tmp/groups-16nov-real.json`, **8 successful scenario checks**, including two identities, source preservation, reversible attendance, owner-only destination, self/friend issuance, pending-gift and deliberate-extra guards, acceptance and reload. `groups-16nov-paid-real.json` has **3 successful checks** for constructing the paid selection, its real purchase payload and recovery from the configured test 503 without new tickets. No live card payment was attempted.

Both suites completed before fixture shutdown. The original fixture and updated fixture each exited with `TestFriendsBrowserFixtureServer` passing. The two manually added extras from the first fixture were removed by their exact recorded synthetic event IDs before its shutdown. The updated fixture owns its extra-event cleanup. A final database query confirmed **0 fixture events, 0 fixture actors and 0 groups created by those actors remaining**. The verified agent PostgreSQL datadir `api/.tmp/friends-contract-pg` on port 55436 was then stopped; ports **8086 and 55436 are closed**. Test artifacts/datadir remain available. User servers on 8081/8082 were not stopped or restarted.

This report does not claim physical iPhone/Android drag, Liquid Glass, keyboard, sheet-footer behavior, real Stripe payment, 3DS, paid webhooks or production testing. Browser owners report their actual UI and free-ticket checks separately.

There is no new schema migration or API contract in this pass. The clients still require the explicit source/reference fields implemented in the preceding single-flow change. No server deployment was performed.
