# Navbar and account-transition performance, 4 November 2026

## Current outcome

The user reports that the optimized Expo Go session is **much better, but still
stutters slightly**. This issue remains open. Neither the ordinary development
session nor the optimized session establishes iOS Release performance.

The existing indicator springs, geometry, glass material, colors and gesture
physics were preserved. Pickup enlargement remains exclusive to actual dragging.

## Changes in this pass

- Updated Expo to the SDK-recommended 58.0.23 and its recommended dependencies.
  Expo's dependency check reports that dependencies are up to date.
- Shared the system Reduce Motion subscription instead of installing a native
  listener and asynchronous initial read for every animated control.
- Removed the redundant animated press mapper beneath controls whose native
  glass already supplies press feedback.
- Made the profile's ticket reader observe ticket contents rather than storage
  timestamps and fetch metadata. Existing account isolation, admission updates
  and offline persistence remain with their original owners.
- Restricted non-login consumers to the account auth context, excluding the
  login form's temporary busy flag while retaining account and role changes.
- Preserved TanStack Query property tracking in event-list consumers rather than
  spreading and subscribing to every property of the query result.
- Memoized individual Home rail entries so clock updates do not rebuild artwork,
  glass and gesture hierarchies for unchanged events.
- Isolated Discover toolbar focus activity from the glass toolbar's render tree.

## Evidence and its limits

An automated sequence of 18 actual tab callbacks, 140 ms apart, recorded 1,007
UI-runtime frame callbacks in 8.5 seconds. The largest interval was 47.257 ms;
three intervals exceeded 20 ms. This sequence ran after startup and a navigation
check, so it must not be described as a strictly cold run despite the artifact
filename. Frame callbacks do not measure frames actually presented by iOS.

The ordinary session felt better to the user but still stuttered. A separate,
explicitly approved tunnel on agent port 8085 served an iOS bundle with
`dev=false` and `minify=true`; its bundle requests were verified. After opening
its direct Expo Go QR, the user reported a much larger improvement with a small
remaining stutter. This supports development overhead as a contributor, without
proving the cause of the remaining interruption or a final fix.

Earlier auth captures contain different durations and user interaction sequences.
Their maximum React render times are not a controlled before/after benchmark.
The artifact `navbar-auth-20261104-final.json` contains no auth-change sessions
and must not be used to claim successful login/logout measurement.

## Verified

- Native unit suite: **696 passed, 0 failed**.
- Native TypeScript and architecture checks passed.
- Production web export passed.
- Browser checks passed for account switching, private ticket isolation, role
  routing, Search motion, navbar/sheet return, profile tickets and login input.
- Fresh Expo Go startup succeeded. Native programmatic checks covered Discover
  Search blur, Home Search/Back and event-sheet return with one interactive bar.
  Physical interactive swipe-back was not rerun in this pass.
- User-owned servers on 8081 and 8082 were not stopped or restarted by the agent.

## Expo Go reload finding

The inspector helper's React Native `DevSettings.reload()` path triggered the
documented Expo Go 58 AppContext reuse problem: missing ExpoAsset/ExpoFetchModule
after reload. The helper now uses Expo's `reloadAppAsync`. A runtime already in
that invalid state needed a complete Expo Go close/reopen. This is separate
from the unresolved navbar stutter.

## Persistent direct Expo Go QR

`EXPO_NO_REDIRECT_PAGE=1` is saved in this app's ignored `.env.local` and documented
in `.env.sample`. On subsequent starts in Expo Go mode, Expo CLI selects the
native `exp://` QR instead of its browser app chooser. This was verified against
the installed CLI's redirect-page decision. No machine-wide setting was changed.

## Follow-up

Keep the current motion unchanged while investigating remaining page/native
mounting work. Do not claim a new native animation backend, a successful iOS
Release comparison, or a verified 120 presented frames per second. The temporary
8085 comparison tunnel must be stopped when that comparison is finished; it is
not the user's persistent development server.

References:

- https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/
- https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/
- https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations
- https://docs.expo.dev/workflow/development-mode/
- https://github.com/expo/expo/issues/52146
