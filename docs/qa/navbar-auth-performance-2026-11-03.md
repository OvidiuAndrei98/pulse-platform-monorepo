# Navbar and session performance, 3 November 2026

Status: the performance defect remains unresolved. Broad follow-up experiments
were withdrawn after the user reported sheet-opening jank and measurements did
not establish a material frame-time improvement. The phone is confirmed back on
8081 with the previous navigator. Do not infer iPhone fluidity from functional
tests or treat the uncertain 8085 comparison as evidence.

## Physical-device baseline

Captured in the user's Expo Go session on port 8081, with real logout/login
and rapid tab touches. Only technical durations, route names and a signed-in
boolean were collected, without credentials or account identifiers.

- Idle: 1,200 UI-runtime frames in 10 seconds, maximum interval 8.396 ms.
- Logout with immediate tab switches: 885 frames in 10 seconds, 267 moving
  frames, 36 intervals above 20 ms, maximum interval **230.372 ms**.
- Login coincided with a React render of **142 ms**; the largest React render
  in the whole capture was 150 ms. React render time is a separate metric from
  UI frame time.
- Exactly one interactive `FixedCapsuleTabBar` was mounted on Home.
- Expo Go reported `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS=false`. The existing
  native build configuration requests this flag; JavaScript reload cannot
  change the prebuilt Expo Go binary.

Raw local artifact: `apps/spottr-native/artifacts/navbar-auth-20261103-before.json`.
The probe unsubscribes and restores the DevTools commit hook after three
minutes. Idle sampling showed no frame gaps before the session activity.

## Changes

1. Session changes no longer clear unauthenticated public event, discovery and
   promotion queries. These retain their object references and mounted views.
   Every private/unknown query is still canceled and removed, including tickets,
   orders, saved events, social/profile data, dashboard and admin data. Mutation
   state and previous-account ticket/payment state are still cleared.
2. Home's account-dependent greeting and notification bell subscribe separately;
   the public Home list and Discover header no longer subscribe to account state.
3. The validation-access request in Profile starts only while Profile is focused;
   its UI retains a passive observer for current-account results.
4. Outings, event feed, public profiles, safety groups, wardrobe, orders and
   payment recovery no longer rebuild for the login form's `busy` flag. They
   continue to receive identity, readiness and session-error changes immediately.
5. Browser QA found a cold Tickets/Orders deep link was discarded during initial
   session hydration. Web's consumer Profile stack now keeps its route key;
   native role stacks retain their account-specific reset. Private query cleanup
   and removal of preloaded admin routes remain in place.

Withdrawn experiments: focus-callback substitutions in Friends/Feed/Outings,
Discover toolbar/ribbon memo boundaries and callback changes, the extracted
promotion timer/focus component, and `NavigationRuntime`. Their previous
structure is restored. This rollback does not establish that any one of them
caused the sheet-opening regression. AppSheet and its spring were not modified.

After rollback: TypeScript, web export and 63 focused tests passed (sheet scroll,
gesture handoff, interruption, navbar taps/drag, session query isolation and
keyboard lifecycle). On the connected 8081 iPhone, an actual Home event opened
one SheetContent without ErrorBoundary failure, and Back restored Home with one
interactive navbar. The experimental NavigationRuntime was absent. The user then
confirmed: "Sheetul intra din nou fluid". Navbar performance is still unresolved.

The exported web regression also passed Event/checkout, Friends and Quick Connect
round trips, preserving the original navbar and indicator throughout. Friends
coverage now uses its current Friends-tab action rather than the removed Feed
button. Sheet scroll, gesture handoff, inertia and drag surfaces passed; the
separate `--clicks-only` run passed mouse/touch/keyboard tier and checkout
activation, immediate clicks after short drags and releasing outside the sheet.
That fixture now scrolls covered targets within the sheet (not every ancestor)
and resets scroll to zero before testing a drag-to-dismiss from the top.

No spring constants, indicator position animation, edge impact, gesture
recognizers, navbar geometry, colors, glass material or haptics were changed.
Separately, at the user's request, pickup enlargement now starts only when a
pan activates, rather than when a possible tap begins. Drag enlargement remains.

## Verified

- 126 targeted tests passed: session generations, late private responses, public
  query preservation, private request cancellation, navbar identity/gestures,
  latest rapid selection, social, safety, profiles and wardrobe behavior.
- TypeScript passed.
- After the focus/header changes: 158 targeted tests passed. The final targeted
  Search/navbar suite passed 100 tests, overlapping the earlier set; do not add
  these counts as unique tests. Production web export also succeeded.
- Current Metro browser preview on **8083**, using isolated API/account fixtures:
  admin logout/basic login retains the exact public event DOM nodes, displays
  only the new account's tickets, does not request admin endpoints as that user,
  and preserves repeated Home/Profile, Tickets/History and Back navigation.
- Current preview: cold Tickets, Orders and Saved Events links hide the navbar;
  Back returns to Profile with its navbar selected. This regression failed before
  the web route-key correction and passed afterward.
- User servers on 8081/8082 were not stopped or restarted.
- Current exported bundle: Feed likes/unlikes, error/retry, paging, Friends privacy,
  opening the plan builder and guest auth passed. The fixture now finds the icon
  plan action through its existing accessible label.
- Banner regression passed autoplay/fade, swipe, paused background behavior,
  return rotation, cancelled/slow/identical refresh, hover and reduced motion.
- Search motion regression passed shared geometry, stable input/card layout,
  reversals, focus and reduced motion.
- Physical iPhone: Discover Search reached open, became closed after switching to
  Home, then Home Search opened and Back restored Home. Exactly one source navbar
  remained mounted, disabled under Search and enabled on return. This used
  programmatic native navigation; interactive finger swipe-back was not rerun.

## Physical follow-up

The post-change manual auth capture still showed a first-logout interval of
316.277 ms; repeat login/normal tab activity had intervals around 50–80 ms. The
user explicitly confirmed jank remains after repeated ordinary tab switches.

Controlled sequences invoked the real UI-thread tap callbacks: 12 transitions,
500 ms apart, then settling. A final warm run produced 966 UI callbacks in 8.5 s,
maximum interval 61.563 ms, with 11 gaps above 20 ms. Root React render peaks were
around 44–50 ms in that run. Header/list work was reduced, but these measurements
do not establish a material improvement in UI frame continuity.

The same original travel/edge springs were then animated over one unchanged
Discover page: **900 UI callbacks in 7.5 s, maximum interval 8.368 ms, no gaps**.
This isolates the visible interruption to concurrent navigation/page work rather
than the original spring's standalone scheduling. It does not alone identify
the precise split between React development overhead, Fabric and UIKit mounting.

Local raw captures, all technical data only:
- `artifacts/navbar-auth-20261103-after.json`
- `artifacts/native-tab-work-current.json`
- `artifacts/native-tab-work-runtime-warm.json`
- `artifacts/native-tab-work-isolated.json`

An attached-pages experiment (`detachInactiveScreens=false` on iOS) produced
more frame gaps and was reverted. A memo export experiment for tab icons caused
a Fast Refresh type error; it was reverted and a clean restart was verified.

The inspector helper now explicitly sends Runtime.enable before evaluation.
One isolated test was interrupted because the user left Expo Go, confirmed by
the user; the subsequent complete isolated capture succeeded.

## Optimized JavaScript comparison and native build

An agent-owned Expo Go server ran on **8085** with `--no-dev --minify --lan`.
8084 was occupied by Next, so it was left untouched; the main preview remains
8083. Manifest checks confirmed `dev=false`, `minify=true`, and a correct LAN
bundle hostname. The iOS bundle was warmed on the PC, then the optimized session
was opened through React Native Linking. The user was unsure which session was
tested, so the comparison is inconclusive. The subsequent inspector connection
confirmed the phone on 8081, not 8085. This remains the Expo Go native binary,
not a rebuilt iOS release app.
The unused 8085 server was subsequently stopped; user servers were untouched.

Native build configuration was checked in installed Reanimated's podspec and
Ruby helper: it reads `reanimated.staticFeatureFlags` from the package.json above
the app's Podfile directory. The current app package configures
`IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS=true`; Expo Go reports false at runtime.
No additional experimental backend, Android flag or spring adjustment was enabled.

To separate remaining development/native overhead, compare the optimized session
and then a rebuilt iOS Release binary on the same phone. The repository's existing
`prebuild:ios`/`ios:release` scripts prepare and launch that build on macOS. Verify
the flag in that binary and rerun rapid taps, drag pickup, login/logout, native
back gestures and transformed control hit targets. A native improvement is not
claimed until it is measured; Windows cannot run the Xcode build locally.

References:
- https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/
- https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/
