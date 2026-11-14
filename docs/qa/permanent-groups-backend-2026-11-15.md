# Permanent friend groups: backend verification

Scope: the backend portion of `Spottr_Grupuri_Permanente_Brief_Codex.md`, read in full. Work and database migrations were confined to local disposable PostgreSQL databases. This report does not claim device, browser, visual, production, or real Stripe checks.

## Implemented

- Permanent groups have an administrator, accepted/pending membership, explicit accept/decline, invitations, rename, administrator transfer, leave/remove, and mute. Group creation requires accepted friends and may atomically include an event share.
- One conversation belongs to the group, independently of events and outing lifetimes. Ordinary accepted members can share events and propose outings. Sharing an event alone does not create an outing.
- Message sends use a stable client request UUID; group/outings creation and message retries are idempotent. Changing a retried payload is a controlled conflict. Group creation remains idempotent after administrator transfer through immutable `created_by`; outing creation uses the stable group/request pair.
- Messages are paginated at 50 items with a sequence cursor; the shared-event collection is deduplicated. Sender avatars and current event presentation are loaded with the message page, without one query per event. Message text is excluded from lock-screen notification bodies and diagnostic logs.
- Pending invitations cannot read the conversation, preview, sequence metadata, outings, or member ticket states. Acceptance/reacceptance establishes a new history boundary; the current active outing snapshot is available without restoring old personal attendance.
- Leaving/removal revokes API access and notifications, excludes the member from outing projections, and preserves personal tickets. When an initiator leaves, the group administrator inherits coordination. Account deletion selects an accepted active successor; if none remains, private orphan history is retained and is inaccessible through normal group authorization.
- A known event immediately creates a destination-selected outing with no artificial date poll or attendance. A fixed night permits personal availability; the optional two/three-night poll remains separate from destination attendance.
- Group-first locking and a unique group/night constraint serialize simultaneous creation/date selection. Date/city/event eligibility is authoritative on the server. New shares, proposals, and destinations accept published events, not private scheduled or draft events.
- The nightlife rule is 06:00 to the following local 06:00 in `Europe/Bucharest`. Both Go eligibility and SQL expiry construction handle DST. Chosen outings finish at the event's actual end; ending an outing never closes the group.
- Personal event preferences do not select the destination or imply attendance. Only the outing coordinator confirms/reopens the destination. Alternatives may be proposed without silently changing the chosen event. Removing proposals is authorized and cannot remove the selected destination.
- Attendance is tied to the current decision round. Destination changes and material event time/location edits require a new personal response. A title-only change does not reset attendance. Reopening does not introduce a default deadline or alter orders/tickets.
- Readiness counts distinct accepted members who answered yes and hold usable personal admission. Refusals do not increase the denominator; zero confirmations never produces all-ready. Used tickets remain admission, zero-price registration still requires a ticket, and unverifiable external admission is unknown with `hasTicket` unset.
- Prepared/abandoned payment sheets do not produce public processing status: a recorded payment attempt is required. An unaccepted transferable offer is offered, not ready; offline-exposed, already-used, refunded, or past-start offers do not hide the purchaser's remaining admission before cleanup runs.
- Permanent-group plan projections batch members, attendance, ticket status, prices, reactions, and historical choices. Group list responses avoid hydrating all outings. Group detail is bounded to 20 recent outings; older outings have an authorized cursor endpoint and canonical detail lookup.
- Notifications carry `groupId` and `outingPlanId`. Accepted, active and unmuted recipients receive relevant group updates; pending members receive only their invitation. Normal chat notices aggregate into one unread notice per group/recipient. Every delivery rechecks membership/mute, including already-queued push deliveries. Vote/attendance taps do not emit a message/push storm.

## Retired automatic event chat

- All seven old safety-group handlers return controlled HTTP 410 `EVENT_CHAT_RETIRED`, with no database write and no-store caching.
- The safety-group cleanup/closure worker is removed from API startup. Event edits no longer update/close the old safety group or its messages.
- Old standalone plan creation and meeting-point creation return controlled 410 responses. Historical plans are readable by existing authorized participants, including expired plans, but their old write actions are retired.
- Old automatic-group messages and membership are not copied into permanent groups and are not broadly deleted.
- Notification list/unread/single-fetch and push delivery exclude every retired `safety_*` notice. Previously queued notices cannot bypass retirement.
- Database guards reject inserts and updates to the three retired automatic-chat tables. The guards intentionally survive rollback.

## Main source files

- `api/internal/outings/groups.go`: group membership, conversation, shared-event collection, read cursor and idempotency.
- `api/internal/outings/group_outings.go`, `group_history.go`: explicit outings, attendance, group authorization, bounded history.
- `api/internal/outings/plans.go`, `planning.go`, `planning_updates.go`: server event/night rules, proposal selection, legacy read-only access and selective reminders.
- `api/internal/outings/group_projection.go`, `group_projection_state.go`: batched private ticket/attendance projections and authoritative readiness.
- `api/internal/safetygroups/groups.go`, `api/cmd/app.go`, `api/internal/events/events.go`: retired automatic-chat write paths/worker/event maintenance.
- `api/internal/notifications/*`, `api/db/queries/notifications.sql`, corresponding generated query: membership-aware notification and push behavior.
- `api/internal/events/responses.go`: public event gift-purchase capability, recomputed from server state.
- `api/internal/database/migrations/20261114120000_permanent_friend_groups.sql`: additive group schema, event/account lifecycle triggers, history and request indexes, retirement guards.

Ticket recipient/offline exposure checkout work and its dedicated tests are documented separately by the payments reviewer; this report does not claim that implementation as a visual or Stripe test.

## Tests executed

Local PostgreSQL 18, loopback port 55434, isolated databases with test-only users. No real account or production database was used.

| Check | Actual result |
|---|---|
| `go test ./... -count=1` in `api`, with `ISOLATION_TEST_DATABASE_URL` pointing to `spottr_security_test` | All packages passed. This enables the outings/payment security integration fixtures; other opt-in integration suites without their own environment variables may skip. |
| Full outings/notification/retirement suite before final projection/account edge-case additions | Passed: outings 14.725s, notifications 0.361s, safetygroups 0.621s. |
| Full outings suite after the final projection and last-owner deletion changes | Passed: 18.107s. |
| Notifications suite with both isolated security and `spottr_push_test` URLs | Passed: 0.653s, including concurrent outbox claims, receipts/device/account lifecycle, group privacy/mute and retirement filtering. No push was sent to a real device. |
| New migration empty-database Down/Up | Passed; the three retirement guards remain, new request index/attendance timestamp exist, and last-owner ownership is nullable. |
| New migration Down with a test group present | Correctly refused with `PERMANENT_GROUPS_ROLLBACK_REQUIRES_ARCHIVE`; the test group remained. Only those disposable fixture rows were cleaned afterward. |
| Scoped `git diff --check` | Passed; only repository LF/CRLF conversion notices. |

`permanent_groups_integration_test.go` exercises multiple real test users across G01–G08, S01–S03, server portions of O01–O06, R01–R04/R06–R08 and L01–L03. It also covers message pagination/unread, a second outing after the first ends, stale/repeated actions, unpublished-event rejection, DST SQL expiry, account deletion with/without a successor, prepared versus attempted payments and blocked transfer projections. Existing transfer/inventory/offline security coverage remains in `outings_integration_test.go`.

Frontend navigation/context, large-text/keyboard/accessibility, screenshots, measured frame behavior and physical iPhone/Android interaction are outside this backend report. A successful Go suite does not prove those acceptance criteria.

## Local API contract details

- Notifications: optional `groupId`, `outingPlanId`.
- Group: `visibleAfterSeq`, optional `joinedAt`, `outingsHasMore`; pending invitations expose no private conversation metadata.
- Outing: `groupId`, `createdAt`, lifecycle, current decision round, per-member attendance/ticket state, distinct confirmed/ready counts and all-confirmed-ready.
- `POST /groups` accepts optional `eventId` to create-and-share atomically; do not follow it with a duplicate automatic share request.
- `GET /groups/{id}` loads at most 20 outings; `GET /groups/{id}/outings?before=<outing UUID>` returns `{items,hasMore}`. `GET /plans/{id}` remains canonical for older authorized outing details.
- `GET /groups` intentionally returns empty outing collections for a lightweight social list. Clients preserve already-authorized hydrated details instead of replacing them with the summary collection.
- Group `ownerId` and returned outing `ownerId` remain UUIDs for every authorized response. Groups lacking a successor after final-account deletion are retained privately but rejected by group authorization.
- Access removal and increases in `visibleAfterSeq`/changes in `joinedAt` require the client to purge cached history and drafts. The backend never reauthorizes prejoin messages just because a client retained them.

## Rollout and remaining limits

- No remote deployment or migration was performed. A later authorized rollout must apply the additive schema before enabling the new clients/API and must include the separately reviewed offline-exposure migration for ticket projections.
- Stop/drain old API workers before rollout or rollback. Persistent retirement guards block old inserts/updates, but they deliberately do not protect historical tables against an independently running obsolete deletion worker.
- Rollback is safe automatically only before permanent groups contain data. Once groups exist, schema Down refuses to discard conversations and needs an explicit archive/rollback procedure. Historical automatic-chat data remains separate throughout.
- The repository has accepted-friend checks and active-account restrictions but no general block/report membership primitive was identified. This implementation reuses the real available permissions and does not simulate blocking or moderation APIs.
- Polling and sequence/revision checks provide authorized current snapshots; this adds no second realtime/chat provider and makes no end-to-end-encryption claim.
- Strict join-time privacy means an event shared in the atomic create-and-share request is not retroactively exposed as a prejoin conversation message after an invitee accepts. Active outings are supplied as current snapshots; the frontend must not backfill hidden messages to compensate.
