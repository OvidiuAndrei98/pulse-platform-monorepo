# Shared code and application controllers

The Web and Native applications share rules through workspace packages. Neither application imports the other's source. The existing UI, including native Liquid Glass components, stays in its owning application.

## Dependency boundaries

```text
Web React views/hooks          Native React views/hooks
        |                         |        |
        +---- browser-core -------+        | (web adapters only)
        |          |                       |
        +----------+---- app-core ---------+
                             |
                   api-client schema types
```

- `packages/app-core` owns platform-independent TypeScript: pricing presentation, availability, payment confirmation decisions, date/filter rules, data contracts, map geometry, wardrobe state transitions and request-injected coordination. It has no React, Next.js, React Native, DOM, Node, environment access or global network/storage I/O. Application adapters supply transport and effects. The standard WebWorker type library supplies portable JavaScript types such as timers and AbortSignal; it does not authorize worker/browser APIs.
- `packages/browser-core` owns imperative DOM integrations: MapLibre, PDF rendering and autofill observation. It does not import React. Each application's small lifecycle wrapper uses that application's own React runtime, avoiding mixed Web/Native React peers.
- `packages/api-client` exposes `client` for transport, `schema` and `schema-types` for contracts, and `validation-event-selection` for its existing DTO selection helper. Shared domain modules import API contracts with `import type`, without importing transport.
- Application controllers own auth/session state, React subscriptions, network coordination, navigation and platform storage/camera effects. Platform-specific adapters stay local (`.web.tsx`/native implementations where needed). Language is passed explicitly into shared date formatting.
- Presentation components receive narrow `Pick<ControllerModel, ...>` contracts. They render existing components and invoke controller actions. They do not receive API clients or raw bearer credentials. Web admin cancellation retry now also uses a scoped action lease to reject repeated taps and results arriving after logout/unmount.

Use declared package subpath exports, for example `@packages/app-core/checkout/totals`. Do not import `packages/*/src`, reach across application directories or add a compatibility alias that restores cross-application imports. Small React wrappers may be duplicated when the lifecycle belongs to different platform runtimes; domain decisions should be shared.

## Working on a feature

1. Put reusable rules and contracts in a focused `app-core` module, with explicit arguments and no platform globals. Export the public subpath in its package manifest.
2. Put browser-only imperative integrations in `browser-core`; create a local lifecycle wrapper in each consuming application.
3. Keep session, mutation ordering, API requests and platform effects in a feature controller. Do not move them into a presentation component to shorten the hook.
4. Add a presentation step/panel with the state and actions it actually needs. Preserve the existing UI primitives and styling.
5. Test important rules, race conditions and externally observable results. Server authorization, prices, stock and payment confirmation remain authoritative.

Controllers are still orchestration modules and some are sizeable. This change separates their UI responsibilities; it does not make every feature a pure state machine. Existing Web admin mutations other than the newly guarded cancellation retry retain their previous lifecycle behavior and deserve a separate hardening pass.

## Enforcement and local checks

`tools/check-architecture.cjs` scans both applications and shared sources. It rejects cross-application imports, private/unexported package paths, platform globals/runtime imports in `app-core`, and React imports in `browser-core`. Negative tests prove these failures are detected. Both application test commands run this guard and shared tests first. This task does not add a hosted CI workflow.

```powershell
pnpm check:architecture
pnpm --filter @packages/app-core typecheck
pnpm --filter @packages/browser-core typecheck
pnpm --filter @apps/pulse-app test
pnpm --filter @apps/spottr-native test
node node_modules/typescript/bin/tsc --noEmit -p apps/pulse-app/tsconfig.json
node apps/spottr-native/node_modules/typescript/bin/tsc --noEmit -p apps/spottr-native/tsconfig.json
pnpm --filter @apps/pulse-app build
pnpm --filter @apps/spottr-native exec expo export --platform web
pnpm --filter @apps/spottr-native exec expo export --platform ios --output-dir dist-native
```

Use Native's own TypeScript executable: its configuration uses TypeScript 6 options. Generated exports/builds remain ignored by Git. An iOS JavaScript/Hermes export verifies bundling; it is not an Xcode build or a device test.

The [migration manifest](shared-code-migration-manifest.md) maps old modules to their public imports and lists the controller/presentation splits.

## Verification scope, 2026-11-02

Shared and application tests, architecture checks, both TypeScript projects, the Next production build, Native web export and iOS JavaScript export were exercised. Local browser scenarios use isolated mocked accounts/APIs, not production writes. They cover checkout, scanner admission/sync, map adapters and admin operations.

Final results: 77 shared tests, 134 Web tests, 633 Native tests and 4 architecture rejection tests passed; the architecture scan covered 610 source files. Both standalone package typechecks and both application typechecks passed. Web checkout/scanner, Native-web checkout/scanner/operations and both Web/Native-web map browser scenarios passed. The independent source/documentation review accepted this refactor at 9.3/10; this is a score for these changes, not a security rating of the whole application.

The Web checkout/scanner browser flow runs without a service-worker registration and exercises real IndexedDB durability. Asset-cache/service-worker integration was not verified in that browser flow: Chrome's isolated profile raised `CacheStorage.open: UnknownError`. Separate worker tests cover its rules. No production workaround was introduced for this browser environment.

Real iPhone/Android keyboard, camera, gestures, accessibility and Liquid Glass behavior still require device checks before release. These limitations are separate from the source dependency refactor.
