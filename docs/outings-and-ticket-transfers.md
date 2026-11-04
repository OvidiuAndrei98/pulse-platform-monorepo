# Outing plans, event night and ticket transfers

## Entry points

- Profile → “Where are we going?” / “Unde ieșim?” opens private plans (`/outings`). Ticket transfers live separately in Profile → Account and security → Ticket transfers (`/ticket-transfers`). Legacy transfer links under `/outings` redirect to that page with only a validated ticket UUID.
- Create a plan with a name, supported city, 1–3 candidate nights and 1–7 existing friends. The creator starts as available on each proposed night. Accepted members answer yes/maybe/no per night; only the creator confirms the night. Then participants propose up to 8 events in the same city and nightlife night. Each member can independently answer yes/maybe/no for multiple events. Only the creator confirms the destination; neither dates, deadlines nor votes reserve or buy tickets.
- A nightlife night runs from 06:00 to 06:00 in Europe/Bucharest, including the real 23/25-hour DST nights. After-midnight events belong to the previous night. New planning dates use the current nightlife night through 365 calendar days ahead.
- An optional personal budget is visible only to its owner. Others receive aggregate budget-fit counts, based on the cheapest currently available ticket including the effective customer service fee. Discounts can change checkout prices. Planning never creates a checkout or a payment.
- The response deadline closes availability, proposals and event votes. It does not select a winner automatically. The creator can confirm or extend it. Notifications are recorded once before the deadline and once to the creator after it. Foreground screens use bounded, abortable long polling for current revisions, not a persistent socket.
- After confirmation, the plan shows existing ticket access, a creator-editable meeting place/time and manual arrival states. Manual arrival never substitutes an admission scan. The creator may reopen the event vote (Plan B) within the same night/city: prior choices and ticket ownership remain visible; no ticket is bought, exchanged, cancelled or refunded. Meeting/arrival data resets for the new round.
- Member photos use real avatarUrl values from the API. Initials are a fallback only. Native planner avatars share the Home photo component and native glass rim where available. Friends deliberately has no additional Find friends search or Quick Connect QR row.
- A ticket opens “Your event night” (`/events/{eventId}/night`): admission QR, private group/help, meeting point, cloakroom pickup confirmation, lineup and event updates. The existing private group can be created before the event; help requires a validated admission. This is an in-app alert to friends, not an emergency service.
- The ticket viewer also opens the transfer form. Enter the recipient’s account email and confirm. An active account with that verified email accepts from its transfer inbox. Pending invitations generate in-app notifications; this feature does not send transfer invitation emails. Addresses not registered yet get the same creation response and can register/activate before accepting.

After the choice, accepted participants see current Spottr admission ownership, live ticket pricing/availability and links to buy their own ticket. Eligible holders can open the event-night screen and existing private event group. Membership in an outing never creates ticket rights or bypasses group invitations. External-platform tickets cannot be verified by Spottr.

Pending invitees receive only the plan context, never members, proposals, votes or admission status. Declined/outsider accounts cannot read the plan. Plans created by older versions are backfilled from their first proposal; an empty legacy plan without context is preserved but cannot receive new proposals.

## Ownership and safety rules

- Creating an invitation keeps the admission with its current holder. Acceptance changes the holder and cryptographically rotates its QR in one transaction. Decline/cancel do not rotate it. Repeated acceptance never rotates twice.
- The order, invoice and refund rights stay with the original buyer. A financial refund invalidates admission rights for the recipient too. The buyer’s ticket email contains only admissions still held by that buyer; a retry after transferring all admissions completes without sending an email.
- Used tickets, refunded/refunding orders, inactive accounts, cancelled events and tickets for events already started cannot be transferred.
- The first offline scanner package permanently closes transfers for that event. Deleting or expiring a package does not reopen transfers: previously downloaded copies may still exist.
- Snapshot version 2 records exact ticket/invitation membership. Sync checks that membership, current eligibility and the actual scan time. Rotated admissions reject old QR hashes and old validation writers, including after transfer history retention/deletion.
- Write operations are rate limited and account scoped. Views and mutations discard results from a previous session. Sender responses do not reveal whether an email already belongs to an account.
- Meeting points are text, limited to 160 characters, editable by the private group creator. They are shared only with accepted members who retain admission rights. No location tracking is added.

## Retention and translations

- New outing plans expire at Romania midnight two calendar days after the selected date and are removed by the minute worker. This keeps future plans open beyond the former 30-day limit.
- Existing event safety groups/messages expire 24 hours after the event ends.
- Terminal ticket transfer records, including the invitation email, are removed after 90 days. Deleting a recipient account also removes email-addressed invitations; financial records follow the existing account-deletion policy. QR generation protection remains on the ticket independently of transfer history.
- Cloakroom copy is centralized under `translation.wardrobe` in `packages/app-core/src/i18n/resources.ts`, for both Romanian and English. Web and Native use the same resource data; compatibility helpers no longer contain separate dictionaries.

## Deployment

1. Apply migrations through `20261103180000_outing_nights_and_group_decisions.sql` before starting the new API, including both older outing migrations if missing. New dates, reactions, deadline markers and decision history are backfilled. Read the guarded Down migrations before any rollback; prefer a compatible roll-forward once plans/transfers exist.
2. Deploy the API and verify health checks, then publish Web and the Native build.
3. Check on staging: create/accept/vote/choose; transfer/accept/old QR rejection; buyer invoice/refund ownership; offline package creation followed by transfer rejection; event-night help and pickup approval.

The migration deliberately rejects old snapshot writers and old validators for rotated tickets. During a rolling deployment those old requests can fail closed until all API tasks use the new version. Use a short maintenance window to avoid that interruption. Do not roll back the migration after real transfers: it would remove the persistent invalidation guards. Roll forward with a compatible API instead.

No cloud deployment, production data change or real email/payment was performed while implementing this feature.

## Earlier validation (before the 3 November group-decision redesign)

- Shared core, Web and Native TypeScript checks and unit suites passed.
- Full Go suite passed against isolated migrated PostgreSQL test databases. Integration cases cover QR rotation, concurrent cancel/accept, financial ownership, buyer email retries, stale validators, snapshot/transfer races, revoked scanner access, refunds, inactive accounts and invitation eligibility.
- Production Next build, Expo Web export and iOS Hermes bundle export passed. A bundle export is not a signed iOS install.
- Browser flows run against both built applications with isolated simulated APIs at 320, 390 and 1024 pixels. They cover plan creation/voting/decision, invitation acceptance, incoming/outgoing transfers, meeting point editing, hold-for-help/resolve and pickup approval.
- The earlier transfer/planning implementation had an independent review. Its ratings do not certify the newer group-decision migration or redesigned screens. A stale in-app transfer notification grants no admission rights.
- Physical iPhone/Android checks for keyboard, native gestures, camera and Liquid Glass remain necessary before release.

Run the browser suite from `apps/spottr-native` with `node tests/browser-outings.cjs`. For Next, start a local production preview and set `OUTINGS_TEST_PLATFORM=web` and `NAVIGATION_TEST_URL=http://127.0.0.1:49188` before running the same script. All integration DSNs must point to isolated local test databases.

## 3 November 2026 local validation

The current group-decision implementation is tested separately from the earlier transfer work. Shared-core tests include multi-option preferences, legacy vote compatibility, Romanian night boundaries, budget parsing and read-only finished nights. PostgreSQL integration tests verify invitation privacy, real member avatar delivery, permissions, deadlines, reactions, budgets including the buyer fee, meetup, arrival and Plan B preserving ticket ownership.

UI verification uses only simulated APIs in local agent previews (Expo 8083 and Next 8084). Fixtures also cover photos, narrow layouts, plan creation, voting, private-group messages and ticket-transfer regressions. Browser success is not design approval or proof of native iPhone gestures/glass. No cloud deployment or signed native build was performed.
