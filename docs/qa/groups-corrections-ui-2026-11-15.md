# Permanent groups: corrections and chat follow-up

This implements the additive `Spottr_Grupuri_Corectii_15_Nov_Codex.md` brief and subsequent user steering. It retains permanent groups and their conversation. It does not restore automatic event chats, change the navbar, or alter Discover's established Search springs, expansion path or keyboard focus timing.

## Implemented experience

- The event selector distinguishes loading, successful empty results, failures and retry. Friend-directory failures do not hide events. Canonical city and selected-night queries agree with the new backend contract.
- An outing's coordinator can edit its night/city in place, with captured revision, explicit impact confirmation, stale-state refresh and an explicit link to a conflicting existing outing. No silent merge or ticket/payment mutation occurs.
- Menus offer actions appropriate to the outing's current state. Native builds use the existing Expo UI menu capability; web and unavailable-module environments use a bounded anchored menu.
- Exact-roster group reuse explains which conversation will open and preserves the existing group name and draft. It does not silently accept pending members.
- Personal availability/attendance uses one compact existing dropdown in conversation and detail, with distinct meaning before and after a destination is chosen. The conversation card has a separate View outing target.
- A new fixed-night outing can select an event before final submission. This makes no intermediate outing or purchase. Selecting another event for an existing night adds a proposal without replacing its chosen destination.
- Incoming text timestamps sit below, outside the message bubble.

## Composer and shared input material

The composer has the plus control outside and a 32px Send accessory inside the field. Send appears only for a nonempty draft; a pending request replaces its arrow with a spinner. Failure retains the draft. Its optical accessory interaction is disabled so it cannot protrude beyond the field; other accent controls retain their normal behavior.

`GlassInputSurface` puts the actual input under the interactive iOS material. It is reusable for subsequent inputs, has matte Android/web/older-iOS fallback and respects Reduce Transparency. The group event-search icon focuses that same field. Web retains a visible container focus border.

The native keyboard adapter uses the installed Keyboard Controller's sticky dock and inverted chat scroll view, with measured composer reservation, a 16pt open-keyboard gap and horizontal gutters following native progress from 24pt to 14pt. Text and icons do not scale. Interactive reversal uses that same keyboard progress.

Discover's real input is now inside its destination material rather than a separate overlay. A background/effect-only handoff preserves the old text visibility timing. Inverse child transforms preserve the prior screen-space text position, baseline, clipping width and scale during the existing spring. The existing morph springs and focus timing were not tuned.

## Sending no longer commands the wrong scroll coordinate

Inspection of the installed RN iOS scroll implementation confirmed that `maintainVisibleContentPosition.autoscrollToTopThreshold` commands raw offset zero after a prepend. In this inverted chat, the latest native position includes the composer/keyboard inset and is negative. Raw zero therefore exposes older content instead of the actual latest message.

The screen retains visible-history anchoring but removes that automatic raw-zero command. Successful own Send, new messages while already at the latest position, and the New Messages action use the current inset-aware latest coordinate. A pending insertion corrects again after content layout; manual history dragging cancels that correction. Failed sends and previous-membership responses do not move the current conversation. Browser latest remains offset zero.

## Verification executed

- All **731 React Native tests passed**, including nine shared-input/material tests, five real-screen chat-scroll wiring tests and four native keyboard adapter tests. These load actual adapters/screen code with simulated native APIs; they are not physical iPhone executions.
- Native TypeScript completed without errors. Architecture checks passed for 713 source files, and all five architecture checker tests passed. `git diff --check` passed.
- The agent-owned Metro server on **8083** compiled the iOS JavaScript bundle: HTTP 200, 4,777 modules, 21,318,654 bytes. This is a bundle/transform check, not an Xcode build or native runtime verification.
- The latest native-web corrections suite passed against the actual app routes on **8083** with isolated intercepted API fixtures and no runtime errors. It covered optional-event creation/reuse, context editing/impact/conflict/stale refresh, selector filtering/retry, 320px/enlarged labels, controlled answers, anchored menus, web search focus and Send pending/failure/retry. The delivered message remained visibly above the composer after multiline shrink.
- The full native-web permanent-group flow passed: event entry, create/share, own/friend registration, second outing in the same conversation, ticket/privacy guards, pending invitations and history.
- Discover browser motion checks passed for stable input/card geometry, focus, rapid reversal and reduced motion. Scene-lifecycle checks passed more than 25 List/Map changes while retaining list offset, map state and one location initialization. These browser checks do not exercise UIKit optical behavior.
- The Next agent completed TypeScript and its browser flow, including the matching contained Send accessory and optional-event/context paths. Shared-core tests passed earlier in this change set. Backend integration and the independent pending-gift fulfillment proof are documented in the linked reports below.

Generated screenshots were reviewed for the response card, menu, editor, impact confirmation, optional event picker and one-/multiline composer. No claim is made of a physical iPhone keyboard, touch, Liquid Glass merging or Android-native visual test. No real Stripe payment was made.

## Remaining external dependencies

No production/staging deployment or real database migration was performed. The currently remote API requires a separately authorized rollout of `nightDate`, the context endpoint and the additive context-history migration. A client reload alone cannot activate these server features. The local isolated PostgreSQL integration tests verify them without changing the real database.

The scroll and UI changes can be loaded through the existing development session; their final physical-device behavior still needs verification. User servers on **8081/8082** were not restarted or replaced.

Related evidence: [backend report](groups-corrections-backend-2026-11-15.md), [independent review](groups-corrections-review-2026-11-15.md).
