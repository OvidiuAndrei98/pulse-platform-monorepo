# Groups corrections: independent review, 15 November 2026

Scope: the complete 303-line `Spottr_Grupuri_Corectii_15_Nov_Codex.md` addendum; catalog eligibility/error state, context-edit and reuse invariants. This review did not modify the user's 8081/8082 servers, live data, payments, orders, memberships or messages.

## Read-only current API observations

Requests used the existing `http://localhost:8081/api/v1` proxy. They were public requests without an Authorization header. No account token was read, logged or copied. These observations do not claim an authenticated two-session UI comparison.

The unfiltered `/events?page=1` response contained seven published events. Two useful concrete references were:

| Event | Public ID | Canonical city | UTC start | Bucharest local start |
| --- | --- | --- | --- | --- |
| ROOF TOP | `83f191e3-a9ac-468e-bbd3-40708d3a6f9b` | Bucuresti | 2026-11-26 18:00Z | 26 Nov, 20:00 |
| AFTER DARK | `aafb7098-db23-43ac-b91e-2ec6772179e9` | Bucuresti | 2026-11-20 11:29Z | 20 Nov, 13:29 |

Compared requests and results:

- `q=&page=1&city=Bucuresti&startsAfter=2026-11-19T04:00:00.000Z&startsBefore=2026-11-20T04:00:00.000Z`: HTTP 200, four overlapping events. Their starts are 8 Nov, 5 Nov, 30 Oct and 30 Oct. The selected-night start rule correctly excludes all four; they are long-running intervals, not new event occurrences on 19 Nov.
- The corresponding interval for night 20 Nov: HTTP 200, four overlaps, including AFTER DARK. That event starts inside this night.
- The corresponding interval for night 26 Nov: HTTP 200, five overlaps, including ROOF TOP. `matchesPlanningContext` retains ROOF TOP for this night.
- The identical 26 Nov request with `city=București` instead of `Bucuresti`: HTTP 200, `[]`. This confirms an actual canonical-city/diacritics mismatch in the currently running API. Existing code uses exact `e.city = city`; the shared local matcher also originally compared labels without folding diacritics.
- Blank query is accepted and returns results. An unmatched nonempty query returns HTTP 200, `[]`, not a malformed payload.
- Current deployed API ignores the forthcoming `nightDate` parameter: `q=&page=1&city=Bucuresti&nightDate=2026-11-19` returned all seven events. The updated strict-night contract therefore needs the matching API version. No deployment was performed here.

The video does not establish an eligible occurrence missing from night 19. In the current public data, AFTER DARK at 13:29 on 20 Nov correctly belongs to night 20. Do not widen the selected night or include older overlapping events to manufacture a result.

## Confirmed client failure paths before correction

`GroupsStore.catalog()` combined `/events` and `/friends` with `Promise.all`, and stored failure in the general group `error` field. Two isolated executions reproduced:

1. Catalog HTTP 503 set `groups.failed`; an unrelated successful `store.load()` poll then cleared the error to `null`, without a successful catalog request. An empty selector could consequently hide a failed fetch.
2. A successful catalog response with one valid event plus `/friends` HTTP 503 produced zero catalog events and `groups.failed`. Event selection was incorrectly dependent on the friend directory being available.

Other inspected regression risks: old-context rows remaining visible while the next query loads, stale late responses, empty-state checks lacking an independent catalog status, and reuse of successful group creation request IDs.

The surprise-existing-group cause is distinct from membership matching: successful `create()` originally retained `group + JSON.stringify(body)` in its idempotency map. A later intentional identical submission reused the acknowledged request ID, so the server correctly replayed the original group. Retries after an unacknowledged request must keep their key; a new intentional creation after acknowledgement needs a new key. Any explicit existing-group shortcut must separately compare canonical member IDs, including pending invitees, and must require accepted access for the actor.

## Independent regression file

`packages/app-core/tests/groups-corrections.test.ts` covers:

- Romanian city labels/diacritics and cross-surface context matching.
- Selected-night start eligibility at 05:59/06:00 boundaries, after midnight, cross-year dates and the 23/25-hour DST nights.
- Blank search using the canonical night and city.
- Friend-directory failure independent of successful event results.
- Selector failure surviving unrelated group polling.
- Immediate removal of previous-context results and rejection of delayed failures from an earlier request.
- Explicit empty-success/error/retry states with unchanged filters.
- Lost-ack versus acknowledged new group creation request IDs.
- A late old-context plan response unable to overwrite the newly edited outing snapshot.
- Exact accepted/pending membership matching, extra people, duplicate/case-normalized account IDs, and no implicit invitation acceptance.
- Catalog completion during a separate group action and revision guards on choosing a night.

Executed against the corrected implementation: all 15 new regressions passed. The combined run with existing permanent-group privacy and recipient-selection tests passed 36 tests.

Native `tests/group-context-http.test.ts` adds three real transport regressions: structured impact metadata, existing-outing conflict metadata, and keeping unrelated checkout error bodies out of the new metadata. The combined native run with the existing HTTP suite passed 20 tests. The transport/store test sends only context operations, retains the uncommitted state on HTTP 409, and updates it only after a successful response.

## Payment/privacy review boundaries

Context editing must retain the group, conversation and outing IDs, serialize with existing checkout group/plan locks, and invalidate responses to the old material context. It must not update orders, ticket ownership, credential hashes, invoice state or Stripe refunds. Already prepared/paid checkouts continue to use their saved original event and recipient snapshot. Candidate-date availability, personal attendance and current admission must remain separate.

Read-only inspection of `api/internal/outings/context.go` found social/archive updates only, using the same group-to-plan lock order as purchase preparation. The independent local PostgreSQL test `TestPendingGiftFulfillsOriginalEventAfterActualOutingContextEdit` passed: the actual context endpoint kept the outing ID, cleared the incompatible destination, and advanced its round; the complete pending-order JSON stayed unchanged and no unpaid tickets were issued. Fulfillment of the original synthetic successful payment, retried twice after that edit, produced exactly two tickets for the original event and one offer to the originally selected recipient. Both original recipient snapshots retained their original round. No real Stripe call was made.

The backend agent separately reported passing context/eligibility integration tests for permission checks, whole order/invoice and ticket preservation, archived answers and idempotent notifications, context conflicts, title-only edits, compatible proposals, concurrent corrections, strict-night pagination and known public DTO eligibility. Those backend tests are distinct from the independent executions above.

The final migration review also required an exclusive lock before the context-history rollback empty check. The backend agent applied it, reported empty Down/Up passing again, and retained the populated-table archive refusal. This closes the concurrent archive-write gap without changing normal runtime behavior.

Only accepted access may enable group reuse or expose old private state. Pending invitees count toward an exact roster comparison but do not become accepted members; extra people, left/removed members, and identical display names are not interchangeable. Reuse must preserve the existing group's name and conversation draft; sharing an event must be one explicit idempotent action.

## Independent native web navigation and visual review

`apps/spottr-native/tests/browser-groups-corrections.cjs` passed against the agent-owned preview at `http://localhost:8083`, with a new isolated Chrome profile and synthetic intercepted API responses. The user's 8081/8082 sessions were not restarted. This run exercises the real React Native web routing and shared store, rather than isolated component mockups.

An earlier three-button variant exposed a narrow-screen defect: `flex:0` produced zero-height cells and 44px buttons overlapping by 36px. The final requested UI uses the existing single `DashboardDropdown` instead. The final 320px viewport measured a 263.2px outing card, one 231.2 × 44px response trigger and a separate, non-overlapping View outing row. A deliberate web-only 28px/36px label enlargement also remained bounded and increased the trigger height without overlapping navigation. This is reflow coverage, not physical iOS Dynamic Type coverage.

The final browser run passed:

- Answering in the conversation without navigation; opening the outing reflected that answer, and changing it in the detail reflected it back in the conversation.
- Bounded anchored menu placement, Escape restoring trigger focus and outside-click dismissal. An undecided outing did not offer an inapplicable reopen action.
- Editing the existing night without creating another outing or changing its ID.
- Same-night event selection including 01:00 after midnight and excluding exactly 06:00, blank search, explicit blank-success/search-empty states, independent loading failure and retry without changing context.
- Material-context confirmation while the synthetic paid-ticket data remained unchanged.
- Preserving the edited date after a stale-revision response, then explicit refresh before successful save.
- An existing-outing conflict retaining both original outing IDs/dates and navigating only after the explicit Open existing outing action.
- Selecting an optional event inside the new-night form without intermediate writes, then one final eventId-only creation. No ticket/purchase request was made, and the unsent conversation draft survived.
- Selecting another event for an existing night added one proposal to the same outing while preserving the existing chosen event and conversation.
- Immediately opening the optional picker after selecting a date retained that date. The root agent fixed the shared ribbon's queued programmatic/unmounted settle callback, which could previously overwrite the chosen day; the final test does not add a pause between confirmed date selection and opening the picker.
- One-line/multiline composer fields measured 46/112px, respectively. The 44px plus control retained bottom alignment; the 32px Send control stayed 7px inside the field. A deliberately held synthetic request replaced the arrow with a spinner; failure retained the draft, retry delivered it once, and an empty draft hid Send.
- No unexpected runtime console errors. In addition to earlier literal JSX whitespace, exact owner-stack diagnostics identified empty-string `&&` children in `PlanTicketRecipients` and the blank-search `GroupEventChooser` state. Those guards now use booleans; warnings were not filtered out.

I opened and visually inspected the resulting captures for the 320px card, enlarged labels, undecided menu, night editor, context impact, picker failure, selected optional event and one-/multiline composers. They are under `apps/spottr-native/artifacts/groups-native-corrections-*.png` (generated QA artifacts). The latest focused native HTTP run also passed all 20 tests after completing the FriendGroup fixture's required `preview` field.

The final rerun of `apps/spottr-native/tests/browser-permanent-groups.cjs` also passed against the finished source with no runtime errors: actual event entry, atomic create/share, known-event outing, dropdown attendance, friend-only free registration, a second outing in the same conversation, own/incoming QR privacy, blocked offers, draft retention, pending invitations, date/proposal states, history and 320/390/1024px layouts. Booking and transfer responses in this browser run were synthetic; the independent real PostgreSQL fulfillment proof is described separately above.

The shared-input follow-up adds `tests/glass-input-surface.test.ts`: nine focused tests load the real shared input surface, iOS material adapter, group search field, iOS accent accessory and Discover's native glass grouping component, with simulated native APIs. They verify preserving the actual input child, geometry/ref/handlers, default interactive material and explicit opt-out, Reduce Transparency snapshot/live-change/cleanup races, unavailable APIs and matte Android/web fallback, 44px icon-to-input focus wiring, and preventing optical-only props from reaching fallback Pressable. The Send accessory opt-out preserves normal accent buttons and pressed-opacity behavior. The matte material handoff animates only its background layer. Discover retains one input under its material through collapsed/intermediate/expanded states; recomposing parent and child transforms recovers its previous text position and scale across widths 240/320/350/390/728, fractional measured bounds, press states, spring lobes, reversal, interactive and reduced-motion configurations.

The latest focused input/Search/chat run passed 59 tests, including all nine material tests, five chat scroll regressions and four native keyboard adapter tests. Existing Search spring/keyboard tests also passed without changing the established spring constants. These adapter tests verify configuration, projection math and event wiring, not UIKit's appearance or tactile response on hardware.

After those material/scroll changes, the complete browser corrections suite passed again with zero runtime errors. It additionally verified the restored accent-colored search focus border on web and the actual delivered message being visible above the composer after successful retry and multiline shrink. Native touch, optical merging and keyboard inset behavior remain outside that browser result.

No physical iPhone Liquid Glass, Reduce Transparency, keyboard, native touch or camera verification was performed by this independent reviewer. Native material behavior and system menu presentation still require a compatible physical build. No real payment or production mutation was performed.
