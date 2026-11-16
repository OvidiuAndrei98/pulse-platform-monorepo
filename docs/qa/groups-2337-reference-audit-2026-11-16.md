# Groups: 23:37 recording audit

## Scope and evidence

Reviewed the complete supplied `ScreenRecording_11-15-2026 23-37-00_1.mp4` (146.3 seconds, 512 × 1112). This is observation of the user's recording, not reproduction against the current local build or a capture of its HTTP requests.

- Complete coverage: `apps/spottr-native/artifacts/group-flow-2337-full/contact-01.png` through `contact-10.png`, 148 frames at one-second intervals, including the final frame. All contact sheets were inspected.
- Focused coverage: `apps/spottr-native/artifacts/group-flow-2337-focused/contact-01.png` through `contact-04.png`, 32 frames around the menu and checkout failures. All contact sheets were inspected.
- Exact timestamps and filenames are in each directory's `frames.json`.
- Reusable extraction tool: `apps/spottr-native/tests/inspect-group-flow-reference.cjs`. It decodes the original local file in Chromium; it does not alter the reference.
- The parent's separate prototype review covers `Spottr_Flow_Unic_Prototip_RO.html`.

No product files, user sessions on 8081/8082, production services, payments, or existing messages were changed for this inspection.

## Recording observations

| Time | Observed behavior | What the evidence does and does not establish |
| --- | --- | --- |
| 02–12 s | Chat and detail show a November 17 outing containing AFTER DARK on November 20. `I'd go` is enabled; it becomes `Try again` and detail displays `This event is no longer available for this night.` | The frontend permits an invalid action. The recording alone does not establish the original API response or why this proposal was retained. |
| 13–24 s | The shared event and the corresponding invitation/proposal each show the full event artwork. POOL PARTY is repeated in two adjacent full cards; one has `Open outing`, the next attendance controls. | Demonstrates duplicated main surfaces for one conversational decision. It is not evidence of duplicate purchases. |
| 25–30 s | Toggling attendance changes the number coming and the ticket summary; the member still has `Has a ticket` when attendance is no. | Attendance and ownership remain separate. The summary counts tickets among attendees, which is easy to misread as the ticket disappearing. |
| 31–39 s | Edit opens with the old November 8 date in its heading but the strip highlights November 15. Later scrolling changes the working draft. | Two visible dates disagree at entry. The source has an explicit clamp of the strip to today while leaving the draft date unchanged. |
| 40–49 s | The editor and impact confirmation open/close. The user chooses `Discard changes` before returning to the original November 8 outing. | This sequence does **not** demonstrate that a confirmed save was refused. |
| 50–56 s | Full event duplicates remain among 11 historical versions; the outings list contains several outings with distinct dates. | The list represents distinct outings, so a future event-card projection must not merge solely by event ID. |
| 59–68 s | The one-action `Cancel invitation` menu has a fixed outer rectangle while its text slides upward, is partly clipped, disappears, then returns. Most clearly 61.5 → 62.5 → 63.5 → 64.0 s. | Strong visual evidence of content movement inside a menu. No removal-confirmation sheet or HTTP evidence is visible, so this is not proof that the server rejected removal. |
| 69–80 s | Privacy explanations, outings, and an empty outing detail are accessible. A brief load label appears over a still-populated outings list. | The recording includes empty and populated states; it does not prove that the temporary loading state caused a navigation error. |
| 84–92 s | Two short messages are sent with the keyboard visible; the group returns to the top of the groups list after activity. | The recording does not show a persistent post-send blank conversation or prove a post-send scroll failure at rest. The activity sort visibly updates. |
| 94–98 s | `I'd go` still retries on the incompatible event. The destination chooser disables that same event and its confirm action. | Different parts of the frontend apply inconsistent eligibility. |
| 101–112 s | The date is changed from November 17 to November 20; the impact confirmation completes; the chosen destination and attendance update. | A completed save is visibly successful here. Choosing a destination does not automatically mark the creator as coming. |
| 118–123 s | One self ticket, `No ticket in Spottr`, 50 RON + 4 RON fee = 54 RON. Checkout reaches review, then at 122.2 s displays `This selection is no longer available. Review the recipients or your existing payment before trying again.` | A real checkout failure is visible. No network payload, bounded reason, Stripe UI, successful payment, or ticket issue is visible; the exact cause remains unproven. |
| 125–133 s | Returning to the same outing reopens the same recipient choice. The conversation still shows a full shared event plus a full attendance card. | The fallback action alone does not explain how to recover the failed selection, and duplicate main cards persist. |
| 136–146 s | Creating a group detects an existing group with the same selected friends and offers `Open existing group` or `Create a separate group`. A new empty group is subsequently created and receives a message. | An explicit separate-group option is visible. This does **not** prove accidental automatic duplication. |

## Source findings at initial inspection

These are findings from the implementation inspected before the current fixes, not assumptions derived solely from the recording.

1. **Invalid preference actions were not gated by the API's `available` flag.** `packages/app-core/src/social/groupPresentation.ts:decisionState` rejected a missing or cancelled option, a chosen destination, and expired/closed context, but did not reject `option.available === false`. Native `EventPreference` uses this function for its disabled state. The destination chooser separately disabled unavailable options. This is a concrete inconsistency corresponding to 02–12 and 94–98 s. The contract agent added the missing guard during this audit; regression execution belongs to that change's report.
2. **Shared-event association was inferred globally by event ID.** `relatedEventOuting` found the first active outing containing the event, regardless of message context or option eligibility. `GroupsScreen` used that inferred association for `Open outing`. One group can have separate outings referencing the same event, so event ID alone cannot establish the reference-message identity. The new contract is to use explicit `outingId` / `referenceMessageId` and preserve independent outings.
3. **One-action iOS menus used a scroll view.** `GroupMenu.native` explicitly sends one-item menus to the fallback; the fallback rendered an unconditional `ScrollView` without disabling bounce. This is a concrete path compatible with the text movement in 59–68 s, but not a proven UIKit root cause. During this audit the parent changed single-item bodies to `View` and disabled bounce for scrollable menus. Physical verification remains separate.
4. **Past editing dates and strip dates differed by construction.** `GroupNightForm` kept the current draft day but set `ribbonDay = day < today ? today : day`. Both appeared on the same editor. A correction must preserve the actual existing context until an explicit replacement, and must not silently save today's date just because the old day is not selectable.
5. **The current historical grouping only folds historical snapshot rows.** `groupConversationRows` does not coalesce a shared event and its current outing card. Updating one persistent reference surface requires a deliberate projection over authoritative message/outing bindings; simply hiding all repeated event IDs would destroy distinctions between separate outings and attribution.
6. **The recorded checkout fallback does not identify its reason.** `PlanTicketRecipients` passes plan ID, decision round, recipient IDs, and optional explicit extra confirmation; `useCheckoutController` retains this snapshot for the purchase request. `outingCheckoutRecovery` supports bounded causes in the current code, but falls back to the exact generic sentence seen in the video when no recognized reason is present. The video cannot establish whether the server version lacked that metadata, the context changed, a previous payment exists, or the payload was invalid. Requests and responses must be captured with synthetic accounts against the current API before assigning cause. No authorization or duplicate-payment check should be removed to make the UI succeed.

## Required follow-up checks for the evolving reference message

- Share once, then propose/choose/respond/withdraw: the original reference ID and original author stay stable; one principal event photograph exists for that bound outing.
- A second outing referencing the same event remains independently addressable; its date, city, round, answers, tickets, and reference ID do not merge with the first.
- A failed action retains the last server-confirmed state; retry is idempotent and does not append another principal card.
- Choosing a destination does not imply attendance or a purchase; withdrawing attendance returns to unanswered, not automatically to `no`.
- Historical update rows preserve chronology and authors, but cannot submit old-context votes.
- Legacy unbound shares are not attached to an arbitrary outing by event ID.
- Returning from selector/detail must preserve the latest or historical chat anchor with short and long content, failed/delayed images, and reduced browser viewport.
- Checkout recovery must use the actual bounded reason and re-fetch relevant state; a confirmed payment remains the only basis for paid ticket issuance.

## Limits

This report contains a complete recording inspection and a source audit. It does not claim a new UIKit/iPhone run, a successful paid Stripe flow, or a current-API reproduction of the recorded checkout failure. The earlier runaway grey shared-event rectangle is not visible in this recording, which does not establish that it is fixed on the physical device. Browser and Yoga tests cannot prove that native material hosts, native menus, or interactive keyboard rendering behave correctly on iOS.

## Executed follow-up validation

- `tests/group-menu-lifecycle.test.ts`: **7 passed**, including the new single-item invitation regression (no nested scroll recognizer) and the multi-action menu's disabled overscroll. Existing tests still verify dispatch after dismissal, cancellation, unmounting, and invalidated permission state.
- The first test command was launched from the repository root, where `tsx` was not resolvable. The corrected command in the native workspace was initially blocked by sandbox `uv_os_get_passwd` / `ENOMEM` before execution; rerunning it with the required local access passed. These startup failures are not counted as product failures.
- `tests/browser-groups-reference-api.cjs`: the final native browser / isolated Go-PostgreSQL run passed **72 checks**, with zero browser runtime errors. The final history-footer correction was then exercised separately by `browser-groups-reference-history.cjs` (**3 checks passed**). Scope, geometry, actual scenarios, limitations and artifacts are recorded in `docs/qa/groups-single-reference-native-browser-2026-11-16.md`.
- The temporary video-audit Chrome profile was checked by its exact profile identifier; no associated Chrome process remained running.
