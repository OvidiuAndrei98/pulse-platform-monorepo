# Group settings, sheets and selectors — 15 November 2026

## Scope and reference evidence

The full `Spottr_Grupuri_UX_Setari_Sheeturi_15_Nov_Codex.md` was read and applied over the previous permanent-group correction work. The attached screen recording was decoded locally: 78.967 seconds, 512 × 1112. A contact sheet sampled the complete recording every two seconds; the visible settings/empty collections, failed date save and misplaced selector context were inspected. The recording alone was not used to assert an HTTP or permission diagnosis.

The later iMessage reference was also decoded locally: `WhatsApp Video 2026-11-15 at 03.06.15.mp4`, 14.737 seconds, 384 × 848, sampled throughout at half-second intervals. It informed multiline input growth, not a new chat design. No personal content from either recording is used in the product or this report.

The approved group-list and conversation appearance, bubble layout and existing materials were retained. The requested exceptions are the removed opaque black composer-row background and the taller bounded multiline field. Navbar code and Discover Search animation were not changed in this settings pass. Earlier uncommitted work in those files predates this pass.

## Canonical native routes and removed surfaces

- `/groups/:groupId/info`: `GroupInfoScreen`, with identity, accepted/pending member counts, member roles, concise management actions, collection links and reconciled notification state.
- `/groups/:groupId/outings`: `GroupCollectionsScreen`, with real compact outing rows, relevant sections, distinct loading/empty/error states and cursor pagination.
- `/groups/:groupId/events`: the same collection screen's shared-event mode. It uses only authorized message history, keeps the newest share when an event repeats, and virtualizes its rows.
- `/groups/:groupId/events/select`: `GroupEventPickerScreen` and the single `EventChooser`. Context and the existing Glass search stay at the top, above a virtualized result list. Blank search loads immediately; proposal, free sharing and uncommitted creation-draft selection remain distinct.
- `/groups/:groupId/outings/new`: `GroupNewOutingScreen`. Optional event selection pushes the selector page and returns to the same date/city draft without an interim write. Successful submission replaces the submitted draft route with the real outing.
- Existing group conversation and outing-detail URLs continue to work. These pages are registered in the actual root and nested event-flow navigators, with existing native Back options.

The old combined settings/rename/member/collection sheet and the chat's outgoing-event picker sheet were removed. The chat ellipsis now contains Group info and the existing mute action. Collection navigation lives in Group info; the existing active-outing summary and plus entry points remain useful. Duplicate Change night/Change city entries and the separate outing proposal sheet were removed. An undecided outing does not expose an empty options menu.

`GroupBack` reuses the original Back implementation. New pages and short surfaces use the existing Text, buttons, avatars, Glass/fallback and AppSheet components; no new modal library was installed.

## Short actions and single context editor

`GroupActionSheet` gives a short action one title, accessible close, one scrolling body and a stable footer. Gorhom's actual measured footer-margin adjustment is enabled, so enlarged footer text/safe areas do not depend on a guessed bottom spacer. Rename/invite/member removal/invitation cancellation/administrator transfer/leave use focused surfaces rather than the old permanent settings form.

`GroupNightSheet` and `GroupNightForm` are the one date/city editor used by outing detail and its selector. The form captures persisted values and revision; unchanged Save is disabled. Draft changes do not mutate the outing. Failed saves retain the draft and show the error by Save in the pinned footer. Stale revisions, impact confirmation and existing-outing conflicts remain explicit. Successful same-ID updates reconcile the detail, conversation summary and collection from the shared store.

Cancel starts real sheet closure. Navigation after success waits for actual dismissal; synchronous closing refs also cover Cancel and a Save acknowledgement arriving before React rerenders. Unmounted/inactive forms cannot navigate or reopen a surface. Shared feedback generations prevent a closed editor's late error/confirmation from contaminating a later editor. A valid acknowledged server write still updates saved data.

The existing iOS system menu remains for navigation and immediate actions; its installed SwiftUI implementation does not expose a dismissal callback, so no nonexistent callback or fixed timer was added. The fallback menu retains anchor geometry through exit and dispatches its selection after real Modal dismissal on iOS/web. Legacy Android fallback has no exit animation and dispatches after the hidden state commits.

Group leave acknowledgement is owned by its page, because successful revocation removes the private child. The same active acknowledged leave can return to Groups; Cancel, Back, another dialog generation, account change or unmount cannot trigger late navigation. Revocation still removes private data immediately. Admin-only actions disappear or become inactive when authority changes.

## Additional user steering

- Removed the solid black rectangle behind the chat composer. Its actual input material, accessory positioning and keyboard-synchronized gutters remain.
- Increased multiline growth from the old 120px cap to a responsive 132–220px maximum, approximately 27% of the viewport, followed by internal scrolling. One-line height stays 44px; plus and Send stay bottom-aligned, and the measured native dock continues reserving the full height.
- A real RN Web test caught the input remaining tall after a long draft was shortened. The browser-only `GroupComposerInput.web` measures intrinsic height before paint, restores the actual input synchronously and retains its text/caret. The native file directly re-exports FormInput. The focused browser run measured 46 → 220 → 46px and then empty with Send hidden.
- Own messages do not manufacture a New Messages indicator while native inset/layout events settle. Incoming messages while reading history remain a distinct case.
- Groups reorder by real server activity, including after sends and focused polls. The backend/shared report describes actor-visible `activityAt`, legacy API list refresh and stale-response guards; timestamps are not fabricated from local sequence numbers.
- Shared-event and outing-history focus refreshes preserve authorized older loaded pages, tail cursors and known pagination ends. The real native-web 65-row source-return test verified the older row and scroll anchor after opening an Event sheet and closing it.
- Cold deep links now pass an absolute normalized path into React Navigation. Its installed web history preserves `route.path`; the former relative path was repeatedly appended to the current group URL and caused an unhandled RESET on browser Back. A focused actual-browser rerun now retains the canonical group URL, emits GO_BACK and restores the shared-event page with no RESET warning. No navbar or Search animation code was involved.
- Free ticket registration uses the existing platform-aware account navigation helper for the buyer's Tickets destination; friend-only registration retains TicketTransfers. Recipient selection and ticket ownership safeguards remain unchanged.

## Executed verification

- Native TypeScript passed.
- The final full native suite passed **763 tests**, including context draft/no-op/error/cancellation, sheet dismissal, same-batch cancellation, Group info leave lifecycle, menu lifecycle, repeated-share projection, keyboard adapter, chat-scroll, free-booking account navigation and actual linking-callback regressions.
- Architecture checker tests passed; the final repository check covered 732 source files. `git diff --check` passed.
- The agent-owned Metro server on 8083 compiled the iOS JavaScript bundle, HTTP 200, 21,390,243 bytes at that check. The final tiny linking correction was subsequently checked by TypeScript, the actual installed parser and the real native-web browser. This is not an Xcode build or hardware interaction test.
- The native-web settings browser suite exercises actual local app routes with intercepted isolated API fixtures. Owner/member/pending controls, rename error/no-op/cancel/success, a single invitation selector, pending cancellation, mute synchronization, collection states, context drafts/impact, close-before-ack and optional-event navigation were checked. The independent reviewer records the final extended runs and captures separately.
- Next's TypeScript, TypeSpec/client generation, complete integrated groups browser suite and new settings suite passed. Its test found and fixed default Back-link scrolling overriding long-list restoration. See its dedicated report for actual measured results.
- The real local PostgreSQL outings suite passed. Accepted coordinator 18→25 returns200 with the same outing/group identity; another group administrator correctly receives403 `OUTING_EDIT_FORBIDDEN`, and canonical membership remains200. Wrong IDs, pending invitations and actual removal are tested separately. All **183 app-core tests**, including the final paging-retention regressions, and app-core typecheck passed.

Actual local screenshots were inspected for owner Info at 320px, the failed date draft, outing rows and the new selector/editor states. These contain isolated test fixture data; no fictional content was added to production UI. Browser focus and simulated/native-adapter keyboard states do not establish actual iPhone keyboard gesture, Liquid Glass, Android-native or enlarged system-text behavior.

## Save diagnosis and remaining external checks

A demonstrated client bug is fixed: unavailable operations and coarse403/404 handling could display lost-group access, or revoke local membership after an admin-only refusal. Precise operation/permission errors and canonical membership verification now distinguish these cases. This does not identify the exact authenticated failing request in the recording.

Additional direct staging verification was rejected by automatic approval review because of the earlier instruction to continue local testing only. It was not retried through another path. The current user's exact runtime Save refusal and selected-night catalog request therefore remain unverified. Local catalog controls return the known ROOF TOP occurrence on26 November and correctly exclude it on25 November; they are not evidence about the user's currently selected night.

No deployment, production migration/deletion, real Stripe charge or user-server restart was performed. User ports8081/8082 were preserved. The previously added context endpoint/history migration and current API changes need a separately authorized compatible backend rollout; a client reload cannot install missing server features.

Further evidence: [backend and permissions](group-settings-backend-2026-11-15.md), [Next route QA](next-groups-settings-2026-11-15.md), and [independent native settings review](groups-settings-independent-review-2026-11-15.md).
