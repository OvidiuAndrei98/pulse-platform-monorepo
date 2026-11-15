# Independent group settings and sheets review — 15 November 2026

Scope: `Spottr_Grupuri_UX_Setari_Sheeturi_15_Nov_Codex.md`, read in full. This review exercised the existing agent-owned Expo web preview on `localhost:8083`. Browser fetches were replaced with the shared isolated API fixture from `apps/pulse-app/scripts/groups.browser.cjs`; the tests do not make production writes or real payments.

## Actual component tests

The following 29 focused tests passed using the actual TypeScript components with dependency adapters:

- `apps/spottr-native/tests/group-night-editor.test.ts` — 5: persisted initial context, no-op Save, draft-only changes, failed Save retention, late completion after closing/unmount.
- `apps/spottr-native/tests/group-action-sheet.test.ts` — 7: real dismissal boundary, one body with separate safe footer, cancellation, successful completion exactly once, Cancel followed by acknowledgement in the same batch before `active=false` commits, and a queued native dismissal after route unmount.
- `apps/spottr-native/tests/group-info-lifecycle.test.ts` — 5: leave acknowledgement survives the private action being unmounted by revocation, failure preserves membership, Cancel/dismiss/Back/unmount prevent late navigation, closing or lost authority removes Save.
- `apps/spottr-native/tests/group-menu-lifecycle.test.ts` — 5: iOS/web fallback waits for actual Modal dismissal and preserves anchor geometry during exit; Android fallback has no exit animation and dispatches after hidden state commits; cancellation, unmount and permission invalidation discard pending actions.
- `apps/spottr-native/tests/group-collections-projection.test.ts` — 1: repeated event shares keep the newest message/sender and newest-first order.
- `apps/spottr-native/tests/group-free-ticket-navigation.test.ts` — 5: purchaser free registration uses the actual existing account route on web, Android and iOS; friend-only registration opens transfers without the purchaser wallet; a failed registration neither closes nor navigates. The existing 6 account-navigation tests also passed.
- `apps/spottr-native/tests/group-picker-lifecycle.test.ts` — 1: sharing acknowledgement returns only if the picker remains focused and mounted; neither blur nor unmount can trigger late Back navigation.

These are component-adapter checks. They do not assert real UIKit presentation, iPhone keyboard movement or native touch timing.

## Executed browser regressions

`apps/spottr-native/tests/browser-groups-settings.cjs` completed successfully, including:

- Info at 320 px: bounded controls, accepted versus pending counts, no permanent rename input, no new Delete group action.
- Rename: disabled no-op makes zero requests; a 503 preserves typed text and the canonical name; Cancel discards the draft; retry updates the same group and chat header.
- Accepted-member and pending-member access: owner actions are absent; a cancelled leave does not change membership.
- One invite selector excludes existing/pending members; invitation creates a pending member; cancelling a pending invitation names and removes the exact person.
- Muting is consistent between Info and the conversation menu; fallback Escape closes the menu.
- Outings/shared pages show real rows and distinguish success-empty, 503 and section-scoped 403 states.
- Sharing via the canonical event-picker page returns to the source collection, refreshes it and creates neither another group nor another outing.
- Administration transfer removes owner controls. A real acknowledged member leave navigates to Groups despite private child/cache revocation.
- One outing context editor: no-op Save, failed draft retention, Cancel, explicit impact confirmation and unchanged fixture ticket data.
- Picker Change persists the existing outing context before filtering results, then Back returns to that outing.
- Closing and reopening while an earlier context request is held prevents the old failure from appearing in the new editor.
- Optional event selection returns to the existing creation draft with no provisional writes. Final creation contains the event ID and an idempotency request ID; Back does not reopen the submitted draft.
- 35-outing and 65-shared-event cursor pagination; shared rows remain windowed rather than all being rendered.
- Targeted final source-return regression: after loading all 65 shared-event rows, scroll to the oldest row, open its valid fixture event sheet and close it with the app's existing sheet control. A fresh collection-head GET occurs; the oldest loaded row and known pagination end remain present, and source scroll/anchor differ by at most 16 px after settling. This passed after the shared store retained the authorized older tail across focus refresh.

`apps/spottr-native/tests/browser-groups-corrections.cjs` also completed successfully after adapting obsolete menu/footer selectors to the canonical pages. It verified 320 px/enlarged-label response bounds, chat/detail response consistency, separate navigation target, strict 06:00 night boundaries, empty/error/retry, context impact and stale revision refresh, explicit existing-outing conflicts, optional create/reuse without initiating payment, retained drafts, and one-line/multiline Send placement plus held-request failure/retry.

Actual measured composer bounds in that run: one-line surface 46 px; four-line surface 112 px; plus remains bottom-aligned; the 32 px Send stays inset by 7 px. No horizontal overflow was observed in those checks.

## Review findings addressed during implementation

- The installed ExpoUI menu exposes `onCloseMenu` for Android only; it cannot serve as an iOS dismissal callback. Native menu destinations navigate, while fallback modal actions wait for the real dismissal event.
- Fixed-height footer padding was replaced by the installed bottom-sheet footer-height adjustment.
- Context feedback was previously shared across editor lifetimes. Shared store context serials now discard old error/impact/conflict feedback while still reconciling successful canonical server updates.
- The Info leave completion originally belonged to a child removed by successful private revocation. It now belongs to the page and uses focus, lifetime, dialog-generation and synchronous closing guards. Cancelled or abandoned operations cannot navigate later; private state is not retained to keep the child alive.
- A synchronous sheet-closing guard prevents a same-batch Save acknowledgement from winning after Cancel.
- Repeated shared-event rows previously retained an older duplicate sender because Map construction overwrote newest-first entries. Projection now keeps the first/newest entry.
- A collection-head focus refresh previously discarded loaded older pages and could clamp the source scroll offset. The shared store now retains authorized older rows, their tail cursor and an already known end. The actual 65-row event-sheet return regression passed after this correction.
- A new long-draft regression exposed actual RN Web `scrollHeight` feedback that prevented the composer shrinking after deletion. A web-only intrinsic-size adapter now measures and restores the same input synchronously before paint; the iOS/Android component remains a direct existing FormInput re-export. The focused browser regression passed with measured heights 46 → 220 → 46 px, then empty/Send hidden. Bottom alignment, text value and zero horizontal overflow were preserved.
- The full purchase regression exposed a direct `navigate('Tickets')` call after free registration even though web/Android register that account page in the nested Profile navigator. The authorized narrow correction uses the existing `openAccountPage` helper; friend-only transfers retain their original destination. Recipient browser taps now wait for actual stable hit targets and assert each checkbox state before booking, preventing an unsettled sheet touch from changing which people the test purchases for.

## Visual inspection actually performed

Viewed the generated native-web captures for Info at 320 px, failed rename, failed context Save with pinned feedback, and the canonical event picker with real fixture rows. Examples are in `apps/spottr-native/artifacts/`:

- `groups-native-settings-info-owner-320.png`
- `groups-native-settings-rename-failed-draft.png`
- `groups-native-settings-context-failed-draft.png`
- `groups-native-corrections-picker-results.png`

The picker capture shows a single page with Back, context, Change, Search, and eligible 22:00/01:00 event rows. No physical iPhone, native Liquid Glass material, native keyboard or sheet-gesture verification is claimed.

## Final regression status

All four owned browser scripts completed successfully:

- `browser-groups-settings.cjs`: full canonical settings, editor, selector and pagination cases listed above.
- `browser-groups-corrections.cjs`: prior functional/reflow regressions adapted only for obsolete navigation/footer assertions.
- `browser-groups-composer.cjs`: actual short → capped long → short → empty input geometry, same input value and bottom-aligned controls.
- `browser-permanent-groups.cjs`: real event entry → atomic group creation/share → known-event outing → personal attendance → friend-only free registration → private transfer → second outing in the same conversation. Also own QR isolation, incoming transfer acceptance without changing attendance, blocked transfer with owned admission, retained chat draft, failed/successful send, pending membership privacy, date choices, proposal preference versus explicit creator decision, readiness/history, windowed messages, and 320/390/1024 px reflow. The new 30-line draft reaches its bounded height and shrinks again after replacement.

The full purchase run used settled real CDP touches and asserted each recipient checkbox before submission. Its booking request contained only the selected friend, quantity one and the correct outing ID; the buyer wallet remained empty. All payment/API responses in that browser run were isolated fixtures, not real Stripe transactions.

The exact cause of a previously recorded user's Save failure is not inferred from these fixture tests. Actual authenticated local 18-to-25 requests and the restricted remote-check evidence are reported in `docs/qa/group-settings-backend-2026-11-15.md`; that report distinguishes permission, wrong-ID, pending and removed-member outcomes without claiming it diagnosed the recorded request.

A separate optional browser-history diagnostic (`GROUPS_SETTINGS_PAGINATION_ONLY=1` and `GROUPS_SETTINGS_HISTORY_DIAGNOSTIC=1`) initially recorded repeated `/groups/<fixture-id>/` prefixes after cold canonical deep-link initialization and an unhandled RESET on browser Back. Root corrected the relative normalized path supplied to the actual React Navigation parser. The reviewer reran this same browser diagnostic: source URL stayed canonical, Back restored `GroupSharedEvents`, the emitted action was GO_BACK, and there were no RESET warnings. Pagination still passed. The existing `/EventDetails?id=…` suffix while the nested Event is open was not changed. This is browser evidence, not a UIKit Back test.
