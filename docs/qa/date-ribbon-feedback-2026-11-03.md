# Discover date feedback

The shared Discover ribbon serves both List and Map. The user reported missing
and delayed feedback, including slow scrolling. A stronger Rigid impact was
rejected as too strong, and the user confirmed that synchronization remained
incorrect on the physical Expo Go phone. Do not claim that the Expo Go timing
issue is resolved.

Current JavaScript fallback uses a Light native impact, with no timer, rate
limiter, promise serialization or catch-up queue. Direct day taps trigger once;
their programmatic alignment remains silent. A batched scroll event triggers
only the visible selection instead of replaying every skipped index afterward.
Day labels are formatted lazily and memoized cells update only when their own
selection/preview changes. No geometry, glass material or spring was changed.

The new local iOS module `SpottrDateHaptics` observes the ribbon UIScrollView
offset through CADisplayLink on the UIKit main thread. It reuses and prepares a
UISelectionFeedbackGenerator and emits only while dragging/decelerating. It does
not replace the scroll delegate, install recognizers or change scrolling.
Programmatic movement, reopening, reset and date-window replacement are silent.
The frame link runs only while the small native view is in a window and enabled;
the React wrapper also disables it when its navigation screen loses focus.

The module advertises scrollFeedbackVersion=1. Only a binary containing that
capability mounts its native view and suppresses the JavaScript scroll impulse.
Expo Go/old binaries use the fallback, without requesting a missing native view.
Android and browser do not load the custom iOS module. Direct taps still use
the standard Expo haptics path.

Validation: JavaScript haptic timing/failure/lifecycle tests, native-view
capability guards, native source-delivery tests, TypeScript, and browser ribbon
checks cover the fallback and integration. Browser checks exercise slow changes,
reversals, direct taps, no feedback tail, 44-point geometry and List/Map continuity.
These checks cannot verify UIKit compilation or physical haptic timing.
Expo Autolinking's Apple resolver confirmed SpottrDateHaptics and its pod/Swift
class are included, alongside the existing SpottrNativeTabs module.

Still required on macOS: sync the complete modules directory, install Pods,
build SPOTTR, and test on a physical iPhone. Confirm native-driver activation,
first/last days, slow dragging, fast flicks, reversals, programmatic date picks,
reset, recentering, closing, backgrounding and switching tabs. UIKit compilation
and tactile timing have not been verified from this Windows workspace.
