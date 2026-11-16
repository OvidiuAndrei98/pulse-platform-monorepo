# Single event reference: native review and browser execution

This review covers the native groups implementation after the 23:37 recording and the single-flow prototype. It complements the full recording inspection in `groups-2337-reference-audit-2026-11-16.md`.

## Environment and honest scope

- The real React Native **web** app ran on the agent's existing `http://localhost:8083` server.
- Group, event, outing, preference, attendance and history requests went to production Go handlers on the isolated `127.0.0.1:8086` fixture backed by local PostgreSQL on 55436.
- Two explicitly synthetic actors used a new test group. Authentication bootstrap and unrelated app endpoints were fixtures. One attendance request was deliberately answered with an injected 503. Fifty-five ordinary synthetic messages were inserted through the real messages endpoint for history coverage.
- Context setup for the two-outing scenario used the real authorized context endpoint and its `confirmImpact` acknowledgement. It did not bypass permissions or change a production database.
- User servers 8081/8082 were not restarted. No deploy, production migration, user-message inspection, or paid Stripe transaction was performed.
- This is **not** an automated UIKit, physical iPhone, Liquid Glass material, or interactive native keyboard verification.

## Executed results

| Verification | Result | Evidence |
| --- | --- | --- |
| Full native Node regression suite, two workers | **836 passed, 0 failed, 0 skipped** | `apps/spottr-native/artifacts/groups-reference-native-suite-final.log` |
| Real native-web navigation → local Go/PostgreSQL | **72 checks passed, 0 runtime errors** | `apps/spottr-native/artifacts/groups-reference-real-api-results.json` |
| Targeted old-reference/history-footer regression after the final shared-store fix | **3 checks passed, 0 runtime errors** | `apps/spottr-native/artifacts/groups-reference-history-results.json` |
| Recovery parser/hook/cancellation suite including blocked popup retry | **10 passed** | `apps/spottr-native/tests/checkout-reservation.test.ts` |

The focused tests are included in the full Node count; they are not additional independent totals. The full browser matrix was run before adding the final terminal-history assertion to the main harness; that assertion was executed in the separate targeted history run. A future run of the main harness now includes it.

The first broad Node run found outdated test doubles for new recovery imports, the former collection-dedup expectation, and untranslated copy keys. Those were corrected; the final full run above passed. Browser attempts initially used `scrollIntoView` on the inverted chat, which moved the test click away from the physical history control. The corrected runs use actual wheel input and verify the clicked control is visible. One earlier Chrome cleanup reported an exit delay; a later exact-profile process inspection found no remaining process and its owned temporary profile was removed safely. The final complete browser run and final targeted run exited successfully.

## Complete real browser path

1. Actor A creates a group and actor B accepts.
2. A opens `+ → Send an event`, selects an actual fixture event and returns to the conversation. Sharing alone creates a message and **no outing**.
3. B presses Propose on A's message. The API binds that original message to the new outing. Its ID, sender and creation timestamp remain unchanged; no member is automatically marked as attending.
4. B answers yes. A's own attendance remains unanswered. The same reference card shows the result.
5. B changes the response while the test injects one 503. The last confirmed yes is retained, the server remains unchanged, and Retry saves no. Explicit withdrawal returns to unanswered.
6. A reloads the conversation and sees the same authoritative reference. Three real picker-open/Back returns preserve that same source cell and bounded layout.
7. B shares another event and explicitly adds its source message to the existing outing. It does not silently replace the chosen destination.
8. B reopens the decision, toggles an event preference on and off, and chooses the alternative through the actual destination sheet. Preference is not attendance or the creator's decision. Choosing does not manufacture any attendance. The old reference becomes compact; the chosen event is the only full photograph.
9. B chooses the original event again. Its original reference expands in place, preserving attribution and identity; the alternative becomes compact.
10. B changes the first outing's context through the real authorized endpoint. Incompatible references show unavailable and expose no voting controls.
11. B shares the same event again and proposes it for its original night. There are now two outings with explicit separate reference IDs and independent state. The first context was deliberately moved because group + night uniqueness otherwise reuses the existing outing.
12. After 55 ordinary messages, the API still returns a real 50-message page with `hasMore`, while separately refreshing explicitly requested older canonical references. Actual wheel scrolling reaches Earlier messages. Pressing it sends a `before` cursor request. The old reference remains one bounded cell with its correct chosen state.
13. In the targeted rerun, consuming that final ordinary history page removes Earlier messages even when targeted older references had created a gap.

No purchase or free-book endpoint was called by sharing, proposing, choosing, answering, withdrawing or navigating history. This verifies the separation from ticketing; it does not claim a successful paid purchase.

## Visual inspection and measured geometry

Personally inspected screenshots from the actual app for unbound share, member proposal, yes, failed response, withdrawal, alternative chosen, original reselected, changed context, two outings using the same event, and the source beyond the latest 50 messages.

At the 390 × 844 browser viewport:

- Full event artwork measured **332 × 138.33 px**, retaining its reserved 2.4:1 ratio.
- The complete reference message cell, including attribution/timestamp spacing, measured **301.33–333.33 px high** across the ten recorded states.
- Document width stayed **390 px**, with no horizontal overflow in those measured states.
- Only one principal photograph existed in the conversation while one outing had a chosen event; alternatives and incompatible references were compact.
- The independently measured old reference surface was **332 × 263.33 px** and appeared once after history refresh.

Representative screenshots:

- `apps/spottr-native/artifacts/groups-reference-real-api-shared-unbound.png`
- `apps/spottr-native/artifacts/groups-reference-real-api-proposed-by-member.png`
- `apps/spottr-native/artifacts/groups-reference-real-api-failed-answer.png`
- `apps/spottr-native/artifacts/groups-reference-real-api-chosen-alternative.png`
- `apps/spottr-native/artifacts/groups-reference-real-api-reselected-original.png`
- `apps/spottr-native/artifacts/groups-reference-real-api-context-invalid-reference.png`
- `apps/spottr-native/artifacts/groups-reference-real-api-same-event-two-outings.png`
- `apps/spottr-native/artifacts/groups-reference-real-api-reference-beyond-latest-50.png`
- `apps/spottr-native/artifacts/groups-reference-history-current-reference.png`

The native component/Yoga regression also exercises the actual shared-reference tree at widths 320/390/430, own/received cells, cover/fallback, and viewport transitions through zero and keyboard-sized heights. It keeps the cover and action bounded and distinguishes the raw-share Event destination from the explicitly bound Outing destination. These checks do not emulate UIKit's material host or prove the previously reported physical-device runaway rectangle is gone.

## Independent review findings resolved during this pass

- **Blocked web popup could freeze recovery.** `preparePaymentBrowser` originally threw before `try/finally`, after setting pending/busy. The parent moved preparation inside the guarded operation. A regression now blocks the first popup, verifies no API/navigation/receipt and cleared busy state, then permits a deliberate successful retry of the existing session.
- **Targeted references could retain an exhausted history footer.** The shared store did not clear its known `oldestMore` flag when a final ordinary page filled a reference-created gap. The contract owner corrected the terminal branch and added a store regression. The targeted browser run confirms the action disappears after the final page.
- **Old collection expectation merged distinct outings by event ID.** The updated collection regression preserves all three source messages, their authors and chronological message identities, including two references to the same event in separate outings.

The recovery review also checked matching requested order IDs, validated provider capabilities/URLs, current account token checks before native presentation or receipt navigation, explicit cancellation after sheet dismissal, and server-confirmed completion before purchase confirmation. Existing tests cover cancellation racing payment completion. Native PaymentSheet and hosted Stripe were mocked in those hook tests; no real Stripe UI was used in this QA pass.

## Remaining verification limits

- The user's recorded endless grey rectangle and native menu bounce require a new physical iPhone/build check; browser and Yoga results alone are insufficient to declare them fixed.
- No new real-device interactive keyboard, native image decode/material-host, or Liquid Glass animation recording was captured.
- Successful paid Stripe processing, real card authentication and live webhook delivery were not exercised here. The contract owner's separate API tests use a local Stripe HTTP double and must be reported with that limitation.
- API authorization/recovery, Next.js behavior and iOS bundling have separate owners and reports. Their results are not silently included in this review's counts.
