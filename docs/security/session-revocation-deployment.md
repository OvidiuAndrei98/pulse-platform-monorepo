# User session revocation and dependency updates - 30 October 2026

## Behavior

User JWTs now contain a string `sv` claim bound to a monotonically increasing
database version. Mandatory and optional authentication in the application
router both check the current account and version on every authenticated request.
Missing, deleted or inactive accounts and stale versions return 401. Database
errors return 503 instead of accepting a token or falling back to anonymous access.
Authorization uses the current database role, not the role cached in the JWT.

Migration `20261030120000_add_user_session_versions.sql` creates a separate table
and a trigger on `users`. Password, role, activation and Google identity changes
increment the version in the same transaction as the account change. Rollback
also rolls back revocation. Changing a role or activation state back does not
revive previously issued tokens. Ordinary profile edits do not revoke sessions.
The migration locks account writes during backfill and trigger installation.

Both password login and Google login bind issuance to the account snapshot they
authenticated. If credentials changed while signing in, issuance fails; an old
password cannot acquire a newly incremented version. Google identity linking
preserves activation state and cannot overwrite a different linked Google ID.
An existing inactive account must first be activated through the approved account
process; Google sign-in no longer silently activates it.

Existing user JWTs without `sv` intentionally stop working after deployment.
Every existing web/native user must sign in again. No signing-key rotation or
long-lived fallback is added. Dedicated scanner-link sessions keep their separate
scope and existing access/revocation checks; they are not ordinary user JWTs.

## Deployment order

Use the existing staging/production deployment scripts. Do not use a rolling
deployment or manually start old/new API task definitions alongside each other:
the old middleware would still accept revoked tokens.

1. Record the current image/task definition and database backup/recovery point.
   Verify the database is healthy before starting a deployment. This change does
   not authorize restoring the currently unavailable RDS instance or creating AWS
   resources. Review any still-pending migrations before applying them.
2. Stop every API instance serving this database/environment. Verify the target
   service has `desiredCount=0`, `runningCount=0` and `pendingCount=0`, with no old
   standalone tasks or alternative API instances still serving authentication.
   Account for autoscaling/scheduled actions that could restart old tasks.
3. Run migrations with the new image while the API is stopped. Confirm Goose
   records `20261030120000` and both the version table and trigger exist. Keep the
   API stopped if migration fails.
4. Start only the new task definition. Verify all running tasks use its exact
   revision and become healthy before restoring public access.
5. Verify password and Google sign-in, and an authenticated request. Confirm a
   pre-deployment token is rejected. Reset a test account's password and verify
   its previous token fails while a fresh login succeeds. Check administrator
   demotion and account deactivation with designated test accounts.

Both `task deploy:staging` and `task deploy:production` stop the target service and
verify zero desired/running/pending tasks before migrations. Production promotes
the verified staging image. Verify that no other instance bypasses these
controlled deployment paths.

Do not roll back to an API image without session-version validation: doing so
would restore acceptance of old tokens. Prefer a forward fix while access is
restricted. The migration's Down section removes revocation state and is not an
application recovery procedure.

## Dependencies and verification

The API requires Go 1.26.10 and its Docker builder is pinned to that patch.
The web app uses Next.js 16.4.3. Compatible dependency updates and targeted
Undici 7 / fast-uri 3 overrides address the available npm fixes.

The npm scan still reports a high-severity Zod 3 advisory in Expo CLI's toolchain
and a low-severity deepmerge advisory in Expo configuration. Expo CLI requires
Zod 3; the advertised Zod fix is in version 4. Forcing that major would change the
vendor's API contract. deepmerge 4.3.2 is advertised as patched but was not
published in the registry during this update. Neither finding is suppressed.
Review upstream releases and rescan before launch; this is not a clean npm audit.

Go's scanner reports no reachable vulnerabilities after the toolchain, x/text
and x/crypto updates. The x/crypto module also contains an unmaintained OpenPGP
package that this application does not import; module presence is not a reachable
application call path.

Local verification commands:

```powershell
cd api
$env:AUTH_TEST_DATABASE_URL = 'postgres://spottr_test@127.0.0.1:PORT/spottr_security_test?sslmode=disable'
go test ./...
go vet ./...
go run golang.org/x/vuln/cmd/govulncheck@latest ./...
```

Use only disposable localhost databases. Auth tests create/drop their own schemas
and execute the actual session migration. The full integration suite requires the
following additional variables and exact database names:

| Variables | Database | Initial schema |
| --- | --- | --- |
| `AUTH_TEST_DATABASE_URL`, `USER_TEST_DATABASE_URL` | `spottr_security_test` | Tests create isolated schemas |
| `ISOLATION_TEST_DATABASE_URL`, `ABUSE_TEST_DATABASE_URL` | `spottr_security_test` | All migration Up sections |
| `TICKET_TEST_DATABASE_URL` | `spottr_ticket_test` | All migration Up sections |
| `PUSH_TEST_DATABASE_URL` | `spottr_push_test` | Empty database |
| `DIAGNOSTICS_TEST_DATABASE_URL` | `spottr_diagnostics_test` | Empty database |

Never use staging/production for these tests. No cloud deployment is performed by
local tests. Build and test the native application on devices before release;
successful TypeScript checks and JavaScript tests do not validate a native binary.

## Verification completed on 30 October 2026

All 73 migration Up sections applied successfully to the disposable PostgreSQL 18
database. `go test -p 1 ./... -count=1` and `go vet ./...` passed with all seven
database-test variables above enabled. Both frontend TypeScript checks and the
Next production build passed; all 472 native JavaScript tests passed. The recovery
UI fixture needed view stubs for the existing GlassPressable and ActionIcon
imports; payment behavior and assertions were not changed. Offline installation
with the frozen pnpm lockfile passed.

The independent session-revocation review accepted this scoped implementation at
9.4/10 with no blocking findings. This is not a score or clean bill of health for
the whole application. The remaining dependency advisories are listed above.
Container and device builds, and the controlled cloud deployment checks, remain
release gates. No AWS resources were started or deployed during these checks.
