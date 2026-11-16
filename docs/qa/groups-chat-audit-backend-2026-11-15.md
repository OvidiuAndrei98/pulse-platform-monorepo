# Groups chat audit — shared state and local API

Date: 2026-11-15. Applied `Spottr_Chat_Carduri_Sheeturi_Audit_15_Nov_Codex_RO.md` and its accompanying request to the existing permanent-group implementation. No production deployment, remote data mutation or production migration was performed.

## Findings and changes

- **Eligible events:** a real local HTTP trace used an empty query, the selected night and both `Bucuresti`/`București`. Both catalog responses were HTTP 200 with four eligible local events, including the expected fixtures. Existing integration coverage also verifies pagination and the selected night boundary (06:00 to 06:00, Europe/Bucharest). An exact missing-event defect from the recording was not reproduced in this backend snapshot; the recording alone is not evidence of its cause.
- **Responses after reopening:** an outing's revision and decision round change on reopen/context/destination changes. A stale request correctly receives `409 PLAN_CHANGED`. Previously, the shared client could leave that stale entity installed after the rejection. It now fetches the canonical outing directly and asks the user to review and respond again. It never replays a vote against a changed question. A failed refresh remains an error; it does not report a saved response. Lost membership/session handling is preserved.
- **Readiness:** `groupTicketReadiness` distinguishes loading, failed checks, unknown ticket status and verified ticket ownership. Unknown is not counted as no ticket. Confirmed attendance and owned tickets remain separate facts, and an already verified personal QR remains accessible independently of another member's unknown state or a failed refresh.
- **Checkout recovery:** purchase and free registration keep the existing `OUTING_RECIPIENTS_CHANGED` conflict code and add bounded reasons: `review_recipients`, `outing_changed`, `additional_ticket_confirmation`, `pending_access`, or `existing_payment`. An order reference is returned only for the requesting buyer's own relevant pending order. Another buyer's order is never disclosed. Existing authorization, recipient eligibility, inventory locking and explicit extra-ticket confirmation remain enforced.
- **Concrete backend defect reproduced and fixed:** a storage failure while claiming a free-registration request was incorrectly converted into `409 OUTING_RECIPIENTS_CHANGED`. A regression test failed with that response before the fix and passed with HTTP 503 afterwards. Missing/changed event selection remains a conflict; unavailable storage is no longer presented as a selection mistake.
- **Shared recovery:** `outingCheckoutRecovery` maps only known selection/gift-window errors to an explicit next action. It supports older API responses without the new reason. Unrelated payment errors retain their existing handling. This helper neither starts a payment nor automatically retries a purchase or changes its idempotency key.
- Added English/Romanian copy for compact historical messages, discard confirmation, response recovery, readiness, destination confirmation and privacy. `groups.historyCurrent`, `groups.privacyTitle` and the neutral `groups.outingTitleLabel` are included.

## Real HTTP trace

The ignored local artifact `api/.tmp/group-audit-http-results.json` records **24 requests** against the isolated API. It includes request bodies/statuses and canonical revisions, without bearer tokens. The flow uses two synthetic accepted members:

1. Fetch eligible events with the selected city/night, create a group and accept membership.
2. Create an outing, add two proposals and save a member preference.
3. Creator selects a destination; member confirms attendance.
4. Creator reopens the outing. A stale preference returns 409; a canonical read followed by a deliberate response succeeds.
5. Creator chooses the alternative. Attendance using the earlier round returns 409; a current-round response succeeds and persists.

The trace contains the two expected `PLAN_CHANGED` conflicts. Separate PostgreSQL integration tests cover unauthorized selection/reopening, old attendance retention and purchase conflicts.

## Executed automated verification

- **81 shared-core tests passed**:

  ```text
  node --import ./node_modules/tsx/dist/loader.mjs --test tests/group-presentation.test.ts tests/permanent-groups.test.ts tests/groups-settings.test.ts tests/groups-corrections.test.ts tests/groups-pagination.test.ts tests/outing-decisions.test.ts tests/outing-checkout-recovery.test.ts
  ```

  Executed from `packages/app-core`. Includes stale-response refresh/no automatic replay, failed refresh, accepted-member scope, unknown/readiness states, personal QR independence, checkout reason mapping and private order-reference handling.

- Shared core `tsc --noEmit` passed. TypeSpec compilation and generated OpenAPI TypeScript generation passed.
- Full real-PostgreSQL run:

  ```text
  go test ./internal/outings ./internal/payments -count=1 -json -timeout 300s
  ```

  Executed from `api` with the explicit isolated DSN below. **306 tests/subtests passed**, eight skipped. `outings`: 74 passed, one skipped; `payments`: 232 passed, seven skipped. JSON output: `api/.tmp/friends-chat-audit-go-tests.jsonl`.

  The skips were the separately opted-in browser fixture, five tests requiring `ABUSE_TEST_DATABASE_URL`, and two tests requiring the separate `TICKET_TEST_DATABASE_URL` database. They are not counted as passed. The full package run preceded the final storage-failure classification fix.

- Following that final fix, **four affected real-PostgreSQL tests passed**: free registration idempotency/offered ownership/no invoice, own-order versus other-buyer pending recovery, closed/harmless failed-order exclusion, and the new storage-failure regression. The last test had been run and failed before the fix.
- `git diff --check` passed (repository line-ending warnings only).

New/extended integration cases are in `api/internal/outings/event_choice_integration_test.go` and `api/internal/payments/recipient_recovery_integration_test.go`.

## Isolation, fixture and schema

Database: `postgresql://friends_qa@127.0.0.1:55436/spottr_security_test?sslmode=disable`. Cluster directory: `api/.tmp/friends-contract-pg`. The test guard restricts execution to the explicit loopback test database. User servers on 8081/8082 were not restarted or stopped.

The opt-in `TestFriendsBrowserFixtureServer` ran actual groups/outings/events/social/ticket handlers on loopback 8086. Synthetic bearer identities replaced JWT login; membership/coordinator checks and database transactions remained real. The fixture exposed real free-registration, ticket ownership and transfer acceptance handlers, with a seeded zero-price registration event. It did not configure or invoke Stripe. `Cache-Control` and `Idempotency-Key` were allowed for the separate local browser origins.

Native-web and Next agents exercised the actual fixture in two browser identities, including free tickets for self/friend, recipient acceptance and deliberate additional registration. Their UI evidence is reported separately. The final fixture process passed on graceful shutdown after both agents finished (`478.69 s`); synthetic fixture cleanup completed and the isolated PostgreSQL cluster was stopped. Its workspace data directory and ignored QA artifacts were retained for reproducibility. The final storage-error classification was tested separately after the fixture binary was started, not through its browser session.

TypeSpec and the generated client describe the additive checkout-conflict response and the free-booking idempotency header. This phase requires **no new migration**. The earlier nullable group-message snapshot migration remains a prerequisite of the broader permanent-groups implementation; it was not rerun on any remote database. The new detailed recovery reasons require deployment of the updated API; older responses fall back to generic selection review.

## Limits

- These checks do not prove the precise cause of the submitted video or a production-only eligibility issue.
- No production JWT login, live Stripe payment, payment-sheet callback, email/push delivery or external invoice issuance was exercised here.
- A local zero-price registration is not evidence that a paid Stripe flow completed.
- Physical iPhone/Android keyboard behavior, Liquid Glass rendering and frame timing are outside this backend/shared verification. Browser evidence must not be described as device evidence.
