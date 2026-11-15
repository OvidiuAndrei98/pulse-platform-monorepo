# Friends coherence — independent native browser review

This records the earlier three-choice design phase. The subsequent pasted brief replaces its central availability / Maybe flow with event preference toggles and direct yes/no attendance. These results remain evidence of what was executed at that point; they are not the final acceptance report for the newer direction.

Scope: the full `Spottr_Friends_Coerenta_Si_Voturi_Codex.md` brief. Tests used the actual React Native Web application and navigation on agent-owned `localhost:8083`. User sessions on 8081/8082 were not restarted. No deployment or changes to production data.

## Executed suites

### Synthetic API, actual application UI

`apps/spottr-native/tests/browser-friends-coherence.cjs` — final full run passed.

- Captured the existing implementation before product edits: Friends, groups list, incoming/outgoing conversation, shared event, poll, confirmed/undecided outing, Group info and selector. Captured the same local fixture data after implementation.
- Exercised the three direct choices. During a held request, all responses were disabled, no unconfirmed selection was shown, and repeated input caused only one write.
- Rejected a response, retained the previous canonical selection, displayed exactly one contextual error, retried through its actual UI control and reconciled chat/detail.
- Reloaded separate documents under two distinct synthetic actors. Their own responses remained independent, while eligibility/results reflected both.
- Saved preferences for two proposed events independently. A group member could not select the destination; the outing creator's explicit confirmation did. That action did not manufacture attendance or payment.
- Eight proposals initially rendered three compact event previews/polls. Expanding exposed all eight and made no API mutation.
- Pending invitations were separated from accepted eligibility. Pending people could not see the conversation. Ticket ownership remained distinct from attendance. Ended outings exposed read-only results and no purchase action.
- Edited the context through the real date editor and impact confirmation. Affected responses cleared; the original message retained its old context and offered no controls for voting on the new question.
- Exercised distinct empty catalog and network-error states, followed by successful retry with the eligible same-night events. An event on another night stayed excluded.
- Checked 320 px layouts, 135% browser text enlargement, long text, incoming timestamps outside/below the bubble, and missing-image fallback. Response targets remained at least 44 px high and inside the viewport.
- Captured Home and Discover with the same events for visual comparison. The shared black surfaces, gray grouping, magenta selection, typography and photography were reviewed directly, not inferred solely from source.

Fixture snapshots are recorded at message creation. A later parser change required adding `title` to the fixture snapshot, after which the full suite passed. Historical messages were not relabelled with a later plan context.

### Production Go handlers with isolated PostgreSQL

`apps/spottr-native/tests/browser-friends-coherence-api.cjs` — passed. The server was restricted to `127.0.0.1:8086`, using the isolated test database. Test-only bearer actors replace authentication bootstrap; real production group, outing, event and friend handlers handle all corresponding reads/writes. Unrelated app bootstrap is stubbed. This is not a staging or production login test.

Actual UI actions and canonical API/DB reads verified:

1. Create a new, separate native-QA group with two invitations. No outing is silently created.
2. Open the second actor's pending invitation. The conversation is hidden. Accept the invitation and gain access.
3. Share an event from the real isolated catalog. The group still has no outing until the explicit event action is used.
4. Create the known-event outing, then answer directly. The creator's pre-existing ticket did not pre-confirm attendance, and answering did not change ticket ownership.
5. The member answers from chat, opens detail and sees their same saved answer. Reloading as creator preserves the creator's distinct answer and both results. The third pending actor is excluded from the eligible count and cannot see the conversation.
6. Share another event for the same night. It becomes an alternative in the existing outing, without creating a second group/outing or replacing the chosen event.
7. Route widths were measured at 320, 390 and 1024 px, with no document horizontal overflow. No checkout or payment was initiated by response actions.

Machine-readable result and route measurements: `apps/spottr-native/artifacts/friends-coherence-real-api-results.json`.

## Review findings addressed during implementation

- Large stacked proposal posters were replaced with compact previews and explicit expansion after three proposals.
- The duplicate global error accompanying a failed poll response was replaced by one contextual error. A final browser assertion checks this.
- Pending invitation counts now use group membership, since real outing members contain accepted people only.
- The header's literal question-mark separator was corrected to the existing middle-dot convention.

The focused eight-long-member-name check exposed a very tall automatic group title in Group info at 320 px. This was corrected to three lines, retaining full identities in the member list and accessible label. The targeted rerun passed the height assertion and captured the corrected layout. A further targeted scenario passed for an older existing outing outside the initial page: the real UI reused the returned outing and added the alternative once, without changing the chosen event or creating a duplicate.

## Visual evidence

- `apps/spottr-native/artifacts/friends-coherence-before-*.png`
- `apps/spottr-native/artifacts/friends-coherence-after-*.png`
- `apps/spottr-native/artifacts/friends-coherence-real-api-*.png`
- `friends-coherence-after-reference-home.png` and `friends-coherence-after-reference-discover.png` are comparison references from the same app and synthetic events.
- `friends-coherence-reference-contact.png` samples the supplied 55-second reference video across its full duration. It shows the earlier Friends activity composition and scrolling; it was not used to claim a functional root cause.

## Limits

No physical iPhone/Android interaction, native Liquid Glass material or UIKit Dynamic Type was verified by this browser review. Browser enlarged text is labelled accordingly. Real Stripe payment, ticket issuance/transfer and scanner validation were not exercised by these new browser suites; existing ticket/backend tests are reported separately by their owners. The absence of production deployment means updated UI/API/migration publication remains a separate step.

Two intermediate browser runs hit blank-document waits during concurrent local build work; their cause was not established. The affected routes subsequently passed with longer waits. Another failed assertion assumed the creator had no ticket, whereas the isolated backend intentionally seeds one; this was corrected to compare ownership before/after answering.
