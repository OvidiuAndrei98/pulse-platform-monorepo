# Groups: chat geometry, sheets and integrated browser QA

Date: 15 November 2026. This report covers the current chat/cards/sheets audit, not the earlier three-answer availability design.

## Scope and evidence

The complete `Spottr_Chat_Carduri_Sheeturi_Audit_15_Nov_Codex_RO.md` and the accompanying `0bee3045-4e2a-4563-93b7-bc73e4df4e64/Pasted text.txt` were read. The reference recording `group party/ScreenRecording_11-15-2026 20-44-26_1.mp4` was sampled across its full 116.13-second duration into a 16-frame contact sheet. Its visible compositions were used as evidence of presentation, not as proof of a technical cause.

All browser runs used the actual React Native Web navigation on the agent-owned localhost:8083 preview. The user sessions on 8081/8082 were not stopped or restarted. Layout fixtures were synthetic. A separate integrated run used production Go handlers and PostgreSQL on isolated local ports 8086/55436, with synthetic authentication actors. No production deployment, live migration or live payment was performed.

## Chat investigation and results

The browser baseline did **not** reproduce native short-content overscroll: empty, one-message and three-message conversations already had a zero browser scroll range. This is not evidence that the iOS defect was absent. Source inspection found the native inverted list combined a viewport-filling `flexGrow:1` with composer/keyboard content insets, and initialized at offset zero even though its latest native position is the negative inset. The implementation now measures the real range, removes that forced content height, initializes the negative latest offset and retains the installed keyboard controller and history anchor behavior.

The independent browser harness did reproduce a different defect while reading history: an incoming message displayed the "New messages" action inside the measured composer. Composer height increased from 68 to 111 px, the viewport decreased from 707 to 664 px, and the visible message anchor moved by 43 px. The action is now positioned above the dock without contributing to its height. The final run keeps the anchor at 654 px before and after the incoming message; pagination keeps its anchor at 625 px.

Final `browser-chat-audit.cjs` run: **37 checks passed, zero runtime errors**. Measurements use a 390 × 844 browser viewport; the smaller available viewport is 390 × 520.

| Scenario | Observed result |
| --- | --- |
| Cold empty / one / three short messages | No artificial scroll range; no redundant action below the empty conversation |
| Short content with reduced viewport | Zero range; last message and timestamp remain above composer |
| One / three messages, normal and reduced viewport | Last metadata bottom stays 8 px above composer top |
| One long message | Real overflow remains scrollable; content height 1,722 px |
| 100-message fixture, 50-message first page | Initially 16 message elements mounted; history remains virtualized after pagination |
| Pinned summary plus short content | Summary height 55 px; short content still has zero range |
| Nine-line draft | Input grows to its 220 px bound; composer remains above the last message; deleting shrinks it again |
| Send with draft / delayed response | One request and one stable message; latest metadata remains visible |
| Incoming message while reading history | No jump to latest and no composer-height change; "New messages" returns to latest |
| Older history page | Anchor remains stable; the complete 100-message history is not mounted at once |
| Invitation card | Two direct attendance choices; compact card measured 250 px high in this fixture |

Resizing a Chrome viewport is a test of available layout space. It is **not** a simulated UIKit interactive keyboard gesture. The native keyboard/scroll adapters were additionally exercised by focused unit tests. The user separately confirmed on their physical iPhone in Expo Go that one short message with the keyboard open can no longer be pushed below the input, and that the Apple/Liquid Glass city menu opens and permits selection. These confirmations are user-observed, not automated device results.

## Sheet investigation and results

The first settled layout pass exposed an actual empty bottom gap in short action sheets: at 320 px width, the editor content ended at y=754 and destination content at y=757 in an 844 px viewport. Measurements were taken after 1.55 seconds, so this was not just the opening animation. The rendered Gorhom ancestor retained approximately 90 px of overdrag padding while its measured, column-reversed content used the updated sheet height.

The product fix opts only `GroupActionSheet` into `AppSheet.contentSized`, with detached content and disabled overdrag. Other sheets do not opt in. The subsequent browser run verifies:

| Sheet | Widths | Final measured result |
| --- | --- | --- |
| Edit outing | 320 / 390 | Height 401 px; bottom exactly y=844 |
| Choose destination | 320 / 390 | Height 470 px; bottom exactly y=844 |
| One ticket recipient | 320 / 390 | Heights 616 / 598 px; bottom y=844 |
| Eight recipients with long names | 320 / 390 | Height bounded to 742.7 px; footer remains visible |
| Rename group | 320 / 390 | Height 228 px; bottom y=844 |
| Eight recipients, CSS text enlarged 130% | 320 | No horizontal overflow; fixed CTA remains visible |

The eighth recipient was reached with actual CDP wheel input, hit-tested above the fixed footer and selected with a pointer click at both widths. The final screenshots show that selection and the updated two-ticket total. Normal footer bottom is y=828, leaving 16 px of bottom space. Long member names wrap rather than forcing the sheet wider. The shortened "Without tickets" action fits beside Participants at normal size and wraps below it at enlarged size.

Final `browser-group-sheets-audit.cjs`: **17 layout/interaction observations, zero runtime errors**. The final editor, destination, one-recipient, eighth-recipient and enlarged-text screenshots were opened and visually inspected. The destination bottom assertion was also checked against the recorded final measurements. The enlarged-text case is a CSS stress test, not an iOS Dynamic Type verification.

Source review confirms dirty dismissal is handled in `GroupNightSheet.onDismiss`, so closing by the sheet lifecycle reaches the same discard protection as its X button. The focused tests cover retaining the draft, explicit discard, duplicate dismissal, acknowledgement after cancellation, and queued callbacks after unmount.

## Integrated two-account run with real local handlers

`browser-friends-coherence-api.cjs` completed **nine scenarios** through actual browser routes. Authentication/bootstrap identities were fixtures; membership, groups, messages, outings, event catalog, responses, free registration, transfers and own-ticket reads were handled by the local Go service backed by PostgreSQL.

1. Create one group with pending invitations and no automatic outing; accept the invitation with a second account. Pending members cannot see the conversation.
2. Share an event without creating an outing, then explicitly propose it and persist the known destination.
3. Change personal attendance from chat and detail across reloads. Another person's attendance and existing ticket state remain independent; a third pending invitee is excluded.
4. Share another event on the same night and add it to the existing outing without duplicating the group or silently changing its destination.
5. Support multiple events, deselect one, keep option order stable, and choose a destination as creator without automatically confirming attendance.
6. Register free tickets for self and a friend through the real ticket handlers. The recipient sheet closes before navigation. The friend's ticket appears as a pending transfer, is accepted by that account and opens that account's private QR viewer.
7. Require explicit extra-ticket confirmation before another registration for a person with existing access.
8. Edit the date through the authorized context editor with impact confirmation; keep the same outing/group and reset incompatible destination/responses.
9. Check the resulting routes at 320, 390 and 1024 px with no horizontal overflow.

The stored results group these into nine checks with route captures. The free registration result does **not** validate Stripe PaymentSheet, a paid charge, webhook timing, invoicing or refunds. The subsequent backend-only storage-failure classification fix was tested by the API owner, not exercised by this browser run.

## Focused regression tests

- `group-chat-keyboard.test.ts` and `group-chat-scroll.test.ts`: nine tests covering the installed native driver contract, negative inset, history preservation, send/cancel behavior, multiline reservation and browser behavior.
- `group-action-sheet.test.ts`: nine lifecycle/geometry tests, including dirty close, duplicate completion, cancellation and unmount races.
- `group-context-http.test.ts`: seven tests. Four new cases restrict `OUTING_RECIPIENTS_CHANGED` metadata to purchase/book endpoints and recognized recovery reasons; only `existing_payment` may retain a valid order UUID. Arbitrary Stripe fields, client secrets, email/recipient data, invalid reason values and unrelated error bodies are excluded.
- The checkout controller and final recipient navigation/session-change tests are maintained and reported separately by the native implementation owner.

## Reproduction and artifacts

Run against the existing agent preview; do not start a second server on a user port:

```powershell
$env:CHAT_AUDIT_PHASE = 'final'
node apps/spottr-native/tests/browser-chat-audit.cjs
node apps/spottr-native/tests/browser-group-sheets-audit.cjs
node apps/spottr-native/tests/render-chat-recording.cjs final
```

The real API run additionally requires the isolated fixture server and fresh `api/.tmp/friends-browser-fixture.json`, created by the API test helper. It must never be pointed at a live server.

- `apps/spottr-native/artifacts/chat-audit-final-measurements.json`: all 37 checks and measured chat geometry.
- `apps/spottr-native/artifacts/chat-audit-final-sheets.json`: all 17 sheet/interaction observations and ancestor layout traces.
- `apps/spottr-native/artifacts/friends-coherence-real-api-results.json`: real local handler results and route widths.
- `apps/spottr-native/artifacts/chat-audit-final-*.png`: final chat/card/sheet captures.
- `apps/spottr-native/artifacts/chat-audit-final-recording/index.html` and `continuous-browser.webm`: continuous chat → outing → chat → send browser capture, 47 captured CDP frames replayed at their recorded timestamps. This is not a physical iPhone recording or a device frame-rate benchmark.
- `apps/spottr-native/artifacts/chat-reference-contact-sheet.png`: complete reference-duration sampling.

Intermediate before/failure artifacts are retained as evidence of the investigation. They are not presented as final acceptance. Earlier reports describing the obsolete three-answer availability UI are superseded for the current compositions.

## Remaining verification limits

No automated iOS/Android device rendering, Liquid Glass appearance, native wheel haptics, native keyboard interactive cancel/velocity, screen-reader session or paid Stripe flow was run by this QA agent. Browser fallback layout and local API behavior were exercised; physical behavior remains limited to the user's explicit one-message keyboard and city-menu confirmations. No production service or user data was modified.

## Final native implementation checks

The implementation owner completed the following after the browser audit:

- Full native unit suite: **790 passed, zero failed or skipped**. Command from `apps/spottr-native`: `node --import tsx --test --test-concurrency=2 'tests/*.test.ts'`. Final output is retained in `artifacts/groups-chat-audit-native-tests-final.txt`. The initial full run found one obsolete theme mock in the existing glass-input test; the mock was updated for the shared pill-radius token and the entire suite was rerun successfully.
- Final native `tsc --noEmit`: passed.
- iOS JavaScript export: passed, **4,665 modules and 44 assets**, producing a Hermes bundle. The export is retained in `artifacts/groups-chat-audit-ios-export`. This is a bundling check, not an Xcode build or physical iOS end-to-end test.
- Seven new checkout-controller cases cover refusing repeated submission of an invalid outing selection, own-order recovery, retrying transient service errors with the same idempotency key and ignoring a previous account's delayed error.
- Twelve recipient/navigation cases cover real account routes, explicit additional-ticket confirmation, unknown ownership, closing during registration, unmount/account changes before acknowledgement and refreshing the canonical outing only after dismissal. These cases are included in the 790-test total, not added to it.
- Three iOS city-field adaptor cases cover valid native menu choices, disabled actions and unchanged fallback for Android/web, older iOS, reduced transparency or missing ExpoUI. The city selector uses the already installed Apple menu and existing Spottr Glass surface; no new native dependency was installed.

The last user requests are implemented: the proposal selector Search is a capsule in native/web and Next; the city field in the shared native create/edit form uses Liquid Glass and Apple's menu on supported iPhones while Android retains its existing dropdown. The user explicitly confirmed in Expo Go that the city menu opens and permits selection. Earlier, the user confirmed a single message cannot be pushed under the composer with the keyboard open. These are user-observed device checks, distinct from the automated browser evidence.

The navbar and Discover Search animation were not modified. The only root-route change passes historical-message context to the existing outing screen. The `contentSized` sheet option is enabled only by the groups action-sheet adapter; other sheets retain their previous configuration.

Related reports: [backend/shared and real HTTP verification](groups-chat-audit-backend-2026-11-15.md), [Next implementation and QA](../../apps/pulse-app/docs/qa/groups-chat-audit-2026-11-15.md).

No new migration is required by this pass. Detailed checkout recovery reasons require the updated API when deployed; older API responses retain a generic selection-review fallback. No deployment or remote migration was performed. Paid Stripe completion, external invoice issuance and a full physical-device gesture/keyboard matrix remain unverified.
