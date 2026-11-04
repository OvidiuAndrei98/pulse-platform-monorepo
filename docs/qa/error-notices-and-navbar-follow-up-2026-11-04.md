# Error notices and navbar follow-up — 4 November 2026

## Error presentation

The shared native `StatusNotice` now presents errors as a compact horizontal
surface: small accent icon, wrapping text and an accessible 44-point retry
target. The `Feedback` compact flag is forwarded correctly. Retry busy states
retain the target's dimensions. Loading and empty states retain their own
presentation; no extra glass or entrance animations were added.

Notifications no longer render both the list-header error and the empty-list
error after a failed refetch of a cached empty inbox. Home does not assert
"no events tonight" when its event data could not be loaded.

Map renderer, event and location failures share one notice beside the controls,
below the toolbar. The map remains mounted and its center and zoom controls are
not covered. Renderer retry preserves the last viewport. Event retry does not
remount the renderer. Expo Go, native MapLibre and native-web renderers report
failures to this common owner rather than drawing overlapping errors.

Feed initial-load, pagination and active-post like failures use the same notice.
Pagination failure preserves loaded posts. The retry operates on the failed
page/like instead of replacing the feed with a full-screen error.

## Guest Profile entry

iOS guest Profile taps now open the root Auth screen directly, retaining the
real tabPress cancellation path, rather than committing a spinner-only Profile
and then navigating a second time from its focus effect. The source navbar's
selection acknowledges that destination and returns to Home when Auth closes.

Home prepares a guest Auth screen while idle. Preparation supplies no return
parameters, does not run for authenticated accounts, cancels on blur, and never
demotes a mounted native-stack screen to preloaded. An unfocused Auth screen
cannot redirect another account. The user confirmed that logout → Home → Profile
→ Sign in is now fluid on iPhone. This does not establish that all earlier
navbar/login/logout performance issues are resolved.

## Additional indicator deformation

Both supplied Instagram recordings were inspected locally at 384 × 848. The
long traversal around 1.53–1.95 s in `aaaa insta cum trebyu.mp4` shows a larger
vertical contraction than the adjacent-tab traversal around 2.61–2.86 s in
`aaaaa insta navbar.mp4`. The neutral-fill width stays nearly constant during
most of the glide, with a small lateral variation and recoil. Pixel masks are
approximate because these are compressed recordings over changing backgrounds.

An iOS-only UI-runtime reaction derives deformation from actual position changes
and elapsed time. Longer/faster travel produces more thinning. The existing
release spring carries the shape through reversals and supplies the tiny recoil.
There is no React state update per frame or permanently active frame callback.
The bounded visual projection allows at most 14% thinning, approximately 2.52%
lateral yield and 0.6% vertical recoil; these are limits, not measured device
peaks. Drag pickup retains its existing enlargement. Reduced motion disables
this additional deformation. Position springs, resting proportions, glass,
icons and colors were not changed. The first device review identified an
unnatural brake-then-push at the ends; the focused correction is recorded below.

## Edge arrival follow-up

The rendered position included an additional glass-extension translation.
The old contact path waited until the position was within 3 points of the end,
then ran a 65 ms outward timing animation before a release spring. Consequently
the visible capsule accelerated toward the edge again after the underlying
travel spring had substantially decelerated. The speed-dependent deformation
made this mismatch more noticeable; raw position-only tests did not cover it.

Free arrival now transfers sampled incoming speed into a single spring whose
target is already zero. Contact begins in the existing 12-point contact region,
with a bounded impulse, no minimum kick and no timed outward phase. Stopped,
stale and reduced-motion arrivals do not generate impact energy. Contact remains
latched through the approach and recoil. Held dragging retains continuous
resistance and its existing enlargement. The positional `withTabTravel`
implementation and all its tuning constants remain unchanged.

The local installed-solver trace for a full traversal at 120 Hz previously
showed an increase of approximately 150 points/s between consecutive visible
velocity samples at 300 ms. The corrected trace decelerates throughout the
approach, without this second acceleration. These are simulated rendered
transforms, not physical-device frame-rate measurements.

Focused follow-up verification: **61 tests passed**, including visible arrivals
in both directions, adjacent and long trips at 60/120 Hz, interrupted momentum,
one contact impulse, stale samples, reduced motion and existing gesture routing.
Another **12 shared-switch and route-acknowledgement regression tests passed**.
TypeScript passed and the optimized iOS bundle compiled successfully. A new
8085 Expo Go comparison session and direct QR were provided after the previous
temporary session had stopped. Physical-device feel confirmation is pending.

The device review found that the first correction made lateral impact too weak.
Its incoming-speed gain was increased from 24 to 48, retaining the same single
spring and 12-point contact region. The full-traversal trace now peaks around
0.50 response (about twice the initial correction), with approximately 3.4
points of additional translation, and still shows no second acceleration.
At the user's request, the speed-dependent travel deformation was reduced by
approximately 11% (0.18 to 0.16 gain), independently of the restored edge contact.
All **73 focused motion, gesture, switch and route tests passed** after these
adjustments. The optimized iOS bundle was rebuilt on the same 8085 session;
the final contact/deformation balance still requires the user's device review.

Further device feedback exposed a missing integration boundary: Reanimated's
`valueSetter` discards a normal spring when its initial `.current` (the target)
equals the shared value. The zero-target impact was therefore skipped when
starting from rest, despite its nonzero velocity. The earlier direct-solver
tests called `onStart` themselves and did not exercise this shortcut. Their
simulated contact amplitudes did not establish visible impact on the device.

The single impact spring is now wrapped in a one-child `withSequence`, whose
higher-order scheduling starts it even from zero. There is still only one
physical spring, with no timed outward phase, added delay or reset of its current
deformation. A regression using the installed real `valueSetter` and frame queue
failed before this fix and passes afterward; it verifies visible deformation,
recoil, completion, retargeting and cancellation during pickup. Rendered-arrival
checks now use this real scheduling path too. Another requested reduction takes
the travel-deformation gain from 0.16 to 0.14; edge impulse gain remains 48.
All **75 focused tests and TypeScript passed**, and the updated optimized iOS
bundle was prepared on the unchanged 8085 session. Device confirmation is pending.

## Distance scaling and whole-navbar contact

The user confirmed that the impact now appears and requested progressively
smaller contact for shorter trips. Its incoming-speed impulse is now multiplied
by actual travel distance divided by the full center-to-center span of the bar.
On five tabs the distance factors are 0.25/0.50/0.75/1.00 for one through four
steps; the existing full-width impulse is preserved. Touch selection and drag
release capture the displayed position on the UI runtime, so retapping during
travel and releasing near an edge do not inherit a previous long trip's energy.
External route changes also capture their displayed starting position.

The supplied `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp4` was inspected locally,
including consecutive frames from approximately 5.3 to 6.03 seconds. Following
the requested whole-bar movement, one quarter of the existing contact displacement
now pulls the entire bar and all icons. The indicator relinquishes that same
displacement inside the bar: the total screen-space travel does not receive an
additional kick. Icon artwork retains its size; hit areas and measured layout
remain fixed. Held drag behavior and the smaller 0.14 travel-deformation gain
remain unchanged. This is a visual adaptation, not a claim of identical private
Instagram implementation.

All **78 focused tests and TypeScript passed**, including real-setter startup,
screen-space continuity, monotonic contact strength across all four distances
in both directions at 60/120 Hz, whole-bar/icon movement, interrupted selections,
late acknowledgement and short free travel after a long held drag. The updated
optimized iOS bundle is prepared on the same 8085 session. Physical confirmation
of the new distance scaling and whole-bar movement is pending.

The next device review found the whole-bar/icon motion too small and the
terminal oscillation too strong. Whole-bar participation was increased from
25% to 65% of the contact displacement. Pull and width stretch now share that
same budget (`stretch = extension - direction * pull`), rather than adding a
body translation on top of the old outward extent. Both bar ends and all icons
move more visibly while the contacted edge is not thrown farther out. The
indicator's containment uses the actual smaller width stretch.

Only the free-impact spring damping was increased from 18 to 24. The real-setter
regression verifies that its return wave is less than 6% of the impact peak;
position travel, held dragging and the 0.14 shape gain retain their settings.
All **78 focused tests and TypeScript passed** for this revision, including the
screen-space trajectory with the redistributed movement and the anchored
contact budget. The optimized iOS bundle is prepared on the same 8085 session;
physical feel confirmation of this latest balance is pending.

## Measured elastic fan-out (supersedes rigid row translation)

The next review clarified that the icon row must stretch and return, rather than
translate as a rigid body. White-icon centroids were measured locally from the
provided clip at consecutive frames. Around 5.70-5.80 s, the neutral icon spacing
increases approximately 2-3% around the opposite icon, which remains nearly
stationary. For example, at 5.7667 s the measured Reels/DM/Search centroids are
128.35/195.40/261.06 px versus 126.93/192.11/256.48 px at rest. These compressed
video measurements are approximate, not a private UIKit implementation claim.

Free contact now applies one affine strain to both glass and the entire icon
row, anchored at the far icon. The old inverse horizontal content compensation
and rigid row pull are removed for free contact. Held dragging retains its
original resistance and inverse compensation. Normal full-traversal strain is
roughly 2-3%, with a smooth 4% safety ceiling. Contact tension begins within the
last 0.95 tab spacing, so expansion overlaps travel rather than starting a late
outward push. Distance scaling remains active.

The free capsule rides that same surface, with no independent contact-offset
or pressure-driven terminal scale change. Its visual overrun is smoothly limited
to less than 0.75 point, while the underlying travel spring is unchanged. The
impact/return spring now uses damping 35; actual shared-value scheduling tests
verify a single positive stretch followed by monotonic return, without a
negative contraction wave. Repeated touch cancellation uses the same damped
return. Speed-dependent travel compression retains its 0.14 gain.

All **80 focused tests and TypeScript passed**. They cover actual setter startup,
four distances in both directions at 60/120 Hz, visible endpoint deceleration,
elastic spacing/far anchoring, soft visual containment, rapid selection,
cancellation and the existing held behavior. The new optimized iOS bundle is
prepared on the same 8085 session. Device review of this measured fan-out is
pending.

## Verification

- Native unit suite: **706 passed, 0 failed**; includes the installed Reanimated
  solver, interrupted selection, shape bounds, drag pickup and reduced motion.
- TypeScript and architecture checks passed; production web export succeeded.
- Browser error/retry checks passed for Home, cached-empty Notifications,
  Discover, map control access at 390/320 px, and Feed initial/paging/like failure.
- Full Notifications, login input, account-switch isolation and profile-ticket
  browser checks passed. A cold Metro account-switch attempt timed out before
  rendering; the same check passed against the current compiled export.
- The optimized iOS bundle was warmed on the already approved 8085 comparison
  server. This is still Expo Go, not an iOS Release binary. User-owned 8081/8082
  servers were not restarted.

For optimized Expo Go testing from the repository root:

```powershell
node .\apps\spottr-native\node_modules\expo\bin\cli start .\apps\spottr-native --go --no-dev --minify --tunnel ngrok --port 8081
```

The saved `EXPO_NO_REDIRECT_PAGE=1` setting keeps future Expo Go QRs on the native
`exp://` link. Optimized JavaScript requires Reload to apply source changes.

## Latest navbar revision: synchronized motion, replacing the rejected impact model

The device feedback rejected the preceding independent impact/shape springs:
the bar and capsule appeared out of phase and swayed at both travel distances.
The former `withTabEdgeImpact`, contact pulse, and speed-compression spring have
now been removed, including the unused provider shared values. Earlier impact
measurements above describe superseded implementations.

The first atomic-pose attempt was also rejected on-device: its phase-based
contact envelope still looked detached and excessive. The final revision
removes that envelope too.

`tabSynchronizedMotion.ts` publishes one atomic pose from the existing horizontal
position spring. Glass, icon row, and indicator styles read that same pose.
Surface contact is a direct function of the position spring's real endpoint
overrun, with a smooth start and bounded extreme pulls. The indicator center
inverts that surface transform, so its displayed path cannot receive an extra
lateral kick from the parent scale. There is no contact timer, independent
contact curve or second free animation. Retargeting captures the currently
displayed transforms, including when interrupted during actual contact.

The small positive strain expands the entire bar and icon spacing around the far
icon only while the position spring presses that end. Thus return is directly
coupled to that same spring. At 120 Hz, measured peak strain is approximately
0.098%, 0.217%, 0.326% and 0.425% for one through four tabs; full-distance center
overrun is about 1.335 points. This is substantially smaller than the rejected
1.8% envelope. The monotonic phase is retained only for subtle travel thinning
and blending an interrupted pose. The main travel spring, resting geometry,
materials, colors, icons, and original held-drag springs are preserved.

Verification: **82 focused tests passed**, as did TypeScript. Actual installed
Reanimated solver traces cover 60/120 Hz, both endpoints and four distances.
Assertions check the screen-space trajectory (including the parent transform):
no second acceleration during arrival, one visible recoil, no delayed independent
tail, exact resting geometry, affine icon spacing, rapid reversals, and stationary
grip release. A direct geometric assertion checks that the complete transformed
center follows the position spring and that the surface cannot deform before
contact. Subpixel solver finish noise is limited to 0.01 point per frame in the
reversal assertion. Full traces: native `artifacts/navbar-synchronized-motion.json`.

The optimized iOS bundle was warmed successfully on the existing approved 8085
tunnel, `dev=false`, `minify=true`. No user server was restarted.
Physical feel still awaits feedback after Reload; numeric checks alone do not
establish equivalence with Instagram.

### Small follow-up: more visible icon motion

User feedback requested slightly stronger icon movement. Increased the shared
surface/icon pull gain by 20%, retaining the same direct contact function and
inverse indicator-center compensation. The capsule's screen-space trajectory,
travel spring and timing remain identical. Measured peak strain at 120 Hz is
now 0.117%, 0.261%, 0.391% and 0.510% for one through four tabs.

All 57 motion/gesture tests and TypeScript passed. The edge-clearance assertion
now measures the actual transformed center instead of its compensated local
coordinate. Optimized 8085 bundle warmed successfully: 15,736,438 bytes.

### Paused at the user's request: comparison copies saved

User could not judge the last increase and requested preserving an earlier
version for comparison tomorrow. No further motion changes or activation.

Local backup: `apps/spottr-native/artifacts/navbar-comparison-2026-11-04-04-44-35-eaNM1b/`.
Its README explains the variants; manifest.json records all 118 verified source
and test file hashes. `current/` saves the live version. `before-last-20-percent/`
contains the previous exact motion module (gain 1.0), with current surrounding
navigation/test context. `git-reference-before-motion/` preserves the historical
committed baseline from `518f93f1820b0fd622c0a203fd8ef55b4fddbeb6`; it is explicitly
not an exact snapshot of all earlier uncommitted session fixes.

Resume with a physical comparison of current versus the previous gain. Preserve
guest Profile and authentication/navigation performance fixes. Do not copy the
whole old navigator over those fixes. No source files were reverted.
