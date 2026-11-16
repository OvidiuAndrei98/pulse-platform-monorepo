# Next.js groups / chat / sheets audit — 15 November 2026

Scope: the current chat/cards/sheets audit brief, on the existing permanent-group product. No navbar, Discover Search, production deployment or production migration changes.

## Implemented

- Short conversations sit above the composer without a fabricated scroll range. Empty conversations have one neutral line; long history stays windowed and incoming messages preserve the reading position.
- One compact horizontal event preview across shared-event and outing messages: 72 × 88 image, maximum 340-wide message body. Direct Yes/No responses remain the same component in chat and outing detail. Historical invitations link to their read-only snapshot context.
- The pinned outing summary is two lines, measured at 56 px. Outing detail has one context editor, one personal response section, one participant/readiness aggregate and a measured fixed ticket footer.
- Proposal support remains independent from the creator's destination decision. Proposal menus only remove proposals; the creator's single destination action opens a short selection-and-confirmation sheet.
- Shared `GroupSheet` uses existing Spottr modal, buttons and typography: X header, content-sized body, fixed action footer, and same-surface discard confirmation. Pending saves cannot be dismissed. Group info separates accepted members from pending invitations; privacy is compact. Friends always exposes See all next to Groups.
- Ticket recipient selection fits one person and scrolls for eight without moving its footer. Totals, service fee and explicit extra-ticket confirmation remain visible. Shared API conflict reasons lead to explicit refresh/review; review does not repeat a purchase. Known own tickets remain accessible when another member's ticket status is unknown.
- The proposal selector's Search field now uses a capsule radius, isolated to the groups component.

## Checks executed

### Build checks

- `node node_modules/typescript/bin/tsc --noEmit --pretty false` in `apps/pulse-app`: passed, including the final label and capsule edits.
- `node --test 'scripts/*.test.cjs'` in `apps/pulse-app`: 136 passed, 0 failed.

### Real local API, two isolated browser identities

`scripts/groups-real-api.browser.cjs`: passed against Next on 8084, an isolated Go HTTP server on 8086, and isolated PostgreSQL on 55436. The account bootstrap supplied test identities/tokens; group, event, vote, free-booking, ticket and transfer requests used actual Go handlers and persisted data.

Executed Friends → chat → outing; independent proposal support/deselection; unauthorized member destination rejection; creator destination confirmation; Yes/No response reconciliation in chat; free registration for buyer and friend; explicit additional free ticket; recipient transfer acceptance and own-ticket access. Buyer-wallet assertions exclude tickets assigned to a friend. Accepting a ticket does not automatically change attendance.

The API fixture and database were stopped by the backend agent after both browser reviewers finished. Paid Stripe collection, production login and an actual iPhone were not part of this test.

### Local browser UI and controlled errors

`scripts/groups-audit.browser.cjs`: passed. Synthetic API responses exercise response failure/retry, unknown ticket status, read-only historical invitations, creator/member menus, accepted/pending sections, same-sheet dirty confirmation, one/eight recipient layouts, explicit checkout-conflict recovery without replay, 320 px width, 500-message windowing and incoming-message scroll anchoring.

`scripts/groups-audit-context.browser.cjs`: passed. Discard does not save the date; a controlled 403 preserves the draft and cannot show success; explicit retry updates the same outing; proposal Search is 999 px radius and filters the list; current Home, Discover and Group info references captured.

`scripts/groups-chat-geometry.browser.cjs`: before/after measurements passed. At 390 × 844, empty and one-message conversations had content height equal to their 707 px viewport and zero page overflow. The single message ends 16 px above the composer. The summary is 56 px, invitation card 200 px, image 72 × 88. A reduced 390 × 500 viewport with a multiline composer and a 320 × 700 layout kept content above the composer without horizontal overflow. This is browser resizing, not proof of physical iOS keyboard behavior.

## Visual artifacts

The shared browser harness saves captures under `apps/spottr-native/artifacts/`:

- `groups-chat-before-{empty,short,cards}.png`
- `groups-chat-after-{empty,short,cards,reduced-viewport,narrow}.png`
- `groups-audit-next-{home-reference,discover-reference,chat-compact,outing-selected,info-final,proposal-search-capsule,proposals-320}.png`
- `groups-audit-next-{destination-sheet,destination-320,dirty-sheet,recipients-1,recipients-8,recover-selection,context-forbidden-preserves-draft,history-read-only,incoming-preserves-history}.png`
- `groups-audit-next-real-*`: the actual API/two-identity navigation and free-ticket sequence.

Visually inspected the Home/Discover references, compact chat, chosen outing, destination sheet, narrow proposals, Info, capsule search and recipient sheets. Google font download was unavailable in this local server, so these screenshots use the same fallback font across all reference and modified pages. They verify composition and geometry, not exact production font rendering or native Liquid Glass.

## Limits

No real paid Stripe charge was submitted. Payment conflict classification and ownership were covered by the backend's isolated tests; browser recovery was exercised with controlled responses. No production JWT login, physical keyboard, device haptics or native glass claim is made here. Older browser scripts describe previous product phases and are not claimed to pass the current UI; the current audit scripts above are the checks executed for this phase.
