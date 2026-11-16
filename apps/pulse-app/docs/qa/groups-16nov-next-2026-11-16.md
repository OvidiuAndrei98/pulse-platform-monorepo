# Next: direct responses, tickets and the single chat card

Date: 16 November 2026. Preview: the existing agent-owned Next server on `localhost:8084`. No deployment, production migration or production data changes. User servers on 8081/8082 were not restarted or stopped.

## Implemented

- The canonical event message keeps its identity, sender and timestamp through proposal, response and purchase. Explicit `sourceMessageId`/outing references remain the association; independent shares are not deduplicated globally.
- Attendance has two compact direct options. Pressing the selected option withdraws the answer through `unanswered`. Rapid taps serialize the latest intent; errors preserve the last acknowledged answer and permit retry. The old answer sheet is removed.
- Tickets opens the common sheet directly from the chat card, including after “Not coming”. Existing own tickets, pending gifts, payment attempts and recoverable checkout reservations retain their existing protected destinations.
- The sheet orders event context, ticket type, recipients and total. Multiple types use an internal view in the same sheet, with Back and X; one type is static. Selection and total survive type changes and X/reopening. Recipient rows are 56px, avatars 34px. The footer stays outside the scrollable body.
- Bulk selection uses eligible accepted members without tickets independently of their attendance response. Pending invitations, pending ticket access, unknown ticket state, capacity, the eight-person limit and explicit extra-ticket confirmation remain enforced.
- Ordinary date/city editing can be dismissed directly without a generic discard dialog. Save remains explicit; server impact/permission checks remain intact.
- Chat cards place date, dominant title and location at the bottom inside a full-width photo with a local gradient. The redundant text body is removed. “Propose outing” has no chevron. A long title or enlarged text can grow the photo; nothing clips the title.
- Noncanonical outing updates no longer render the old full poll/poster. Only concrete changes demonstrated by consecutive snapshots appear as small read-only captions in chat. Generic/anonymous updates are omitted there. The complete loaded audit remains in an expandable detail section, with original author/time, snapshot context and 20-entry presentation pages; older data can be loaded.
- Chat owns its visual viewport and route-scoped document scroll lock, using the existing `useDrawerViewport` lifecycle. The message list scrolls; the header/composer stay inside the viewport. Leaving the chat releases this lock. No global navigation or Discover Search changes were made.

Main implementation files: `DecisionPoll.tsx`, `GroupConversation.tsx`, `GroupEventReference.tsx`, `EventPreview.tsx`, `GroupAudit.tsx`, `GroupOuting.tsx`, `GroupDialogs.tsx`, `GroupSheet.tsx`, `groups.module.css`, `PlanTicketRecipients.tsx`, and the optional Back action in `ModalFrame.tsx`.

## Executed checks

### Static and existing unit checks

- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: passed on the final source.
- `node --test scripts/*.test.cjs`: 136 passed, 0 failed. The last subsequent changes only removed the obsolete chat rendering branch and refined the audit presentation; those were covered by final TypeScript and browser checks.

### Actual local API and PostgreSQL

`scripts/groups-16nov-real.browser.cjs` passed eight scenario checks with two isolated browser identities and the real local Go handlers/database. Authentication bootstrap used test identities, not a production login. The group, message, outing, recipient and free-ticket operations were real HTTP requests against the isolated fixture:

1. Member accepts the group and shares an event; creator proposes it. The original message ID, sender, timestamp and content survive. Retrying and loading a fresh page leave one reference.
2. Yes → No → Unanswered is saved by the API, with no response modal. Chat and detail read the same answer.
3. A second account sees the same source reference and saves an independent answer.
4. A member cannot choose the creator's destination; the real API rejects it.
5. Tickets opens after No. Two selected recipients survive X/reopening; the chat anchor differs by less than 2px.
6. Actual free checkout issues one own ticket and a pending friend transfer. The recipient QR is not exposed before acceptance.
7. Pending gift access blocks repurchase; an additional own ticket requires explicit confirmation and preserves access to the existing ticket.
8. The friend accepts through the actual API and receives their own ticket. Reload/refetch retains one conversation reference after purchase.

Evidence: `.tmp/groups-16nov-real.json`; screenshots `groups-16nov-next-real-*.png` in `apps/spottr-native/artifacts`.

`scripts/groups-16nov-paid-real.browser.cjs` also passed its limited paid-path checks: the actual UI built the checkout, entered billing details and sent `POST /tickets/purchase` to the local Go handler. The emitted body retained the selected type, quantity, own recipient, plan ID, decision round and explicit extra-ticket acknowledgement. The fixture deliberately has no Stripe provider and returned 503; the button left loading and no new ticket was issued.

**Important limit:** that provider-configuration guard runs before body validation. The 503 test does not establish Stripe payment success or server-side validation of that paid payload. Recipient/issuance validation was exercised separately through the actual free-purchase path. No live card charge was attempted. Evidence: `.tmp/groups-16nov-paid-real.json` and `groups-16nov-next-paid-summary.png` / `groups-16nov-next-paid-unavailable.png`.

The API owner subsequently stopped 8086 and the isolated PostgreSQL instance cleanly and removed their synthetic fixtures. No server recovery or deployment was performed.

### Synthetic UI/layout cases

`scripts/groups-16nov.browser.cjs` passed direct response, selected-tap withdrawal, rapid last-intent taps, injected save failure/retry, No → Tickets, internal type selection, selection retention, solo/static type, zero-selection disabled state, eight recipients, pending ticket access, explicit extra tickets, and ordinary context dismissal without saving.

Measured geometry:

- Normal response area: 310px wide, 56.5px high before and after selecting.
- Solo sheet: 358px wide, approximately 532px high, no horizontal overflow.
- Eight-person sheet at a 320px viewport: 288 × 600px; rows 56px; body scrolls while footer remains contained.

`scripts/groups-16nov-visual.browser.cjs` passed on the final source. At a 320px viewport, a 252px-wide own card measured 260px total with a 156px photo. An incoming long-title card measured 287.6px total with a 183.6px photo. Three open/close cycles and answer changes left those exact heights unchanged. At this narrow width, the action footer deliberately wraps. A synthetic 200% text-size stress check grew the long-title photo to 519.2px with no clipped title or horizontal document overflow; this is browser-injected text sizing, not an OS Dynamic Type test.

This final run also checked a pending group invitation is not a recipient, only the concrete city-change caption is visible in chat, and generic plus concrete snapshots remain available in the detail audit. Results: `.tmp/groups-16nov-ui.json` and `.tmp/groups-16nov-visual.json`.

### Chat viewport

`scripts/groups-chat-viewport.browser.cjs` passed at 1280×800, 390×844 and 320×568. `scrollTo(0,500)` did not move the document; only the message list overflowed. A simulated `visualViewport` keyboard resize/offset kept the composer within the viewport. Client navigation to Friends restored the previous document/body overflow styles.

**Reproduction limit:** ordinary document overflow was not reproducible in the initial checks at those three viewport sizes. The scoped containment and simulated keyboard behavior were verified; this does not prove the original physical Safari cause, and no physical Safari keyboard test was performed. Evidence: `.tmp/groups-chat-viewport.json` and `groups-16nov-next-chat-viewport-*.png` / `groups-16nov-next-chat-keyboard-*.png`.

## Visual artifacts actually inspected

Before: `groups-16nov-next-before-chat.png`, `groups-16nov-next-before-tickets.png`.

After, under `apps/spottr-native/artifacts`:

- `groups-16nov-next-final-card-own.png`
- `groups-16nov-next-final-card-incoming-long.png`
- `groups-16nov-next-final-card-text-200.png`
- `groups-16nov-next-final-compact-update.png`
- `groups-16nov-next-final-detail-audit.png`
- `groups-16nov-next-after-tickets-multi.png`

Next-specific final photos used the existing red concert fixture; separate bright-photo and 1.4× captures were not performed in this Next run. Native visual testing is reported separately by its owner. No physical iPhone, Android device, production authentication or successful paid Stripe checkout is claimed by this report.
