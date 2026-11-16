# Groups 22:08 correction audit — 15 November 2026

Scope: `Spottr_2208_Corectii_Card_Foto_Scroll_Codex_RO.md`, applied over the existing permanent-groups implementation. This note records the independent native-product browser review. It does not replace the separate API/Next reports or physical-device verification.

## Reference and reproduction before changes

Read the complete brief and decoded the complete 99.3-second, 512 × 1112 reference recording into 16 timestamped frames. The review artefact is `apps/spottr-native/artifacts/chat-2208-reference-contact-sheet.png`; its JSON records source metadata and frame times.

At approximately 72.75 s and 99.20 s, the recording shows the conversation header, pinned summary and composer around a large grey area without readable message content. This is a visual observation. The recording alone does not identify a list offset, layout measurement, failed image or data-loss cause.

The browser baseline used actual React Native Web navigation on the existing agent Expo server, `http://localhost:8083`, with isolated synthetic API responses. No account messages, QR codes, payment information or production writes were used.

`browser-chat-return-audit.cjs` completed **30 checks** before product edits, with **zero runtime errors**:

- Five consecutive chat → event selector → Back cycles retained visible messages and the latest offset.
- An actual selector share submitted one request and produced one message. The message and its timestamp remained above the composer.
- A history anchor survived selector Back at 390 × 844 and 390 × 520. Own sharing from history returned to the newly shared content.
- Empty, one-message and five-short-message conversations had no artificial scroll range after Back.
- Delayed images, failed images and a white text-heavy poster kept the same list geometry and offset.

Selected baseline measurements, in browser CSS pixels:

| Scenario | List viewport | Offset | Scroll range | Visible message rows | Latest bottom / composer top |
| --- | ---: | ---: | ---: | ---: | --- |
| Chat with event cards | 652 | 0 | 218 | 3 | 768 / 776 |
| Same chat while selector covers it | 0 | 0 | 0 | 0 | Hidden route has zero rectangles |
| Back from selector, repeated five times | 652 | 0 | 218 | 3 | 768 / 776 |
| After sharing from selector | 652 | 0 | 415 | 3 | 768 / 776 |
| History before selector, full height | 652 | 500 | 2546 | 7 | Reading history |
| History after Back, full height | 652 | 500 | 2554 | 7 | Same visible anchor |
| History before selector, reduced height | 328 | 500 | 1760 | 4 | Reading history |
| After own share, reduced height | 328 | 0 | 1937 | 3 | 444 / 452 |

The hidden route remained mounted in the browser, but its measured geometry became zero. This identifies a lifecycle condition to handle; it does not establish that the iPhone followed the same layout sequence.

The iPhone inspector endpoint at `localhost:8081/json/list` returned `[]`, including after the user reported opening the conversation. No phone inspector capture was obtained. The user's Expo server was not stopped, restarted or changed.

Baseline artefacts:

- `apps/spottr-native/artifacts/chat-return-before-results.json`
- `apps/spottr-native/artifacts/chat-return-before-cards-before.png`
- `apps/spottr-native/artifacts/chat-return-before-cards-shared-event.png`
- `apps/spottr-native/artifacts/chat-return-before-recording/continuous-browser.webm`
- `apps/spottr-native/artifacts/chat-return-before-recording/frames.json`

The video replays 293 captured Chrome frames at their recorded timestamps. It is a continuous browser route recording, not a native iPhone performance or interactive swipe test.

## Verification after changes

The following checks were actually executed against the existing Expo preview on port 8083. Ports 8081 and 8082 were not restarted or changed.

| Harness | Final result | Scope |
| --- | --- | --- |
| `browser-chat-return-audit.cjs` | 33 checks, zero runtime errors | Five selector/Back cycles, actual share, full/reduced viewport history, empty and short chats, image loading/error/poster geometry, post-share height stability |
| `browser-chat-card-date.cjs` | 82 behavior checks plus a passing zero-runtime-errors assertion | Own/received shared events and invitations, comparison cards, 390/320 widths, direct answers, failed request/retry, cover navigation, enlarged text, neutral fallback, immediate date selection |
| Same card harness, `CARD_AUDIT_KINDS=shared-own,shared-received`, phase `shared-final` | 28 checks, zero runtime errors | Targeted final verification of the 44 px shared-event action, both widths, long text and fallback |
| `browser-chat-history-menu.cjs` | 16 checks, zero runtime errors | Historical grouping, chronology/authors, sheet-to-detail dismissal, stable pinned outing, anchored one-action menu, outside/Escape dismissal |
| `browser-chat-return-api.cjs` | 22 checks, zero runtime errors | Actual local Go/PostgreSQL handlers, two synthetic authenticated actors, share/return/proposal/attendance separation |

The main card/date results JSON contains 82 behavior assertions and `errors: []`; the console's final count is 83 because that version wrote the result just before appending its successful runtime assertion. The harness now writes the complete list after that assertion. No failed run has been counted as a passing run.

### Return lifecycle and the reported growing shared-event card

Five consecutive returns retained visible content and a latest offset of zero. The chat remained mounted once throughout the selector/Back cycles. Its hidden geometry became zero while covered and recovered on return. Own sharing produced exactly one new row and returned to the latest content; reading history preserved the same visible anchor after Back.

Selected final browser measurements before the last 1 px action-target adjustment:

| Scenario | Viewport | Offset | Scroll range | Latest bottom / composer top |
| --- | ---: | ---: | ---: | --- |
| Chat with cards | 652 | 0 | 484 | 768 / 776 |
| Each of five returns | 652 | 0 | 484 | 768 / 776 |
| Actual share, immediately and after 1.8 s | 652 | 0 | 784 | 768 / 776 |
| History, full-height return | 652 | 500 | 2546 | Same visible history anchor |
| History, reduced-height return | 328 | 500 | 1752 | Same visible history anchor |
| Own share, reduced-height viewport | 328 | 0 | 2046 | 444 / 452 |

The reduced-history list's measured range changed by 8 px as its virtualized footer settled, while the visible message anchor and offset remained stable. Empty, one-message and five-short-message conversations retained zero artificial scroll range.

The user clarified that the growing card is the plain message sent with **Send an event**, not the outing invitation. That exact path was tested in both the fixture and real-handler harnesses. With the final action target, an own shared-event row measured **301.33 px** high at 390 px viewport width and **279.66 px** at 320 px. Its photo remained **332 × 138.33** or **280 × 116.66**, respectively. A received row adds a 32 px author line. The final card remains aligned above the composer.

Delayed photos, failed photos and a white text-heavy poster retained their allocated cover geometry. Failed/missing media displayed a neutral surface. The wide cover itself does not use the image's intrinsic height.

**Continuous upward growth was not reproduced in RN Web. This is not physical-device acceptance of the user's iPhone report.** The read-only iPhone inspector endpoint continued to return `[]`, so no UIKit offsets, native layout callbacks or on-device image dimensions were obtained. The video and browser evidence cannot establish the original iPhone cause by themselves. The separate native report records the implementation changes and Yoga regression checks.

### Card interactions and working dates

Shared-event photos open their event detail route; invitation/comparison photos open the existing outing. Direct responses and retry remain inside the conversation. The server-confirmed answer remains selected after a failed change.

Review found a real 320 px invitation defect: adding the selected status icon wrapped the label and increased the row by 20 px. The implementation now reserves the status slot. Rechecks confirmed identical cold/selected/error/retry heights and response targets of at least 44 px. The plain shared-event action was separately increased from 43 to 44 px and rechecked.

A 35% CSS text enlargement and a long event title were checked at 320 px, without horizontal overflow. This is a web layout stress test, not a claim that iOS Dynamic Type was tested. Screenshots were inspected for own/received events, failed responses, long text, neutral images and the real-handler conversation.

The form's highlighted working day and the event-selector `nightDate` request matched after a tap and after a real browser horizontal wheel event followed by immediate navigation. The second case crossed into a later month. No arbitrary delay was added to allow selection to settle. These tests do not exercise Apple's physical date wheel or its haptics.

### History and compact menu

Three adjacent obsolete snapshots of one outing rendered one compact update group. The history sheet retained all three entries in chronological order with their individual authors and timestamps. An ordinary message between updates prevented grouping across it. Opening a historical entry dismissed the sheet before navigating to the existing outing and did not change the nearest eligible pinned outing.

Review also found a real fallback-menu sizing issue: the two-line **Reconsider destination** action was constrained to a 60 px surface and acquired an internal scrollbar. After the intrinsic-height correction it measured **229 × 80 px**, with **0 px internal overflow**, anchored below the trigger and inside the viewport. Backdrop and Escape dismissed it without a mutation or navigation. This tests the browser fallback; native Apple menu rendering was not exercised here.

### Actual local API path

The real-handler run used a fresh isolated group on `127.0.0.1:8086`, backed by the synthetic PostgreSQL fixture on port 55436. Only authentication bootstrap used fixture actors; group, message, proposal and attendance requests used the production handlers and database.

- Both actors could see the same stored shared event.
- Sending an event created exactly one message and **no outing**.
- An explicit proposal created the chosen destination without automatically marking either actor as coming.
- A member's direct response changed only that member; the creator observed it after reload.
- No ticket booking/purchase request was triggered by sharing, proposing or attendance.

The API/DB fixture owner shut down only these isolated services after both native-web and Next QA completed. No production data, deployed server or Stripe payment was used.

### Harness corrections and limitations

The successful runs followed corrections to the QA harness itself: targeting the actual nested Propose button rather than its enclosing View, limiting the fallback-image assertion to the cover rather than the author's avatar, and waiting for the history sheet to enter the viewport before clicking an entry. These interruptions are not claimed as product defects.

One browser-video encoding finished writing its file but exceeded the Chrome cleanup timeout. A subsequent read-only process check found no surviving process for that specific temporary QA profile. The encoder warning does not establish an application error. No production/user Chrome process was stopped.

Additional native keyboard gestures, native swipe-back, Liquid Glass rendering and the user's precise growing-card scenario still require an accessible iPhone build for direct measurement. Browser reduced viewport checks are labelled as such throughout the captured metrics.

Final review artefacts:

- `apps/spottr-native/artifacts/chat-return-after-results.json`
- `apps/spottr-native/artifacts/chat-return-after-recording/index.html` — 303 captured browser frames
- `apps/spottr-native/artifacts/chat-card-date-after-results.json`
- `apps/spottr-native/artifacts/chat-card-date-shared-final-results.json`
- `apps/spottr-native/artifacts/chat-card-date-after-recording/index.html` — 26 captured browser frames
- `apps/spottr-native/artifacts/chat-history-menu-after-results.json`
- `apps/spottr-native/artifacts/chat-return-real-api-results.json`
- `apps/spottr-native/artifacts/chat-return-real-api-creator-shared.png`
- `apps/spottr-native/artifacts/chat-history-menu-after-one-action-menu.png`

The recordings replay actual captured Chrome frames at their timestamps. They are not measurements of native animation frame rate.

## Follow-up: associated shared event with “Open outing”

The later iPhone screenshot identifies a plain shared-event message whose action is **Open outing**, with a choosing-destination outing pinned above it. The physical screenshot still shows a grey surface extending beyond the screen. Its cause cannot be determined from the screenshot, and this browser audit does **not** claim that the native drawing fault has been reproduced or conclusively fixed.

Code inspection confirmed that the former ghost `ActionButton` still inserted an iOS `GlassView` with `glassEffectStyle="none"`, plus a flexible inner control. The installed Swift implementation reparents children into `UIVisualEffectView.contentView`; ordinary Yoga nodes do not simulate that UIKit rendering path. It has no intrinsic-size override, so this inspection does not prove that `flexGrow` caused the growing surface. The scoped product change replaces only that plain shared-card action with the existing `OutingPressable`, preserving its label, navigation and 44-point minimum target. Global button materials are untouched.

Executed after this change:

- **3 tests passed** in `group-shared-message-native.test.ts`. These render the actual `FriendGroupScreen` list item and derive the association from an existing choosing-event plan. They verify separate event-preview versus outing-action navigation, no unintended mutation, and full message Yoga geometry at widths 320/390/430 with sent/received and present/missing images. Viewport transitions 652 → 0 → 652 → 328 → 652 do not grow the cell. This tests native layout constraints, not UIKit rendering or native view flattening.
- **44 local browser checks passed**, zero runtime errors, using the actual RN Web routes and synthetic fixtures. At 390 px the sent/received rows measured **301.33 / 333.33 px**; at 320 px, **279.66 / 311.66 px**. Each height remained unchanged after 1.5 seconds and after Open outing → Back. The associated action opened the existing outing without creating another outing, proposal or attendance response. The browser's neutral image fallback was visible in the inspected associated-card screenshot; no successful remote-image loading is claimed for that screenshot.
- The first follow-up browser attempt had an overly broad no-write assertion which included unrelated background writes. It was narrowed to outing/proposal/vote/attendance mutations, and those actual writes are recorded in the passing artifact. This assertion correction is not a product bug.
- Read-only `http://127.0.0.1:8081/json/list` returned `[]`; no iPhone inspector measurement was possible. The user's session was not restarted or changed.

Artifacts: `apps/spottr-native/artifacts/chat-card-date-associated-native-scope-results.json` and the matching `390/320-shared-associated-own/received.png` screenshots. The specific native runaway-grey-surface report remains **pending direct device verification** despite these passing constraints and navigation checks.

