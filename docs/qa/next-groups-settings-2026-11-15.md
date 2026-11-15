# Next permanent-group navigation acceptance — 15 November 2026

Scope: `Spottr_Grupuri_UX_Setari_Sheeturi_15_Nov_Codex.md`, with the subsequently requested transparent composer row, responsive message growth and server-owned conversation ordering. The approved group list and conversation retain their structure and materials. Navbar and Discover Search were not changed.

## Canonical destinations

- `/groups/[groupId]/info`: identity, accepted/pending roster, concise admin actions, collections and notification state. Rename/invite/remove/transfer/leave each use a single-purpose existing ModalFrame.
- `/groups/[groupId]/outings`: compact navigable rows, explicit empty/loading/error, cursor pagination and source-position restoration.
- `/groups/[groupId]/events`: authorized shared-event collection, distinct failure states, cursor pagination and source-position restoration.
- `/groups/[groupId]/events/select`: dedicated contextual event picker. Empty query loads immediately. Proposal and unrestricted chat-share modes remain distinct. Back returns to its explicit source.
- `/groups/[groupId]/outings/new`: short existing night editor; optional event selection retains only a local account-scoped draft while navigating. No API write occurs before the final action.
- `/groups/[groupId]/outings/[planId]`: one Edit for night/city; reconsider is separate and only exposed in permitted states.

The former settings/collection modal implementations and duplicate night/city menu entries were removed. The reusable editor captures persisted values/revision, disables unchanged Save, prevents duplicate submissions, keeps failed drafts, requires server-provided impact confirmation, and does not navigate or reopen a surface after being closed during a request. Actual successful server writes still reconcile normally.

## Checks actually executed

`apps/pulse-app/scripts/groups-settings.browser.cjs` passed in headless Chrome against the local Next server on 8084, with isolated API fixtures. It navigated the actual routes and exercised:

- owner/member controls, accepted versus pending labels, rename failure/retry, invitation and cancellation, mute reconciliation;
- empty collections, retryable history failure and scoped collection403 without incorrectly revoking membership;
- unchanged Save, cancel/reopen, 18→25 same-ID edit, exact authorization-error display with retained draft, and close-before-ack lifecycle;
- eligible event loading without text, canonical Bucharest spelling, local 01:00 inclusion and next 06:00 exclusion, valid empty and failed requests, retries, explicit optional selection;
- 35 outings through 20+15 cursor pages and 65 shared events through 50+15 pages, retaining the viewport;
- list→outing→Back scroll restoration; a measured failure was fixed by preventing Next's default Back-link scroll reset. Narrow comparison: list 2873px → detail 0px → returned list 2873px;
- incoming message while reading history does not move the reader; a deliberate own send moves to that sent message without a false New messages control;
- multiline composer grows to a responsive 132–220px cap, then scrolls internally;
- approved chat header/composer geometry before/after administration, and 320/390/1024px widths with enlarged root text.

`apps/pulse-app/scripts/groups.browser.cjs` also passed after updating its navigation assertions to the new canonical pages. This includes the full event→share→known outing→friend-only free registration→second outing journey, private QR views, membership invitation, response reconciliation/failure, destination impact/conflict, and virtual message cursor anchor.

Next TypeScript `tsc --noEmit` passed. TypeSpec compilation and OpenAPI client generation passed after exposing the optional server-owned `FriendGroup.activityAt` timestamp. No local timestamp or unrelated sequence is used to rank conversations.

## Captures inspected

Actual local browser captures are under `apps/spottr-native/artifacts/`, including `groups-next-settings-info-owner`, `invite`, `picker-page`, `context-failure-draft`, `outings-empty`, `info-width-320`, `rename-width-320`, `composer-grown`, and the approved-chat before/after captures. These are functional fixture data, never placeholder content shipped to the product.

## Limits

These frontend checks used isolated fixtures and actual local browser navigation, not a physical iPhone or live production accounts. Native keyboard gestures/Liquid Glass were not claimed as tested here. The local preview fell back from unavailable Google font downloads; pixel-perfect production font rendering was not asserted. Backend authorization, activity privacy and persistence checks are owned and reported separately by the backend agent. No server deploy, production migration, production deletion or real Stripe charge was performed.
