# Permanent groups: payment and security review

Reviewed 15 November 2026. All database work described here used PostgreSQL on local `127.0.0.1:55434`. No real server migration, deployment or real Stripe charge was performed.

## Implemented purchase contract

- Existing checkout accepts an explicit recipient selection for a permanent-group outing or independently from an event. `planId` is optional; standalone selections use round zero and accepted friends only. Outing selections require current accepted group and outing membership, the current event and decision round.
- One ticket per explicitly selected recipient, at most eight recipients, one ticket type in the short purchase flow. The payer may select only friends. An existing ticket requires explicit extra-ticket confirmation rather than a universal prohibition.
- Preparation does not make someone an attendee or issue a credential. Recipient reservations share ordered per-event/account locks with personal purchases; an extra-ticket confirmation never bypasses an in-flight gift or personal payment.
- Stripe-confirmed fulfillment uses the saved selection and existing idempotent order issuance. Gifts remain with the buyer until the named account accepts. Acceptance atomically changes ownership and rotates the admission credential. Billing/refund rights remain on the original order. Declining an outing or gift does not submit a refund.
- Zero-price registrations use the real booking/inventory path and individual tickets, with request idempotency. They create no Stripe session, PaymentIntent, payment attempt or invoice.

Main implementation: `api/internal/payments/outing_recipients.go`, `free_recipients.go`, existing `checkout.go`; native and Next `PlanTicketRecipients.tsx`; shared `outings/experience.ts`.

## Offline scanner race

`20261115130000_ticket_offline_exposure.sql` records whether each actual ticket credential was included in an offline snapshot. Captured credentials cannot rotate or have their exposure marker erased, including after snapshot retention deletes the pack. Existing event-wide locks are conservatively backfilled for historical tickets.

New gift purchases still stop after offline preparation. An already-started payment that settles after a pack may issue an unexposed ticket; that ticket can be accepted safely because its previous credential was never downloaded. Snapshot creation and transfer acceptance serialize on the event. A later pack contains the recipient's new credential.

If a pack already contains the issued gift, acceptance is refused. Transfer lists and outing screens receive `blockedReason: offline_snapshot | event_started`, explain the cutoff, and retain access to an independently owned ticket. Wallet assignments and payer summaries agree with that state without requiring a transfer-screen poll first.

An old offline pack cannot validate tickets issued later. Staff must update their pack or scan online for later sales. This also applies to ordinary personal tickets sold after preparation; no old snapshot is silently changed.

## Executed verification

- `go test ./internal/payments ./internal/outings ./internal/tickets -count=1` passed against the isolated security database before the final projection additions. The complete payment suite passed again after moving wallet recipient reads into sqlc queries. Dedicated ticket tests also passed with their required `TICKET_TEST_DATABASE_URL` database, including the existing completed-order isolation test and offline synchronization with 100 concurrent online scans. The backend reviewer confirmed the final complete outing suite passed again after its new projection tests and external-event fixture adjustment. The separate scanner database was then removed.
- New real-PostgreSQL tests in `permanent_group_recipients_integration_test.go` cover standalone friendship checks, absent plan snapshots, explicit extras, reservation protection, and idempotent free gifts with no billing side effects.
- `outing_recipients_integration_test.go` covers accepted membership/current destination, gift versus personal checkout, two buyers targeting the same friend, retryable Stripe closure, and exactly-once fulfillment/acceptance with credential rotation.
- `offline_gift_integration_test.go` covers payment finishing after a pack, pack after gift issuance, blocked versus available acceptance, retention, raw-writer rejection, wallet/order state, personal-purchase protection, and a later pack capturing the rotated credential.
- Existing `TestSnapshotAndAcceptanceRaceKeepsPublishedCredentialsConsistent` passed all five iterations; permanent cutoff and backdated unlisted-scan tests also passed. Existing transferred-ticket email retry security passed with the full payment suite.
- New migration Up/Down/Up passed in a separate disposable database. Historical locked tickets were backfilled; Down retained the test ticket. That database was removed afterward.
- Recipient-mapping migration rollback now refuses to drop either recipient allocations or verified payment closures while either table contains rows, with `OUTING_TICKET_RECIPIENTS_ROLLBACK_REQUIRES_ARCHIVE`. Exclusive locks close the empty-check/concurrent-write gap. In another disposable local database, empty Down/Up passed; separate populated-closure and populated-recipient Down attempts were refused and retained both the tables and original rows/order. The disposable database was removed afterward.
- Shared store/recipient/event-start tests: 24 passed in the reviewer run. Both React Native and Next `tsc --noEmit` passed after API regeneration.

The review also identified and coordinated fixes for removal/rejoin cache invalidation, late private responses, unsent drafts during event sharing, incoming-message page gaps, stale catalog searches, stale outing merges/history cursors, read cursors, and blocked offers hiding an owned QR. New recipient read queries use the handler's sqlc query scope, preserving existing transaction-based callers rather than requiring a separate pool.

## Limits of this review

These checks validate local API/database behavior and TypeScript compilation. This reviewer did not exercise a physical iPhone/Android camera, native Stripe PaymentSheet, native gesture physics, push credentials, network-isolated staff devices, or a real payment. Browser fixture verification and visual captures are reported by the frontend agents separately. No claim of legal/GDPR compliance is made.
