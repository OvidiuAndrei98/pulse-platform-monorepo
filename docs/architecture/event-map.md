# Event discovery map

Web uses MapLibre GL JS 6.16.0. iOS/Android use MapLibre React Native 11.5.0
and its Expo config plugin. Use Node 22.13 or newer (Node 24 on CI).

`openFreeMapDark.json` is our bundled copy of OpenFreeMap Dark. It adds
`spottr-3d-buildings` and removes two unsupported sprite references. The
original license and modification notice are in `openFreeMapLicense.txt`.
Buildings use OpenStreetMap height data; this is building extrusion, not terrain.

The worker is copied from the pinned MapLibre package to each app's public
directory by `tools/sync-map-assets.cjs`. Generated files are ignored by Git.
Use the package's `dev`, `start`, `web`, `build` and `export` commands, rather
than invoking Next/Expo directly on a clean checkout. The build needs no map
API key and does not download scripts from a CDN.

Provider requests use fixed OpenFreeMap tile, font and sprite URLs. No account,
order, ticket, token, event ID or event title is sent in provider URLs/headers.
Tile paths necessarily reveal the viewed area. Attribution remains visible
above the carousel; the privacy notice names OpenFreeMap and its delivery
infrastructure. Provider transport failures leave cards and event sheets usable.

If adding a web CSP, allow `worker-src 'self'`, `connect-src` for
`https://tiles.openfreemap.org` plus the app API/media origins, and `img-src`
for local images, media and `data:`/`blob:`. No `unsafe-eval` is needed by the map.

## Native rollout

This is a native SDK change, not an OTA-only update. Expo Go is unsupported.
On the Mac, sync the repository, install dependencies, then run from the root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @apps/spottr-native exec expo prebuild --platform ios
pnpm native:ios
```

Do not use `--clean` over a project with uncommitted native changes. Confirm
Pods/MapLibre installation, build in Xcode, and test map loading, gestures,
safe areas, copyright links and carousel focus on a real device before release.
An Android release likewise requires a new native build.
