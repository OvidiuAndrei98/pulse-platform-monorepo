# Groups single-reference flow: shared contracts and backend verification

Date: 16 November 2026. This report covers the shared/API implementation, its local request-level tests, and the explicitly identified browser follow-ups. It does not claim to have reproduced the supplied recording against production or on UIKit.

## Evidence and corrections

### Event eligibility and dates

The shared `decisionState` omitted `option.available === false`. A retained event from an earlier night could therefore show an enabled preference action while the destination chooser correctly disabled it. The guard now uses the server's eligibility flag; retained proposals remain available as history rather than being deleted or relabelled as valid.

The API retains its Europe/Bucharest nightlife boundary: 06:00 on the chosen date through 06:00 on the following date. Tests cover after-midnight events, DST, canonical city identities, changing the saved night, and a previously eligible proposal becoming unavailable. Stale revisions and old attendance rounds are rejected; a refresh does not silently resubmit a user's response to a new round.

The video also showed an old editor date alongside a strip clamped to today. That is a frontend inconsistency, not evidence that the API ignored a confirmed save. The native/Next changes preserve the saved context until the user explicitly selects a replacement. This API pass did not change the date boundary or bypass event eligibility.

### One reference per outing and event

The authoritative identity is `(groupId, outingId, eventId)`, with an explicit canonical `referenceMessageId`. It is not a title, photograph, or event ID across the whole group.

- `POST /outings/groups/:groupId/outings` accepts `sourceMessageId` with `eventId`.
- Adding a proposal accepts the same explicit source ID and the current revision.
- The original shared message retains its ID, original author, original time, and text when bound to an outing. Without a source, the server creates a canonical outing reference with event data.
- Subsequent proposal/decision audit entries point to the canonical reference. The shared conversation projection renders these as compact history, preserving the original audit records.
- One event in two distinct outings has two independent references and decisions. Unbound intentional shares remain independent.
- The server serializes binding through the group transaction. Retry is idempotent. A source already bound to another outing, a different event, another group, or unavailable history is rejected.
- Withdrawing attendance uses `answer: "unanswered"` and the current `decisionRound`. It changes only the actor's answer; retry does not add a revision, ticket, or new poster.

The message endpoint supports bounded explicit `references` and returns them separately from its ordinary 50-message page. This lets a refresh hydrate a canonical source older than the currently loaded page without advancing the ordinary history cursor. Membership visibility is checked for these references too; a rejoined member cannot recover old private history by guessing its ID.

Shared-store regression testing also found a terminal pagination bug: filling a targeted-reference gap with `hasMore: false` could leave `oldestMore: true`. The terminal page now clears both flags. Refreshing the newest page preserves the known beginning. A browser follow-up confirmed that Earlier messages disappears and the old canonical source remains one correctly sized cell.

### Checkout blockage and safe recovery

A local request-level test reproduces this specific condition: an unfinished order has reserved a recipient's ticket, but Stripe Pay was never submitted. A second purchase correctly returns `409 OUTING_RECIPIENTS_CHANGED`. For the original buyer the bounded reason is `existing_payment` with their own order ID; another buyer receives `pending_access` without that private order ID. Neither `extraConfirmed` nor a fresh idempotency key bypasses the reservation.

This is a demonstrated recovery gap consistent with the user's symptoms; it does **not** establish the exact response or cause in the supplied recording.

The group projection now separates:

- `myCheckoutReservation`: the current buyer's unsubmitted, unfinished checkout. This is not a ticket, submitted payment, transaction-history entry, or invoice.
- `myPendingPayment`: a payment actually submitted and awaiting its final outcome.
- Individual ticket state, including unknown or unavailable. Unknown remains unknown rather than becoming zero tickets.

The new authenticated `POST /checkout/recover` accepts `{ orderId, eventId, action: "check" | "cancel" }`. It recovers the original order and the original Stripe mode only. A check never creates another order, switches recipients, confirms a PaymentIntent, or marks an untouched checkout as submitted.

The response provides `status`, `paymentAttempted`, optional existing checkout capability, and bounded `recoveryReason` where relevant. The original purchaser and event must match, and the account must still be active. Stored group decision, accepted memberships, recipient status, event availability, and gifting window are checked before returning a capability. A changed context returns `outing_changed` or `review_recipients` without a usable payment capability. The owner can still check or explicitly close the unpaid reservation.

Hosted checkout keeps its original session; native checkout keeps its original PaymentIntent and connected account. Native checkout is not silently converted into a web checkout. Hosted URLs are restricted to HTTPS `checkout.stripe.com` without credentials or an alternate port. All recovery responses are non-cacheable.

Expiry and explicit cancellation use the existing provider reconciliation and inventory release paths. A payment that succeeds during cancellation wins: the result becomes completed and the correct tickets are issued once. Processing remains pending and cannot be reused as a fresh checkout. Provider/storage failures remain errors, not invented success. Completed-order checks and cancellation requests do not refund or change issued tickets.

## Executed verification

### API and database

Tests used only the isolated PostgreSQL instance on `127.0.0.1:55436`, database `spottr_security_test`, role `friends_qa`. The test helper refuses a non-loopback host or another database name. Synthetic users/events have per-test IDs and are cleaned up by those IDs. Production databases, AWS, and the user's 8081/8082 sessions were not used.

Commands run from `api` with `ISOLATION_TEST_DATABASE_URL` set to that local database:

```powershell
go test ./internal/payments ./internal/outings ./internal/router ./cmd -count=1 -timeout 180s
go test ./internal/outings -count=1 -timeout 180s
```

The first full command passed payments, router, and cmd. It exposed one outdated outings test expectation: explicitly adding an event now creates its canonical reference, so the no-op test's baseline had to be taken after that deliberate addition. The corrected focused no-op/retry tests passed, followed by the entire outings package, **PASS in 59.192s**. The persisted final outings result is `api/.tmp/groups-single-flow-outings-final.log`.

Specific new request-level coverage includes:

- Three explicit-reference integration tests: original attribution, source binding/retry, two accounts, withdrawing and repeating an answer, old sources beyond 50 messages, membership visibility, two outings sharing one event, stale preferences/rounds, wrong event and foreign group rollback.
- Four checkout-recovery integration tests. One contains five scenarios: cancel, expire, processing, success racing cancellation, and provider failure. They use real local PostgreSQL and local Stripe HTTP fixtures/injected retrieval, not the Stripe network.
- Repeated native recovery asserts one existing order, zero submitted-attempt records, zero invoices, zero provider write requests, and unchanged inventory until an authoritative final outcome.
- Context and membership changes remove the payment capability while preserving the owner's ability to close their unpaid reservation.
- Hosted recovery verifies original session/account/amount, rejects a mismatch, and releases an expired reservation once.
- The group projection test distinguishes owner-only pre-Pay recovery, post-Pay pending state, closed attempts, actual tickets, and other members' privacy.

### Shared TypeScript and generated contract

The affected shared suite passed **111 tests, zero failures**. It includes canonical projection/collection identity, private references, pagination, date/catalog behavior, stale-response handling, attendance versus tickets, checkout recovery parsing, copy, and two-account cache isolation. Output: `api/.tmp/groups-single-flow-shared-final.log`.

```powershell
# From packages/app-core
$qaTests = rg --files tests | Where-Object {
  $_ -match '(group|outings|outing-checkout|permanent)' -and $_ -match '\.test\.ts$'
}
node --import ./node_modules/tsx/dist/loader.mjs --test @qaTests
node node_modules/typescript/bin/tsc --noEmit
```

Shared TypeScript checking passed. TypeSpec compiled and OpenAPI TypeScript generation completed successfully for the additive fields and `/checkout/recover` route. No new database migration is introduced by this pass; it uses the existing permanent-group, outing-context, order, and payment-attempt tables. API and clients must be released together to expose the new behavior; no server deployment was performed.

An initial output-redirection command referenced a nonexistent repository `.tmp` directory and did not produce a test result. It was corrected to the existing `api/.tmp` directory; only the successful execution is counted above.

### Browser follow-up over real local handlers

The opt-in fixture listened only on `127.0.0.1:8086`. It used real group/event/ticket/recovery handlers and the isolated PostgreSQL database. Fixture bearer identities replace JWT login only. Authentication service login and actual Stripe are therefore outside this browser check.

- The native-web reviewer reported **72/72** checks in the final two-account canonical matrix, zero runtime errors, and an additional **3/3** targeted history checks after the pagination correction. Artifacts: `apps/spottr-native/artifacts/groups-reference-real-api-results.json` and `apps/spottr-native/artifacts/groups-reference-history-results.json`.
- The Next owner reported the real single-flow matrix passing: original member source/creator initiation, withdraw and reply, two proposals, creator-only choice, free self/friend booking and acceptance, deliberate extra registration, incompatible date, and independent second outing for the same event.
- Next additionally exercised the new real `/checkout/recover`: completed free-order check/cancel returned 200 with unchanged ticket state; another buyer, wrong event, or unknown order returned 404; anonymous access returned 401. Result: `apps/pulse-app/.tmp/groups-checkout-recovery-real.json`.

These are browser checks against local API handlers. They are not claims of physical iPhone/Android verification, Liquid Glass/keyboard behavior, card payment, 3DS, paid Stripe webhooks, push delivery, or production data migration.

## Local fixture cleanup

After both browser agents finished, the verified test-only 8086 endpoint received its explicit stop request and the fixture test exited successfully. The verified PostgreSQL data directory on port 55436 was then stopped with `pg_ctl stop -m fast`; its files were retained. No user server was stopped or restarted.
