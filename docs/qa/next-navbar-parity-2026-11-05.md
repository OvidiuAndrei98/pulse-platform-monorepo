# Navbar parity — 5 November 2026

## Scope and final shape

Next, Android and React Native web match the current iPhone navbar's resting proportions. The user asked for fully rounded continuous corners on both the outer surface and selection, with simple sliding movement on these platforms. All native iPhone implementations, including older iOS without Liquid Glass, remain unchanged.

The shared continuousCornerPath now uses figma-squircle 1.1.0 with cornerSmoothing 0.6, preserveSmoothing true and the radius at half the surface height. This replaces the earlier near-circular exponent-2.1 approximation at the user's request. Next and React Native web clip the backdrop surface using SVG; Android uses the already-installed MaskedView with the same path. The selected shape uses that contour too. Paths update on layout changes, never on animation frames. This does not claim to reproduce UIKit's private continuous-corner algorithm.

The five SVG icons, selected fills and resting geometry match FixedCapsuleTabBar.tsx, tabCapsuleGeometry.ts and TabBarIcon.ios.tsx: white 26px icons, 62px bar, 52px selection, 5px selection clearance and 1.15 selection-width/center-spacing ratio. Separate touch cells meet at icon midpoints; endpoint icons are optically centered within those cells. Mobile horizontal inset is 20px; desktop retains the 360px maximum width. Bottom clearance is restored to the original 20px in Next, Android and React Native web (confirmed in the original Next bottom-5 class and fallback TabBar.tsx bottom:20).

At a 390px viewport the bar is 350 × 62px, icon spacing is approximately 66.019px and selection width is approximately 75.922px. The selection extends approximately 4.95px beyond each midpoint toward its neighboring icon. Width stays constant at all five positions, with 5px clearance at both endpoints.

Next uses container units for position and icon distribution. Android and React Native web use the same measured geometry through SimpleCapsuleTabBar.tsx. Android uses the existing UI-thread indicator value; browser movement uses its persistent Web Animations timeline. All three use a 200ms monotonic, interruptible slide, without bounce or jelly, respecting reduced motion. Pink remains the brand color at approximately 45% opacity. Web glass uses CSS backdrop blur, gradient and highlights; it is not UIKit Liquid Glass.

## Validation

- 79 focused renderer, input, geometry, timeline, role-routing, persistent-navbar and native iOS regression tests passed after the contour change.
- Next TypeScript passed. React Native TypeScript is recorded in apps/spottr-native/artifacts/nav-rounded-typecheck.log.
- Actual Chrome comparison of Expo web on 8083 and the existing Next development server on 3000 passed at 390px and 1024px, over black and patterned backgrounds. Mean RGB difference was below 0.044 and no channel differed by more than 3. Both final navbar crops were visually inspected: rounded endcaps, correct clipping and retained translucent material.
- Focused Next Chrome checks passed at 320/390/430/1024px for all five tabs: equal icon spacing, centered selection, fixed dimensions, accessible separate touch regions, bounded intermediate travel and reversal, repeated rapid touches, keyboard activation, reduced motion and a persistent navbar. No browser rendering errors were recorded.
- Native .ios.tsx navbar files and FixedCapsuleTabBar.tsx have no diff.

Artifacts: apps/spottr-native/artifacts/navbar-parity-*.png, navbar-parity.json, navbar-rounded-parity.log, nav-rounded-tests.log; Next screenshots and measurements are in apps/pulse-app/.next/qa-navbar/.

The focused Next check uses NAVIGATION_TEST_URL=http://localhost:3000 and NAVIGATION_TEST_NAVBAR_ONLY=1 with node apps/pulse-app/scripts/tabs.browser.cjs. Parity uses NAVBAR_PREVIEW_URL=http://localhost:8083 and NAVBAR_NEXT_URL=http://localhost:3000 with node apps/spottr-native/tests/browser-navbar.cjs. Both run in isolated browser profiles with mocked API responses. They do not purchase tickets or mutate a real account. The browser comparison waits for Next hydration before adding the test background.

The older full tabs suite has an obsolete Feed fixture (/feed instead of /event-feed); that broader suite is not claimed to pass. Chrome was tested; Safari and a physical Android device were not validated in this pass. Android export output is in apps/spottr-native/artifacts/android-navbar-export.log. No deployment was performed.

## Local startup repair

The task dev:frontend command now invokes tools/dev-next.cjs directly, avoiding the broken global pnpm executable shim. It runs the existing token check and map-asset synchronization, resolves the installed Next CLI, and defaults to port 3000. Extra CLI arguments are forwarded. The equivalent package dev script uses the same helper.

The actual Task command was started and verified with HTTP 200 on an agent port, then stopped. The user independently confirmed that task dev:frontend now starts Next at http://localhost:3000. Existing user servers on 8081/8082 were not restarted or stopped. Agent Expo browser QA stays on 8083.

## Final follow-up after restart

The figma-squircle change is saved in the shared helper, package.json and lockfile. Installation passed supply-chain policies with a frozen lockfile; unrelated expo-doctor upgrades were reverted. Both app TypeScript checks passed. The user rejected a later 4px radius reduction, so the final radii are restored to 31px outer / 26px selection, with smoothing 0.6 and preserveSmoothing enabled. Native iPhone source remains unchanged.

Actual browser parity after the rollback and bottom-position correction passed at 390/1024px over black/patterned backgrounds; the latest crop was inspected. Measured bottom clearance is exactly 20px in both web implementations at both widths. Mean RGB error is below 0.038. Logs: navbar-squircle-parity.log, nav-squircle-typecheck.log, squircle-lockfile.log, and Next .next/qa-navbar/squircle-typecheck.log. Focused Next navigation QA also passed; see .next/qa-navbar/squircle-browser.log. Android export with the new dependency passed; a final export is repeated after the bottom-position correction, with its result in android-navbar-export.log. No commit, push or deployment.
