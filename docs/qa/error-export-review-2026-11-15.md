# Error export review — 15 November 2026

Read the complete user-provided `spottr-errors (1).json`, exported at 06:44:35 Europe/Bucharest on 15 November. The source export was not modified. No remote infrastructure, database or user session was changed or queried during this review.

## What the export establishes

- 25 reports, grouped into 15 exported fingerprints. Repeated reports are not 25 distinct defects.
- 23 handled HTTP 503 responses across notifications, tickets, scanner/profile and other requests. 21 reports occurred on 5 November local time; two more HTTP 503 reports occurred on 15 November around 00:57–00:58. A 503 establishes an unavailable HTTP service, not which infrastructure component failed.
- Two web JavaScript reports are marked fatal: Explore on 14 November at 23:22:48 and Home at 23:24:13, local time. Both have Unknown error type, UNEXPECTED_ERROR, empty frames and no original message. The export cannot identify their throw site, exact cause or user-visible outcome.
- All reports lack requestId and use appVersion 0.1.0 / unknown buildVersion. These records cannot be correlated to a specific server request or exact application build from the supplied data alone.

## Reproduced collection defect and correction

The existing browser global-error listener forwarded only `ErrorEvent.error`. A real ErrorEvent can carry a null error value while still exposing message, filename, line and column; all of that remaining diagnostic information was discarded. String rejection reasons likewise lost their possible classification.

`diagnostics/browserErrors.ts` now preserves existing Error objects. When that object is absent, it passes the supplied browser message and actual available source location through the existing sanitizer. Raw messages, complete URLs, query strings and private fields still do not enter storage or delivery. Missing locations remain missing; the reporter's own call site is never fabricated as the source. String rejection reasons can be classified without manufacturing a stack.

`runtime.ts` uses this adapter for the web listeners. Native ErrorUtils behavior, fatal flags, deduplication, rate limits, storage, request capture and the API schema remain unchanged.

This is a reproduced reporting gap, not proof that either historical JavaScript report came from that exact event shape. The lost information in old records cannot be reconstructed.

## Verification executed

- 37 diagnostic/privacy/handled-failure tests passed, including four new browser-event regressions.
- Real local Chrome ErrorEvent with null error and PromiseRejectionEvent with string reason passed through the actual listener, sanitizer, persistence queue and sender. Classification and the actual supplied source location survived; private markers did not. The sender was an isolated fixture, with no remote service involved.
- Native TypeScript passed.
- Architecture validation passed for 733 source files.
- Diff whitespace check passed for the changed tracked source.

No physical device, production/staging deployment, live outage recovery or repair of the two unidentified historical application exceptions is claimed. The current compatible client must load these changes before future reports benefit from the correction.
