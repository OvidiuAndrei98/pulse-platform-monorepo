# Discover List/Map state retention â€” 5 November 2026

Reported on the installed iPhone build: switching between List and Map appears
to reload both presentations every time.

The screen rendered `view === 'map' ? <EventsMapPanel /> : <FlatList />`.
Switching therefore destroyed the previous presentation, including the native
map renderer, camera/selection/carousel state, location initialization and list
scroll state. The shared event query itself does not use presentation mode in
its cache key; this was a presentation lifecycle issue.

`DiscoveryScenes` retains the list and lazily mounts the map on its first actual
visit. Subsequent switches park the inactive scene outside a clipped viewport,
keeping its measured size and alpha. This follows the existing persistent iOS
tab scene approach rather than changing native glass opacity, layout visibility,
or renderer keys. Inactive scenes disable pointer/accessibility interaction and
are inert on web. Their parent-driven content updates wait until reactivation,
avoiding unnecessary hidden marker/list updates while editing filters.

The Discover repeated-tab scroll-to-top target and list pagination callback now
act only when List is visible. Shared filters and query caching remain owned by
`DiscoveryScreen`; returning to a retained scene applies current data. Leaving
Discover for good still releases both scenes normally. Explicit renderer retry
continues to replace a failed map as before.

Verification:

- TypeScript passed after the presentation change.
- The real React/RN Web lifecycle test passed over 25+ List/Map switches,
  exercising web/iOS/Android presentation branches. It verifies one lazy map
  initialization and location read, no scene unmounts, retained FlatList DOM and
  offset, retained camera/selection/carousel probe state, preserved dimensions,
  hidden-scene interaction gates, and updated filters after reactivation.
- 15 existing native map lifecycle, safe native module loading, WebView bridge,
  query-tracking and persistent-tab regression tests passed.
- 49 Discover keyboard, Search and controls motion tests passed. The parent
  integration test also exercises the retained list's stable pagination callback
  and verifies it cannot fetch/scroll-to-top while Map is visible.
- Web production export passed. The complete app's real MapLibre browser test
  passed: same renderer and WebGL canvas after List/Map, no repeated geolocation,
  retained selected event, zoom/gesture controls, event sheet return, and
  responsive 320px/desktop presentation. The previous test expected the map to
  reset to the first card; it now checks the retained selected card instead.

The browser lifecycle probe verifies React reconciliation and state retention;
it does not substitute for MapLibre/Metal validation on the physical iPhone.
The installed binary must load this updated JS (Metro Reload for a connected
development build, or a rebuilt standalone app).

## Date ribbon: empty-day styling

Both React Native and Next now mute date numbers for days with no matching events. Empty dates remain selectable; the centered selection retains white text on magenta. Availability uses each app's complete, cached Home event catalogue rather than the currently selected date's paginated results. Loading/error states stay neutral. Categories, vibe, city, search and the current distance center are applied consistently. Bucharest calendar overlap includes overnight and multi-day events, excludes events ending exactly at midnight from the following day, and respects DST. No new backend endpoint or deployment is required.

Validation: 10 shared date/discovery tests passed; both app TypeScript checks passed. Browser ribbon checks passed on Expo web 8083 and Next 8084 with mocked API data, including visibly muted empty dates, selectable empty days, preserved availability after selecting another date, 44px spacing, list/map continuity and narrow layouts. Both captured ribbon screenshots were inspected. Physical iPhone appearance was not verified. Logs: apps/spottr-native/artifacts/date-ribbon-availability-native.log, date-ribbon-availability-next.log, date-ribbon-typecheck.log; Next typecheck log is in .next/qa-navbar/date-ribbon-typecheck.log.

## Fast date-ribbon scrolling

The bounded 91-day native window is now rendered in full before a fling, rather than in batches of 13. This avoids a native scroll position outrunning prepared cells. The native label cache survives recentering while evicting days outside the current window; shared event ranges are memoized separately from the displayed days, avoiding catalogue filtering/time-zone formatting during recentering. Next also caches its day labels outside scroll-driven renders. Date spacing, selection, haptics and material are unchanged.

Validation: 10 shared date/discovery tests passed, both app TypeScript checks passed, and browser ribbon tests passed on React Native web 8083 and Next 3000. Regression checks confirm all 91 dates (including day +80) exist before the fling, then verify fast scrolling/recentering, final selection, muted empty dates, list/map continuity and 320px layout. Logs: date-ribbon-fast-native.log and date-ribbon-fast-next.log in apps/spottr-native/artifacts. Physical iPhone frame pacing has not been measured in this pass; phone verification requires Reload of the updated JS.

## Continuous native date coordinates

The user's remaining freeze happened after crossing many weeks/months. The former 91-day dataset had a real scroll boundary; it was replaced only after the scroll settled, then useLayoutEffect forcibly moved the offset. Eagerly rendering those 91 cells did not remove that boundary.

React Native now uses VirtualizedList with an implicit calendar from today through the supported end date (2100-12-31). getItem/getItemCount/getItemLayout derive dates from stable absolute indices. Native momentum and normal settling never replace the data window or call scrollToOffset; explicit opening, layout changes, date picking and reset retain their intentional positioning. Nearby cells are prefetched with overscan; date labels and availability caches are limited to 512 entries each. Next's separate rendering was not changed in this follow-up.

Validation: 11 shared tests passed, including stable indices across DST/months/years. The real Native web browser test passed jumps through day +80/+180/+400/+730, retained the final absolute offset after settling, mounted fewer than 400 date cells at phone width, reversed back to day +2, and preserved date colors, list/map state and reset behavior. Log: apps/spottr-native/artifacts/date-ribbon-runway-native.log. Native TypeScript passed. Physical iPhone follow-up: after Reload, the user confirmed that rapid scrolling across months and back now continues without stopping. This is a manual interaction confirmation; device frame pacing was not instrumented.

