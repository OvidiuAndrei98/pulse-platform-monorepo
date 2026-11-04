# Outing redesign — local verification, 3 November 2026

Work resumed at the user's request. Visual approval is still pending.

## Latest user decisions

- Planner members use real profile photos, matching Home; initials only when no photo exists or loading fails. Native shares `SocialPhoto` and uses the existing glass rim when supported. All Next member-stack call sites now pass `avatarUrl`.
- Remove Find friends and Quick Connect QR from Friends. Existing entry points elsewhere remain.
- Proposed-night tiles show a large centered day number, with abbreviated weekday and month centered below, separated by `·`.
- Keep the accepted navbar/Search/material physics outside this redesign.

## Changes completed in this resumed pass

- Consolidated the conflicting Next outing CSS; old structural rules no longer overwrite the newer design.
- Aligned compact gray plan rows, unboxed plan identity, date polls, form fields, ready state and secondary actions across Native and Next.
- Scoped borderless secondary Native actions to outings/Friends rather than altering global button behavior.
- Added composer friend-load retry, clear invalid-meetup copy and finished-night read-only actions. Shared vote counts support both legacy favorites and multi-event reactions.
- Browser QA now verifies rendered profile images, absence of the removed Friends controls, and the actual private event group/message composer.
- Fixed private streamed-page hydration when session loading switches the language before the page hydrates. `useHydratedTranslation` matches the server's English first render, then uses the account language; there is no added loading screen.
- Updated `docs/outings-and-ticket-transfers.md` to describe the current group decisions, privacy, deadlines, Plan B and migration.

## Results

- TypeScript: Native and Next passed.
- Shared core: 106 tests passed, zero failures/skips.
- Native social/safety/date-picker regressions: 29 tests passed.
- Go outings, notifications and safetygroups passed against the existing isolated local `spottr_security_test` PostgreSQL database, including avatar delivery.
- Browser: Native web in English and Next in Romanian passed all flow checks with simulated APIs at widths 320, 390 and 1024. Includes creation, date choice, event reactions, budgets, meetup, arrival, Plan B, transfers, event-night help/wardrobe and private-group messages. No console exceptions in the final runs.
- Architecture: 674 source files passed. `git diff --check` passed.
- Screenshots were visually inspected; artifacts are under `apps/spottr-native/artifacts/outings-*.png`.

## Practical limits

- No signed native build or physical-device verification in this resumed pass.
- No independent reviewer agent was invoked in this pass.
- No cloud writes, deployment, commit or push. New server features/photos require the prepared migration and API release.
- Simulated-avatar artwork is a test fixture only; product UI uses API profile photos.
- User requested a full explanation of the outing-plan flow to consult ChatGPT; supplied with a fictional group example. They have not approved the redesigned screens.

## Follow-up: missing photos in participant circles

Older plan responses do not include member avatarUrl. Member avatars now receive user IDs and resolve a missing URL from the current account, existing friend cache or account-scoped public-profile cache. Repeated circles share the same request. Native still uses Home's photo renderer and glass rim; accounts without a photo retain the fallback.

The browser suite reproduces plans with all member-photo fields omitted and serves fixture images over a local HTTP server. Both Native web and Next display both member photos and request the missing friend's public profile exactly once across repeated plan cards. Native/Next type checks, architecture and diff checks passed. The real iPhone inspector connection could not be opened in this follow-up, so physical-device confirmation remains unverified; no user Metro server was restarted.
