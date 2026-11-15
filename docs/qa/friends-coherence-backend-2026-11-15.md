# Friends coherence — shared contract and local API verification

Date: 2026-11-15. Scope: `Spottr_Friends_Coerenta_Si_Voturi_Codex.md`, applied to permanent groups. No production deployment or migration was run.

## Implemented

- Shared `social/groupPresentation.ts`: conversation names/previews, localized event/night dates, outing summaries, direct availability/preference/attendance projection, historical-question freshness, related outings and authorized social event grouping. Explicit names are preserved; only empty names derive member labels. New English/Romanian copy is registered through the existing copy system.
- Direct responses retain the existing API semantics. An event preference is independent for every proposal; availability, attendance, invitations and ticket ownership are separate. Pending invitees are counted separately when the owning group is supplied. Closed/expired questions are read-only.
- `planAction(..., {feedback:'inline'})` has a single error owner via `GroupActionError.key`. Default global error feedback is unchanged. Lost-access verification and private-cache purge happen before inline errors are reported.
- New group messages carry a snapshot of their outing question: decision round, original title/city/date/candidate dates and chosen event. Clients compare that snapshot with the current entity before exposing response controls. Old messages without snapshots remain readable and link to the current outing; they do not become an editable current poll. Existing messages/participants are not migrated into new groups.
- Group previews include optional kind/author/date metadata. Empty group names are supported without inventing a stored name.
- Attendance writes now reject cancelled/unpublished or ended destinations; the permanent conversation remains available.
- Social feed DTOs now include optional event end/location/city. Existing friendship and public-attendance authorization remains in the SQL query. A ticket and an explicit public RSVP can both be represented; the Friends projection counts each person once per category and filters known ended events. Private group ticket data is not added to this feed.

## Database/API dependency

`api/internal/database/migrations/20261115200000_group_message_context.sql` adds nullable `friend_group_messages.outing_context JSONB`. It must accompany the new API code; the message queries reference the column. The migration does not rewrite or remove old messages. Only the isolated local test database received it.

TypeSpec/OpenAPI/client schema and SQLC outputs were regenerated. Older API responses without optional presentation metadata remain supported. Empty-name creation and new message snapshots need the new API; no frontend success is simulated when an older server rejects them.

The existing API does not explicitly distinguish an event that needs no ticket from an event with no configured ticket types. The UI must use the event-detail fallback for this ambiguous state. Zero-price registration tickets remain the existing `on_sale` path; no free-entry flag was invented.

## Executed automated checks

1. Shared core TypeScript check: `tsc --noEmit` — passed.
2. TypeSpec compile and OpenAPI TypeScript generation — passed.
3. Shared core regression command — **72 tests passed**:

   ```text
   node --import ./node_modules/tsx/dist/loader.mjs --test tests/group-presentation.test.ts tests/permanent-groups.test.ts tests/groups-settings.test.ts tests/groups-corrections.test.ts tests/groups-pagination.test.ts tests/outing-decisions.test.ts
   ```

   Covers accepted/pending counts, multi-proposal responses, source-of-truth reconciliation, error/retry ownership, access loss and cache purge, historical snapshot validation, context revision handling, pagination, event-night/city filtering, names/previews and distinct social people.

4. Real local PostgreSQL API checks:

   ```text
   go test ./internal/outings ./internal/interactions -count=1 -timeout 180s
   ```

   Both packages passed (`outings` 46.178 s, `interactions` 3.847 s). The output reports package results, not a total test count. Four new tests in `direct_decisions_integration_test.go` also passed in a focused run:
   - Two actors: availability and independent event preferences; reconnect reads; authorized destination selection; attendance independent from an existing ticket; context changes clear affected answers; old questions retain their snapshot.
   - Votes create no extra system messages, notifications or orders. A stale attendance round is refused.
   - Cancelled/expired decision controls are refused while text conversation remains available.
   - Empty names and legacy messages remain compatible; social privacy, independent RSVP/ticket facts, duplicate-ticket deduplication and ended-event exclusion hold.

## Local isolation and browser integration fixture

Created a new PostgreSQL cluster at `api/.tmp/friends-contract-pg`, loopback port **55436**, database **spottr_security_test**, test role **friends_qa**. The existing `testPool` guard restricts integration runs to the explicitly configured loopback test database. All repository migrations were applied to that new cluster only. Existing databases and ports 8081/8082 were untouched.

`TestFriendsBrowserFixtureServer` is opt-in (`SPOTTR_FRIENDS_BROWSER_FIXTURE=1`) and exposes actual production groups/outings/events/social handlers on loopback **8086**. It seeds synthetic creator/member/pending actors, events, two outings and messages. Local metadata is in `api/.tmp/friends-browser-fixture.json`; it is not production account data. Each operation still executes real membership/coordinator checks and PostgreSQL transactions. Two fixed local bearer identities replace JWT login in this fixture. The test exits after an explicit `/__fixture/stop` request or its 45-minute timeout.

Browser agents use separate authenticated contexts against these actual handlers; their screen/interaction findings and screenshots are recorded separately. A read-only smoke check also verified creator/member `/outings/groups` returned HTTP 200 and passed the shared parser. A Next test transport removes only its extra `Cache-Control` request header because that header is not in the fixture CORS allowlist; production is same-origin. This is not a change to production authentication or data handling.

## Not claimed

- No production/staging server, migration, real account, payment or Stripe operation was tested or changed.
- JWT login, email delivery and push-provider delivery were not exercised by the local browser identity wrapper.
- This backend/shared pass does not establish physical iPhone rendering, Liquid Glass, keyboard behavior or frame rate. Browser and physical-device verification must be reported separately.
- The test fixture's API coverage must not be described as a completed real payment or free-entry purchase.
