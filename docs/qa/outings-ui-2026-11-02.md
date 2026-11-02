# Outings UI review — 2 November 2026

Scope: outing list, empty/loading/error states, invitation, creation form, event proposals, voting, destination confirmation and preparation entry points. Next.js and React Native share pure presentation helpers and Romanian/English resources. Transfer and event-night screens retain their existing layout.

The direction adapts the quiet editorial profile from refero-design to Spottr's existing Inter typography, semantic tokens and Liquid Glass controls. No new palette, font, dependency or image service was added. Project conventions inspected: docs/design-system.md and packages/design-system/tokens.json.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | ModalFrame/AppModal, named controls, form errors, keyboard focus and AX tree in browser-outings.cjs | Named controls and card focus passed; physical screen readers not verified |
| Layout | OutingsPage/OutingsScreen, list/form/detail/error captures at 320, 390 and 1024 px | No horizontal overflow; header action wraps into its own row on phones |
| Writing | Shared outings.ui resources, invitation/validation/confirmation/empty wording | Consistent bilingual labels; recovery actions included |
| Typography | outings.module.css, outingsStyles.ts, outingDate/outingInitials helpers | Existing Inter/type tokens; localized calendar dates; wrapping titles and names |
| Colors | Rendered description foreground and ancestor background, semantic action/status tokens | Sampled secondary text contrast 8.19:1 on both Web and Native-web; remaining colors reuse project tokens |
| UI polish | List cards, date blocks, initial avatars, progress, proposal/vote states, common buttons and dialog | Shared visual roles and surfaces; existing reduced-motion controls retained |

Resolved findings:

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| Medium | Layout | apps/pulse-app/src/features/outings/OutingsPage.tsx | Flat list of full-width action pills | Cards with date, city, membership and plan stage | Distinguishes outings from actions and makes status scannable |
| Medium | Layout | apps/spottr-native/src/outings/PlanDetails.tsx | Long, equally weighted text/actions | Grouped proposal cards, participants panel and preparation before proposals after choosing | Makes the current task visible and reduces repeated instructions |
| Medium | Accessibility | OutingPlanBuilder.tsx and PlanBuilder.tsx | Disabled submit did not explain missing fields | Enabled submit, visible field/group errors and no mutation on invalid input | People can discover what is required |
| Medium | Writing | OutingPlanDetails.tsx and PlanDetails.tsx | One click irreversibly ended voting | Explicit destination confirmation with cancel | Explains the consequence before notifying the group |
| High, fixed during preview | Layout | outings.module.css, listHeader | Narrow header squeezed the create label into several lines | Wrapping header and nonshrinking action | Prevents a repeated mobile comprehension failure |
| Low | UI | outings.module.css, title | Programmatic heading focus showed a browser rectangle | Focus styling suppressed only on the noninteractive tabindex=-1 heading | Interactive controls keep their keyboard indicator |

Validation:

- Core 87 tests, Web 134 tests and Native 633 tests passed; architecture guard passed.
- TypeScript checks, Next production build, Expo Web export and iOS Hermes export passed.
- browser-outings.cjs passed on Web and Native-web in English and Romanian. It covers invalid creation without POST, proposal/vote, confirmation cancel/accept, private invitations, independent transfers and the existing night/pickup flow.
- AX-tree checks found no unnamed buttons, links, inputs or checkboxes in sampled list/form/chosen states. Keyboard focus was checked on the new outing card. Capture tests assert no horizontal overflow at 320/390/1024 px.
- Build/export verification is not a signed installation or a physical iPhone/Android test. VoiceOver, TalkBack, native Dynamic Type, physical keyboard behavior, Liquid Glass compositing, RTL and browser text-only zoom were not verified.
- Independent backend/security reviewer: ACCEPT, 9.3/10; no Critical/High/Medium findings remaining.

Verdict: Approve for the inspected web/Native-web scope. Physical accessibility and native-material checks remain unverified. No deploy was performed.
