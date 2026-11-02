# Feed and Friends

The shared navigation order is Home, Map, Friends, Feed, Profile, defined in
`packages/app-core/src/navigation/mainTabs.ts`. Web paths are `/friends` and
`/feed`; Native links resolve to distinct tab roots. Role workspaces retain the
Profile selection at the last index. Existing Liquid Glass interactions remain
in the shared native tab renderer.

Friends brings together outing plans/invitations, friend management, profile QR
connection and friends' visible attendance. It uses the authenticated social
endpoint and renders only friend activity. Attendance requires an accepted
friendship, an active account with public attendance enabled, a published event
that has not ended, and an active organizer. Ticket activity excludes refunded
orders and refund operations. Followed-organizer posts remain available through
their event/organizer pages and notifications.

Feed presents photos in a vertical paged viewport. Event details and purchase
continue through the existing event sheet. Only published events from active
organizers that have not ended are returned, respecting an authenticated user's
hidden categories. The initial order is chronological, not personalized or
ranked by likes. Each API page contains up to ten events (up to 500 pages).

Likes are independent of saved events, RSVP, tickets and outing votes. Public
responses expose a count and the current viewer's own liked flag, without a
liker list. Authenticated `PUT /events/{id}/likes` and `DELETE` are idempotent;
the database primary key is `(user_id,event_id)`. Counts exclude inactive
accounts. Account/event deletion cascades to these records.
Ended or unpublished events cannot receive like mutations; an existing like is
retained until the account/event is deleted or the event becomes eligible again.

Both platforms use `EventFeedStore`, with injected transport, request aborts,
account/token guards, a synchronous per-event write lock, optimistic feedback
and rollback on failure. Older reads cannot overwrite a completed like. There
is no local persistence of likes or checkout state. Reads and writes use
responses marked `Cache-Control: no-store`.

Apply migration **20261102190000_event_likes.sql** before deploying the updated
API, then deploy the frontends. No new environment variables or services are
required. The migration is additive; older API/frontends can continue running.

Verification: core store/parser tests, Go integration tests against a migrated
local `spottr_security_test` database, navigation tests and
`apps/spottr-native/tests/browser-event-feed.cjs` for Native-web or web
(`FEED_TEST_PLATFORM=web`, `NAVIGATION_TEST_URL` pointing to a local preview).
An iOS export validates JavaScript bundling; real-device gestures and rendering
still require an iPhone/Android smoke test.
