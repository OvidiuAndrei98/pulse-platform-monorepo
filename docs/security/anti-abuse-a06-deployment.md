# SPOTTR - A06 anti-abuse deployment

This phase adds application-enforced, PostgreSQL-backed limits shared by every
API task. It also caps active checkout reservations. Sessionless reservations
older than the 30-minute Stripe lifetime plus a 5-minute grace period are
quarantined when the external Stripe outcome is unknown; inventory is never
released based on age alone.

## Required deployment order

1. Run migration `20260915120000_add_abuse_protection.sql` before deploying the
   API image. The migration is additive and is safe while the previous API
   version is running.
2. Determine the private CIDRs of the subnets used by the Application Load
   Balancer. Configure the ECS task environment variable
   `TRUSTED_PROXY_CIDRS` as a comma-separated list of only those CIDRs. Do not
   enter `0.0.0.0/0`, `::/0`, or public client networks.
3. In EC2 > Load Balancers > the SPOTTR ALB > Attributes, keep
   `X-Forwarded-For header` in `Append` mode. The API walks the chain from right
   to left and accepts it only when the immediate TCP peer is in a configured
   trusted CIDR.
4. Confirm that the API task security group accepts inbound application traffic
   only from the ALB security group. Do not expose the ECS task directly to the
   internet or trust a broad client CIDR as a proxy.
5. Deploy the new task definition and wait for all new tasks to become healthy.
   A missing abuse-control table causes sensitive endpoints to fail closed with
   HTTP 503, so verify the migration before rollout.
6. Verify that old tasks stop, then exercise login and one test-mode checkout.

When `TRUSTED_PROXY_CIDRS` is empty, the API safely ignores all forwarding
headers and limits by the immediate peer. Behind an ALB this groups traffic by
load-balancer node, so production should configure the exact ALB subnet CIDRs.
Invalid CIDR syntax prevents the API from starting.

## Implemented budgets

- login: 20 requests/IP/15 minutes and 10 attempts/email/15 minutes; a valid
  login clears the email counter;
- registration: 5 requests/IP/hour and 3 attempts/email/hour;
- forgot password: 10 requests/IP/hour, with silent limits of 3/email/hour and
  5/email/day while preserving the same public response;
- reset password: 10 requests/IP/15 minutes and 5 attempts/token/15 minutes;
- checkout creation: 10 requests/IP/10 minutes and 5 requests per
  user-or-email/event/10 minutes;
- checkout reconciliation: 30 requests/IP/10 minutes and 10/session/10 minutes;
- promo-code validation: 30 requests/IP/10 minutes;
- quick scanner session creation: 10 requests/IP/15 minutes;
- Google OAuth entry/callback: 30 requests/IP/10 minutes;
- organizer promotion checkout: 10 requests/IP/10 minutes.

Checkout additionally allows at most three pending orders and 16 pending
tickets for the same user (or normalized guest email) and event, plus at most
five pending orders and 32 pending tickets for the same HMAC-protected IP and
event. Every still-pending reservation is counted regardless of age. The checks
and reservation are serialized in the database, so concurrent
requests across ECS tasks cannot exceed either cap or bypass the first cap by
rotating guest email addresses.

All limiter subjects are HMAC digests derived with domain separation from the
JWT signing key. Raw IP addresses, emails, reset tokens, and Checkout Session
IDs are not stored in `request_rate_limits`. Rotating `JWT_SECRET` creates a new
digest namespace; old expired rows are removed by the hourly cleanup worker.

Orders that remain pending without a persisted Stripe Checkout Session after
35 minutes are inserted idempotently into `checkout_reservation_reviews` with
reason `external_outcome_unknown`. Do not release their tickets until an
operator has verified the connected-account payment state in Stripe. A delayed
successful payment must be fulfilled; a confirmed expired/unpaid session may
then be failed and its exact reservation released.

Fulfillment never trusts `order_id` metadata by itself. A completed event must
match the exact Checkout Session ID already persisted by SPOTTR. A completed
event for a sessionless order remains quarantined and issues no tickets until
an operator verifies and binds the external payment.

## Verification

From `api`:

```powershell
$env:GOCACHE = Join-Path $env:TEMP 'spottr-go-cache-a06'
go test ./...
go vet ./...
```

Optional database concurrency tests require an isolated local PostgreSQL
database named exactly `spottr_security_test` reachable on `127.0.0.1`:

```powershell
$env:ABUSE_TEST_DATABASE_URL = 'postgres://...@127.0.0.1:5432/spottr_security_test?sslmode=disable'
$env:ISOLATION_TEST_DATABASE_URL = $env:ABUSE_TEST_DATABASE_URL
go test ./internal/abuse ./internal/payments -count=1
```

Never point these tests at staging or production; the test guards reject other
hosts and database names.

## Defense in depth

Add an AWS WAF rate-based rule to the public ALB for broad HTTP flood
protection. WAF is intentionally additional: its approximate IP-based limits do
not replace the exact email, token, session, or active-reservation controls in
the API.
