# SPOTTR stabilization priorities

Recorded at the user's request on 2026-11-01. These priorities should inform
future work; this note does not authorize an immediate rewrite or certify
release readiness.

## Findings from the limited code review

1. Move shared, platform-independent business logic out of direct imports from
   `apps/pulse-app/src` into a dedicated shared package. Preserve behavior and
   migrate incrementally, with meaningful regression checks.
2. Split large checkout, scanner and management components by responsibility
   when working in those areas. File size alone is not evidence of a bug.
3. Add automated checks on changes: client type checks and meaningful unit
   tests, backend tests and isolated database integration tests. Keep costs
   proportionate; existing manual iOS packaging is not a full validation gate.
4. Establish a repeatable release checklist on real iPhone and Android devices:
   navigation, keyboard dismissal, sheet scrolling, camera, native payment,
   background/foreground recovery, offline scanning and platform appearance.

## Evidence collected on 2026-11-01

- React Native TypeScript check passed on the current working tree.
- 58 selected local tests passed across checkout, native payment, PaymentSheet
  SDK handling, payment recovery, offline tickets and wardrobe flow.
- The initial test runner attempt failed before test execution because the
  sandbox could not resolve the Windows user profile. The rerun outside the
  sandbox passed.
- The selected tests use simulated dependencies and do not establish that live
  Stripe, camera capture or device gestures work correctly.
- Relevant payment and offline-scanner code includes idempotency, signed
  Stripe webhook verification and persistence before local admission success.
  This was a limited inspection, not a comprehensive security certification.

## Additional review targets, not confirmed defects

- Cross-device concurrency and data consistency: last-ticket purchases,
  repeated webhooks, scan synchronization conflicts and concurrent wardrobe
  pickup. Check existing safeguards before proposing changes.
- Recovery after interruption: process termination, network changes, expired
  authentication and foreground resumption without lost or duplicated work.
- Compatibility between older installed clients and newer API/database
  releases, including contract validation and migrations.
- Release-build performance on representative devices: frame timing, retained
  memory, image/map usage and unnecessary requests or polling.
- Production operations: useful failure alerts, traceable request/report
  references, verified backup restoration and documented recovery procedures.

Prioritize payment, admission and belongings integrity, then release
verification and maintainability. Do not describe an untested flow as flawless.
