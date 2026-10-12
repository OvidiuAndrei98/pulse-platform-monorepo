# Native ticket payments

Hosted Stripe Checkout remains the default. Native apps request `client: "native_sheet"`
on the existing ticket purchase endpoint and must send a UUID `Idempotency-Key`.
Only the platform API creates the PaymentIntent, charges the persisted price and fee,
and issues tickets after server-side verification.

## Deploy before releasing the native build

1. Apply `internal/database/migrations/20261011190000_native_payment_sheets.sql` before
   deploying the updated API and its reconciliation worker.
2. Configure `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` from the **same Stripe
   platform account and mode**. Use a test pair for staging. The backend checks the
   key prefixes/modes before reserving stock; the deployment owner must also verify
   that both keys belong to the same account. Do not expose the secret key to the app.
3. Keep `STRIPE_CONNECT_WEBHOOK_SECRET` configured and deliver Connect account events
   `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`,
   plus the existing Checkout, charge refund, refund and account events, to
   `/api/v1/stripe/connect/webhook`. Keep hosted Checkout webhooks enabled.
4. Run the API reconciliation worker. A native payment reservation expires after
   30 minutes, but stock is released only after Stripe confirms cancellation. A
   processing payment or unknown provider result stays reserved for reconciliation.
5. Rebuild the native app with Stripe React Native and test on physical iOS/Android
   devices. Web/Expo Go alone cannot validate PaymentSheet, bank-app/3DS returns or
   native Apple Pay/Google Pay configuration. Wallet setup is separate from cards.

## Native app setup

The card PaymentSheet uses the account and publishable key returned by the API;
there is no Stripe secret key or hardcoded connected account in the app. Web
continues to use hosted Checkout. Native screen styling is dark with the SPOTTR
pink accent; the library supplies the payment controls and bank authentication.

Optional wallet settings are documented in `apps/spottr-native/.env.sample`:

- `SPOTTR_NATIVE_APPLE_MERCHANT_ID`: an Apple Merchant ID with the Stripe payment
  processing certificate configured. Without it, Apple Pay is not requested.
- `SPOTTR_NATIVE_GOOGLE_PAY_ENABLED=true`: enable only for a configured Google Pay
  build. The API's Stripe public-key mode selects test versus production mode.

The current backend explicitly enables card payments. Link and other payment
methods are not enabled by this integration.

After installing dependencies on the Mac, run
`pnpm --filter @apps/spottr-native prebuild:ios` and
`pnpm --filter @apps/spottr-native ios`. For Android, use
`pnpm --filter @apps/spottr-native android`. A Metro reload of an old installed
binary cannot add Stripe, Keyboard Controller or Haptics native modules.

Before presenting Stripe, native checkout commits recovery context to Expo
SecureStore (iOS Keychain / Android Keystore-backed storage). Records are scoped
by API URL and stable account ID, with a separate guest scope, and contain no
card data, billing details or copied login tokens. In-memory capabilities are
cleared when the account changes; returning to the same account restores only
its own records using the current login token.

After a cold start and auth hydration, the app opens server confirmation from
the main tabs, once per recovered order. It defers to active event links, checkout
and scanner screens. Pending/offline results remain recoverable; checkout waits
for storage hydration before allowing another purchase of the same event.
Foregrounding confirmation rechecks a pending result. Explicit cancellation uses
the existing server state machine, so a cancellation race can still show success.
Leaving a confirmed terminal result removes its durable recovery record.

Recovery applies to payments started with this client version. Older terminated
sessions have no saved capability; server reconciliation/webhooks and My tickets
(or the guest ticket email) remain their recovery path. Uninstalling or clearing
device storage is not guaranteed to preserve local recovery.

## Contract and recovery

Creation returns `mode: "payment_sheet"`, `orderId`, `paymentIntentId`,
`paymentIntentClientSecret`, `stripeAccountId`, `publishableKey` and an ISO8601
`expiresAt`. The SDK must use the returned connected account. Card entry belongs
to Stripe; no card details should pass through the SPOTTR API.

`POST /api/v1/checkout/payment-sheet/reconcile` and `/cancel` accept the exact
`orderId`, `eventId`, `paymentIntentId` and `paymentIntentClientSecret`. The secret is
the guest payment capability. Send it only over HTTPS in the request body and
exclude it from logs, analytics, URLs, navigation state and ordinary storage.
The native recovery journal may persist it only through SecureStore with
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, one small item per order; there is no
AsyncStorage/localStorage fallback. A failed journal write prevents presenting
Stripe and attempts server cancellation. Responses use `Cache-Control: no-store`.

Both endpoints return the committed order state: `pending`, `completed`, `failed`
or `refunded`. A successful SDK dismissal or redirect alone is not payment proof.
If cancellation races payment confirmation, reconciliation returns the actual
state and can complete the order instead of canceling it. A failed card attempt
is retryable and does not release inventory. Existing durable email, invoice and
refund handling runs after the same transaction used by hosted Checkout.

Creation retries reuse the same order and Stripe idempotency key. Client secrets
are not saved in the idempotency response JSON. If Stripe creation remains
uncertain, the reservation is quarantined in `checkout_reservation_reviews`;
do not manually release it until the external PaymentIntent is identified and
confirmed canceled, or paid and bound for fulfillment/refund review. Reusing a
different idempotency key is not recovery for an uncertain original payment.

## Regression tests

Run `go test ./internal/payments ./internal/router`. Integration tests additionally
require `ISOLATION_TEST_DATABASE_URL` pointing to a fully migrated database named
`spottr_security_test` on `127.0.0.1`; their guard refuses any other host/database.
They use only a local mock Stripe server, including concurrent success/cancel,
repeated callbacks, exact-account/capability validation, unknown cancellation,
expiry, retryable failures and idempotent creation. Real Stripe test-mode payments,
3DS, cancellation and refunds remain necessary before deployment.

Native regression tests: `pnpm --filter @apps/spottr-native test`. The recovery
tests simulate process restart, changed login tokens/accounts, guests, missing
or corrupt storage, concurrent writes, offline/ambiguous results and native Back.
The UI tests execute the actual startup/confirmation components with simulated
native views, storage and API responses. On a real device, start a Stripe **test**
payment, terminate the app before confirmation, then reopen it; verify pending,
paid, canceled and offline outcomes, including return from bank authentication.
