# SPOTTR — A10 database and administrator credentials

This patch removes credential fallbacks from the API and removes the historical
password-based administrator bootstrap from fresh database migrations. It does
not change credentials or accounts in an existing database by itself.

## Required production configuration

Before deploying the new API image, the ECS task definition must provide:

- `DB_HOST`: the exact RDS endpoint covered by its certificate;
- `DB_PORT`, `DB_USER`, and `DB_NAME`;
- `DB_PASSWORD` from AWS Secrets Manager, with at least 16 characters;
- `DB_SSLMODE=verify-full`;
- `DB_SSLROOTCERT=/etc/ssl/certs/aws-rds-global-bundle.pem` (the image already
  supplies this default and downloads the official AWS RDS bundle at build time).

The API now refuses to start when a remote database has missing or weaker TLS
configuration. `sslmode=disable` remains available only for localhost and IP
loopback development databases.

## Rotate the exposed database password

The old fallback password existed in Git history and must be considered exposed
even after its removal from the current tree.

1. Enable a short maintenance window because changing one PostgreSQL role's
   password cannot provide overlap between the old and new credential.
2. Generate a unique random database password and rotate it in RDS/Secrets
   Manager. Do not paste it into source files, commands, tickets, or logs.
3. Confirm that the ECS task definition reads `DB_PASSWORD` from the rotated
   secret and contains the verified TLS settings above.
4. Force a new API deployment immediately. The included EventBridge/Lambda
   stack may do this after an RDS-managed rotation, but verify the ECS deployment
   rather than assuming that the event was delivered.
5. Keep maintenance mode enabled until the new tasks pass health checks and the
   old tasks have stopped. Then verify a normal read and a harmless authenticated
   API request.
6. Ensure the ECS maintenance task uses the same rotated secret and TLS settings.

If the database password is not the RDS master password, update the application
role and its Secrets Manager value as one coordinated operation, then redeploy.

## Rotate the existing administrator account

Editing the old migration does not alter the existing `hello@spottr.ro` row.
Immediately use the password-reset flow through the verified mailbox to assign a
new unique password. Review authentication logs and known administrator rows.
Then rotate `JWT_SECRET` and redeploy every API task so every session issued
before the password rotation is invalidated. This is mandatory because an
attacker could have obtained a token at any point before the administrator
password was changed. Do not rely only on waiting for token expiry.

For a fresh environment, migrations intentionally create no administrator:

1. Register and activate a normal account through the application.
2. During an approved maintenance operation, first resolve and record the exact
   UUID and case-sensitive email of the intended active account:

   ```sql
   SELECT id, email, role, is_active
   FROM users
   WHERE email = 'approved-admin@example.com';
   ```

   Abort and investigate if this does not identify exactly one expected row.
3. Promote only that immutable UUID, with the exact email as a second guard:

   ```sql
   UPDATE users
   SET role = 'admin'
   WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
     AND email = 'approved-admin@example.com'
     AND is_active IS TRUE
   RETURNING id, email, role, is_active;
   ```

   Commit only if `RETURNING` produces exactly one row; otherwise roll back and
   investigate. Never select a privileged target through case-folded email.
4. Record who approved the operation and remove any temporary database access.

This process never creates or overwrites an administrator password in a
migration.

## Local setup

Set a unique local `DB_PASSWORD` of at least 16 characters. `task db:setup`
loads it from the ignored repository `.env`; when `setup_db.ps1` is invoked
directly, set it in that PowerShell process environment first. Both the Windows
and macOS setup paths pass the value to `psql` through the environment, not
through command-line arguments. Local loopback connections may use
`DB_SSLMODE=disable`.

## Verification

Run from `api`:

```powershell
go test ./...
go vet ./...
```

No new production migration is required for an already migrated database. The
modified historical migration affects only fresh databases that have not yet
recorded version `20260909120000`.
