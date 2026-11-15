# Permanent group settings: backend and shared-state verification

Read the full `Spottr_Grupuri_UX_Setari_Sheeturi_15_Nov_Codex.md`. This report covers the API and shared client state; it does not claim iPhone visual verification or that the exact failed Save in the recording has been identified.

## Evidence and limits

- Allowed read-only GETs through the user's existing 8081 preview returned `403 {"error":"This endpoint is not available in the preview proxy."}` for the canonical group path. The current checked-in preview proxy allows that GET. This is a preview route/configuration refusal, not a group-membership decision. Neither 8081 nor 8082 was restarted.
- An earlier unauthenticated direct staging GET returned 401. Authentication precedes the protected operation, so that response cannot establish whether the deployed context route exists, nor explain the recorded authenticated failure.
- Automatic approval review subsequently rejected an additional remote read-only contract/version check, citing the user's earlier local-testing restriction. No retry, alternative remote route, or indirect agent workaround was used.
- No remote POST, production migration, deployment, real charge or user-account modification was made.

## Real local 18 to 25 requests

`TestGroupSettingsSaveEighteenthToTwentyFifthDistinguishesPermissions` ran the actual authenticated outings HTTP handler against PostgreSQL 18 on loopback 55434 in `spottr_security_test`.

| Actor/request | Actual result |
| --- | --- |
| Accepted outing initiator edits 18 November 2026 to 25 November | 200; the same outing ID and group ID, canonical city, updated saved date |
| Group administrator edits another member's outing | 403 `OUTING_EDIT_FORBIDDEN`; canonical group GET remains 200 |
| Group ID accidentally used as outing ID | 404 `NOT_FOUND`; canonical membership remains 200; saved date unchanged |
| Pending invitation edits an outing | 404; invitation GET exposes pending metadata and no outing history |
| Removed coordinator retries an old outing reference | 404; canonical group GET identifies `GROUP_ACCESS_LOST` |

The test log includes method, path, HTTP status, code, test actor role and the isolated group/outing IDs. It includes no token, QR secret or payment data. These outcomes distinguish policy and wrong-ID cases; they do not retroactively identify which request occurred in the user's recording.

## Changes

- Canonical group GET now reports actual missing membership as `404 GROUP_ACCESS_LOST`. Accepted non-administrators attempting rename/invite/remove/transfer receive `403 GROUP_ADMIN_REQUIRED`. Existing permissions are retained. Coordinator checks and revision/impact requirements remain enforced.
- `GroupsStore` maps precise codes before status fallbacks. A missing operation, preview-proxy denial or coordinator/admin refusal no longer manufactures lost membership. Ambiguous old-server 403/404 responses verify canonical membership; a valid available group list can confirm actual absence. An unavailable verifier does not prove removal.
- Confirmed removal and accepted-to-pending/rejoin changes purge private messages, drafts, collections, cursor/status metadata and old retry keys. Old asynchronous results cannot restore the earlier private history.
- Shared events and outing history have separate per-group status/error records: `collectionStatus`, `collectionError`, `historyStatus`, `historyError`. Errors survive unrelated group polls; successful empty responses differ from loading and failure. Pending invitations do not fetch these private endpoints.
- Superseded list requests refresh under the current authorized membership rather than remain loading or depend on a page remount. Lower outing revisions cannot replace a newer acknowledged saved context.
- Closing/resetting an editor invalidates that editor's feedback generation. A late confirmation/conflict/error cannot appear in the next editor. Real acknowledged updates still reconcile, and actual access loss still purges private state.
- Added shared English/Romanian settings, confirmation, loading-error and empty-state copy in `groupSettingsCopy.ts`; the existing shared translation resources include it.
- Group rows now include authoritative `activityAt`. API ordering and DTOs use the same actor-visible timestamp: pending invitees do not receive conversation activity, and a rejoined member without new visible messages uses their real joining timestamp. Client detail polls and successful sends reorder by actual server activity, including fractional precision; different groups' local sequence numbers are never compared as clocks. Legacy DTOs without the field retain authoritative server-list order and refresh that list after detail activity changes. A delayed older list cannot undo newer acknowledged group metadata.
- A real local catalog control copies the captured ROOF TOP occurrence (26 November, 18:00 UTC). Blank search for 26 November with the display city `București` returns it; selecting 25 November correctly excludes it. This does not diagnose the user's current selected context or claim their deployed catalog is updated.
- Returning to Shared events refreshes only the fetched first-page range while retaining authorized loaded older pages, their actual cursor and a previously known end. Bursts larger than a page retain explicit fillable gaps, including sparse event-only sequence ranges. Outing-history refresh likewise keeps the loaded tail cursor and known end instead of replacing them with the first page's pagination state. Membership changes clear these private coverage/cursor records.

## Checks actually run

- The new isolated database settings tests passed; literal 18-to-25 request/status logs were captured in tool output. Additional real tests cover sent/received group activity, a newer seq 1 above another group's seq 4, rename without artificial activity, pending/rejoin timestamp privacy, and the selected-night catalog control.
- `go test ./internal/outings -count=1` with the isolated database enabled: entire outings suite passed after the activity changes, 13.608 seconds.
- Focused shared groups suites plus three final paging regressions cover the first 50 plus 15 older rows followed by refresh, sparse burst-gap recovery and 65 loaded outings followed by focus refresh. The final complete app-core run passed **all 183 tests**, and `tsc --noEmit` passed. These client state tests use controlled transport responses, independently of the real PostgreSQL handler tests above.
- App-core `tsc --noEmit`: passed after shared-state and feedback-lifecycle changes.
- `git diff --check` on the changed backend/shared files: passed.

No migration was added in this settings pass. The previously implemented context route and context-history schema still require a compatible authorized API rollout; reloading a client cannot install backend code. The precise recorded Save failure and deployed authenticated route/version remain unverified. Visual pages, modal lifecycle and phone interaction verification belong to the frontend work, not this report.
