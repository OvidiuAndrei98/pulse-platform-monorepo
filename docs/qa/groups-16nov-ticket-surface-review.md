# Group tickets and direct responses — independent review

Date: 2026-11-16. Scope: the complete `Spottr_16Nov_Corectii_Bilete_Card_Unic_Raspuns_RO.md`, current native code, installed Gorhom 5.2.14, supplied recording, isolated browser/API tests, and the subsequent photo-overlay/compact-history composition request. No production changes or live charges.

## Reference evidence

The complete 42.866667-second, 512×1112 recording was decoded at one-second intervals plus the final frame (44 samples, three contact sheets). The separately supplied `Spottr_16Nov_Cadre_Verificate.jpg` was also inspected. Artifacts: `apps/spottr-native/artifacts/groups-16nov-reference/`.

Observed sequence, not inferred causes:

- 0–7 s: group opened; Propose a night visited and left; Send an event opened.
- 8–13 s: ROOF TOP shared; Propose used; original card changes to Open outing.
- 14–19 s: outing detail appears, then the chat displays two large event photographs/cards; a personal response is chosen.
- 20–29 s: changing an existing response opens a separate Your response sheet in both chat/detail.
- 31–35 s: ticket drawer has one recipient, a ticket-type dropdown, and a fixed total/Continue footer.
- 36–38 s: the drawer is dragged down while its footer remains at the screen bottom; the moving header/body enters that footer region.
- 39–42.82 s: drawer is dismissed; the outing menu is opened.

The recording alone does not establish which app build, API version or message IDs produced the duplicate posters.

## Independently reproduced footer behavior

`tests/browser-groups-ticket-surface.cjs` navigates the actual RN Web application on agent port8083, with explicitly synthetic API responses. No native touch or UIKit claim.

Before measurements at a390×844 CSS-pixel viewport:

| Scenario | Sheet top at rest | Sheet top during held drag | Continue top at rest | Continue top during drag |
| --- | ---: | ---: | ---: | ---: |
| One eligible recipient |246|306 →376|784|784 →784|
| Eight eligible recipients |101.28|161.28 →231.28|784|784 →784|

The first30px pointer movement activates the gesture without moving the sheet. Subsequent movement displaces the body60px then130px while Continue remains stationary. Both cancelled drags return to the original detent. The short drawer also had16px of scrollable body overflow before changes. Ten before screenshots, detailed rectangles and zero browser runtime errors are recorded in `artifacts/groups-ticket-surface-before.json`.

## Installed-code explanation

Inspected installed `@gorhom/bottom-sheet@5.2.14`, not an assumed API:

- `BottomSheetFooterContainer.tsx` derives local footer position as `max(0, containerHeight - animatedPosition) - footerHeight - handleHeight`, with an additional keyboard adjustment.
- `BottomSheetFooter.tsx` applies `translateY = max(0, derivedPosition - bottomInset)`.
- While the derived position is positive, adding the sheet's own translation cancels the sheet movement. The footer therefore remains screen-bottom aligned as the body descends. Only after the local value reaches zero does it follow the body.
- The library renders its footer beside Spottr's child content. Spottr's bounded `SheetGestureBoundary` clips the body, but does not contain this footer sibling.
- Spottr explicitly sets `enableDynamicSizing={false}` and supplies one measured detent. Merely toggling dynamic sizing or adding a detent would not remove the inverse-position compensation.

The public [v5 footer documentation](https://gorhom.dev/react-native-bottom-sheet/components/bottomsheetfooter) describes a sticky footer and its animated position. The [dynamic-sizing documentation](https://gorhom.dev/react-native-bottom-sheet/dynamic-sizing) confirms that sizing is optional and can be disabled. Neither source proves an app-specific fix; the installed source and browser measurements above do.

Scoped fix reviewed with the native owner: for content-sized action sheets only, put the measured footer in normal layout inside the same bounded/clipped surface as the header and scrolling body. Disable footer-margin compensation for that branch because the footer already occupies real space. Keep the existing library footer behavior for other sheet families. Verify body/Continue movement deltas, long-list access and safe-area accounting after the patch.

## Final footer and drawer verification

The same harness was run after the scoped inline-footer change. It used the same390×844 viewport, synthetic recipient counts and pointer distances. Final measurements:

| Scenario | Surface top at rest | Surface top at drag90 /160 | Continue top at rest | Continue top at drag90 /160 |
| --- | ---: | ---: | ---: | ---: |
| One eligible recipient |348|408 /478|784|844 /914|
| Eight eligible recipients |101.28|161.28 /231.28|784|844 /914|

The footer now moves by exactly the same60px /130px as the surface. Cancelled drags restore the original detent. The one-person drawer is496px high and has no artificial body scroll range. The eight-person drawer is742.72px high; its last row remains reachable. Ten final screenshots and all rectangles are in [the final measurements](../../apps/spottr-native/artifacts/groups-ticket-surface-final.json).

`browser-groups-ticket-matrix.cjs` passed29 synthetic-data checks plus a separate5-check network-failure/retry case. Actual RN Web navigation covered one/eight recipients, single/multiple ticket types, the internal ticket-type page and Back, disabled empty selection, pending invitations, processing access, explicit extra-ticket confirmation, empty types,320px width, long names, increased CSS text size, and reopening a saved draft. A forced503 retained the sheet and selected recipients; Retry recovered it. Both runs reported zero browser runtime errors. These are layout/interaction checks, not proof of UIKit material rendering or native Dynamic Type.

Evidence: [matrix results](../../apps/spottr-native/artifacts/groups-16nov-ticket-matrix-results.json), [error/retry results](../../apps/spottr-native/artifacts/groups-16nov-ticket-matrix-error-results.json).

## Canonical message and direct-response integration

`browser-groups-reference-api.cjs` passed76 checks using the actual app and an isolated Go/PostgreSQL fixture. Each actor had a separate browser session; authentication/bootstrap was synthetic, while groups, outings, messages, permissions and ticket state used the real handlers/database. No production service was used.

Verified paths included share → Propose with the actual `sourceMessageId` request → refetch/reopen; one canonical poster with unchanged original ID, author and time; direct Yes → failed No → Retry → No → withdraw; preference separate from the creator's destination decision; choose/rechoose; context changes; two distinct outings using the same event; and loading a canonical reference older than50 messages without losing history pagination. No payment side effect was created by responding or proposing. Browser runtime errors:0.

Evidence: [canonical/API results and requests](../../apps/spottr-native/artifacts/groups-16nov-real-api-results.json).

## Checkout continuity and real free booking

`browser-groups-ticket-api.cjs` completed27 distinct product checks through actual RN Web navigation against the isolated API:

- A participant who answered No still opened Tickets from the canonical chat card. Opening, dragging or dismissing the drawer created no order.
- A two-person free registration used the real `tickets/book` endpoint. The buyer received their own ticket; the ticket intended for the friend remained a pending assignment until that friend accepted it in their own session. The accepted friend then received access in their own wallet. The pre-existing No response was not silently changed by the purchase.
- A second, separate free event exercised a one-person registration with the exact selected ticket type and recipient.
- A paid two-person selection, including deliberate extra-ticket confirmation, dismissed its sheet before entering Checkout. Tickets → billing → summary → Pay sent the actual purchase request, including both recipients, the outing round, ticket quantity and expected total10800 bani.
- That real purchase endpoint returned503 because this isolated fixture has no Stripe configuration. Its configuration guard executes before recipient/body validation. This demonstrates UI continuity and the correct actual request/error path; it does **not** demonstrate Stripe submission, a charged payment, or paid fulfillment. No live charge was attempted.
- One free-book failure was injected before the API request to verify retry without losing the selected recipients. Real booking after retry returned200.

Evidence: [checkout results, actual requests and limits](../../apps/spottr-native/artifacts/groups-16nov-ticket-api-results.json). The recorded continuous browser segment shows share → Propose → No → Tickets → held drawer drag → dismissal → chat: [open the recording viewer](../../apps/spottr-native/artifacts/groups-16nov-after-recording/index.html). It contains137 browser frames and is not an iPhone screen recording or an FPS measurement.

Harness corrections are retained honestly: an early assertion wrongly counted a ticket awaiting assignment as the buyer's usable ticket; the check now uses `assignedRecipientId`. Another test setup omitted its own request ID and received the expected400. The already acknowledged free booking was resumed for the remaining checks instead of repeated. The final checkout browser process reported `CHROME_DID_NOT_EXIT` during teardown after all checks and zero runtime errors; a read-only process check found no remaining Chrome process for those test profiles. These harness issues are not reported as product defects or silently counted as additional successful purchases.

The API owner then stopped only fixture8086/PostgreSQL55436 and verified that no synthetic actors, groups or events remained. Old fixture UUIDs must not be reused for another run.

## Photo composition and compact history update

The final composition was inspected in eight browser states: incoming/outgoing, bright/dark photograph,320px width, long title, long title with1.4× CSS text size, and missing photograph. The same repository photograph was used; brightness filters are a deliberate stress condition rather than different generated content. The title, date and place stay inside the photograph area over its local gradient; actions are separate below it. Captures were visually inspected, not just measured.

| Case | Viewport width | Photograph height | Footer height | Complete card height |
| --- | ---: | ---: | ---: | ---: |
| Ordinary incoming/outgoing |390|156|50|206|
| Narrow ordinary text |320|156|100|256|
| Long title |320|198|100|298|
| Long title,1.4× browser text |320|284.38|132|416.38|
| Missing image fallback |320|156|100|256|

At320px viewport the card is280px wide: the direct answers retain a full first row and Tickets reflows below them. This intentional100px footer preserves44px targets and full labels. Long or enlarged text grows the photograph area instead of clipping. None of the captured cases showed horizontal overflow or delayed card growth after600ms. These checks do not simulate native Dynamic Type, Liquid Glass rendering or the user's physical runaway-card report.

The final photo/history browser run passed52 checks with zero runtime errors. A synthetic canonical event plus two stored outing snapshots produced one photo card and one line, “Ana QA changed the outing date.” The unchanged snapshot was hidden from the chat but retained in the raw messages. Tapping that same poster opened the outing; its history disclosure displayed both original outing snapshots. No history-sheet or “versions” row remained in the chat.

The history component's regression tests also verify specific, provable changes with each original actor; chronological updates inside an inverted-list cell; no invented changes across missing sequences or different outings; unchanged/anonymous snapshots omitted from chat; no old history-sheet trigger; and an unchanged raw audit trail. Full stored versions belong in the outing-detail disclosure, including no-op snapshots.

Evidence: [photo/history measurements](../../apps/spottr-native/artifacts/groups-16nov-photo-reference-results.json), [history disclosure scrolled into view](../../apps/spottr-native/artifacts/groups-16nov-photo-reference-history-detail-history.png). The latter was a focused5-check recapture of the already tested history path, not five additional scenarios. Targeted tests executed:5 compact-history regressions,3 real reference/tree/native-Yoga geometry regressions,2 event-cover/Yoga tests; all passed. Existing updated drawer/direct-response/navigation regression tests passed in their focused runs as well. The parent agent owns and reports the final full native suite and iOS bundle result; they are not independently claimed here.

## Limits

No physical iPhone gesture test, UIKit screenshot, native keyboard measurement, Liquid Glass visual verification, real Stripe charge or production deployment was performed by this reviewer. Browser screenshots, native-layout calculations, actual local handler/database tests and user-observed device outcomes are distinct evidence categories. The app's prior physical runaway-card issue therefore remains a device-validation limitation even though the tested geometry is bounded.

## Parent-agent final validation

After the final photo-overlay and detail-history changes, the full React Native Node test suite passed **851/851** with no skipped or failed tests. Native TypeScript passed. The iOS Expo export completed successfully (Hermes bundle,4672 modules); this is a local packaging check, not an installed-device test. Logs: `apps/spottr-native/artifacts/groups-16nov-card-suite-final.log` and `groups-16nov-card-ios-export.log`.

The parent also added and executed four focused detail-history tests: bounded20-version rendering with explicit expansion; original actors and isolation between outings; coalesced older-page requests; and completion after unmount. Existing-access recovery remains covered after adding the history entry. Native chat/card/history/access-focused run:36/36 passed. The parent personally inspected the native outgoing/bright/enlarged-text captures and the final Next outgoing/incoming-long/200-percent-text captures.

Next final validation passed TypeScript,136 unit tests, the final photo/history browser matrix and the two-account local-API scenarios. Its original document-overflow symptom was not reproduced at the three tested viewport sizes; the conversation viewport ownership and simulated keyboard resizing passed, including lock release on returning to Friends. This is not a demonstrated Safari-device root cause. See [Next implementation and evidence](../../apps/pulse-app/docs/qa/groups-16nov-next-2026-11-16.md).
