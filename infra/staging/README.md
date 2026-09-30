# SPOTTR staging

Staging is intentionally small and reuses the production VPC, Application Load
Balancer, ECS cluster, and RDS **instance**. It does not reuse production data,
credentials, webhooks, media, or Stripe Connect accounts.

## Isolation boundary

The staging API must have its own:

- PostgreSQL database and login (`spottr_staging` / `spottr_staging_api`);
- Secrets Manager secret;
- Stripe sandbox secret key and two sandbox webhook signing secrets;
- Stripe Connect accounts created while the API uses the sandbox key;
- S3 bucket;
- ECS task definition, service, target group, log group, and hostname;
- JWT and invoicing encryption keys.

Do not point staging at the production database even temporarily. Finance,
inventory, organizer Connect IDs, refunds, and several background workers are
database-backed; mixing environments would make test activity visible to the
live application.

## Low-cost operating model

Keep the staging ECS service at desired count `0` when it is not in use. Start
one task only for a test session. The existing ALB and RDS instance continue to
carry their normal cost; staging adds Fargate runtime only while its task is
running, plus small S3, CloudWatch Logs, Secrets Manager, and target-group usage.

The initial environment uses:

- API: `https://api-staging.spottr.ro`;
- web app: local development with
  `NEXT_PUBLIC_API_URL=https://api-staging.spottr.ro/api/v1`;
- API CORS origin: the exact local or hosted staging web origin selected during
  deployment.

A hosted `staging.spottr.ro` frontend can be added later without changing the
database or Stripe setup.

## Safety defaults

- `EVENT_BANNER_GC_ENABLED=false` for the first deployment;
- platform commission invoicing disabled;
- no production SMTP credentials; use a test inbox or an explicit recipient
  allow-list;
- a dedicated media bucket;
- Stripe keys beginning with `sk_test_` only;
- ECS desired count `0` by default;
- no secret values in task-definition environment variables or repository
  files; ECS injects them from Secrets Manager.

## Deployment order

1. Discover and record the existing VPC, private subnets, ECS task security
   group, HTTPS listener, ALB DNS/hosted-zone IDs, RDS endpoint, and task roles.
   After `aws login`, run:

   ```powershell
   ./infra/staging/Get-SpottrAwsInventory.ps1 |
     Set-Content -Encoding utf8 ./infra/staging/aws-inventory.local.json
   ```

   Keep the generated inventory local; it is ignored by Git and contains no
   secret values.
2. Create the staging Secrets Manager secret and dedicated S3 bucket.
3. Create the staging PostgreSQL login/database from a one-off maintenance task.
4. Run all Goose migrations against `spottr_staging`.
5. Create the staging target group, listener rule, DNS record, task definition,
   and ECS service with desired count `0`.
6. Put the Stripe sandbox key and sandbox webhook signing secrets in the staging
   secret. Never copy their live equivalents.
7. Scale staging to one task, wait for a healthy target, and run smoke tests.
8. Scale it back to zero after testing.

The CloudFormation parameter defaults were captured from the existing AWS
account on 2026-09-29 so the staging service inherits the established network
boundary. Run the inventory script again and compare those defaults before a
future deployment if production networking has changed.

## Current DNS records

DNS for `spottr.ro` is hosted outside Route53. Add these CNAME records in the
same DNS control panel that owns the current `api.spottr.ro` record:

| Purpose | Name | Target |
| --- | --- | --- |
| ACM validation | `_0b3ab458a20c9c48c862e6ab4b760775.api-staging.spottr.ro` | `_73860ccd237d40cf4a682d7ed2441355.wzccmgtwzk.acm-validations.aws` |
| Staging API | `api-staging.spottr.ro` | `pulse-api-alb-754245481.eu-central-1.elb.amazonaws.com` |

Some DNS panels want only the host portion (`_0b3ab...api-staging` and
`api-staging`) and automatically append `.spottr.ro`. Do not append a second
copy of the domain. Keep the ACM validation record permanently so AWS can renew
the certificate.

## CloudFormation

The template is `infra/cloudformation/staging-api.yml`. It defaults to zero API
tasks and creates no production-data access. Deploy it only after the ACM
certificate reports `ISSUED`:

```powershell
aws cloudformation deploy `
  --region eu-central-1 `
  --stack-name spottr-staging-api `
  --template-file ./infra/cloudformation/staging-api.yml `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides `
    ApiImageUri=959222626220.dkr.ecr.eu-central-1.amazonaws.com/pulse-api@sha256:8c32745525cb0e4a97437dcf8205606e8f1c444e840f587a4d8c87e8d48a0280
```

After deployment, use the stack output task definitions to run the database
bootstrap once and Goose migrations after every backend release. Do not start
the API service until both tasks have exited with code zero and the Stripe
sandbox secrets have been configured.

```powershell
./infra/staging/Invoke-SpottrStagingTask.ps1 -Mode BootstrapDatabase
./infra/staging/Invoke-SpottrStagingTask.ps1 -Mode Migrate
```

Start staging for a test session and stop it afterwards:

```powershell
./infra/staging/Set-SpottrStagingCapacity.ps1 -DesiredCount 1
./infra/staging/Set-SpottrStagingCapacity.ps1 -DesiredCount 0
```

## Stripe sandbox secrets

Open `pulse-api/app-staging` in AWS Secrets Manager and edit its key/value
pairs. Do not put these values in Git, shell scripts, tickets, or chat:

- `STRIPE_SECRET_KEY`: the Stripe sandbox `sk_test_...` key;
- `STRIPE_WEBHOOK_SECRET`: signing secret for the platform-account endpoint;
- `STRIPE_CONNECT_WEBHOOK_SECRET`: signing secret for the connected-accounts
  endpoint;
- `INVOICING_ENCRYPTION_KEY`: a separate base64-encoded 32-byte key;
- `SMTP_PASSWORD`: leave empty until a test-only mail provider is configured.

Generate the invoicing key in Windows PowerShell and paste the output directly
into Secrets Manager:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($bytes)
  [Convert]::ToBase64String($bytes)
} finally {
  $rng.Dispose()
  [Array]::Clear($bytes, 0, $bytes.Length)
}
```

Create these webhook destinations in Stripe while the Dashboard is in test
mode:

1. Platform account:
   `https://api-staging.spottr.ro/api/v1/stripe/webhook`
2. Events on connected accounts:
   `https://api-staging.spottr.ro/api/v1/stripe/connect/webhook`

For the second destination, explicitly select **Events on connected accounts**.
An ordinary account destination pointed at the Connect URL is not equivalent
and direct-charge events from organizers will never reach SPOTTR. Stripe's
webhook endpoint response does not echo the create-only `connect` parameter, so
verify this configuration by delivering a real test event from a connected
account. Recreate the destination if it was created in the wrong mode.

The platform endpoint needs:

- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.payment_failed`
- `charge.refunded`
- `refund.created`
- `refund.updated`
- `refund.failed`

The connected-accounts endpoint needs the same payment/refund events plus:

- `account.updated`
- `account.application.deauthorized`

After saving the three Stripe values, start the staging service. ECS injects
the latest secret version whenever it starts a new task.

## Local web app against staging

The initial API configuration redirects Stripe Checkout back to
`http://localhost:3000`. Start the web app locally with:

```powershell
$env:NEXT_PUBLIC_API_URL = "https://api-staging.spottr.ro/api/v1"
pnpm.cmd --filter @apps/pulse-app dev
```

For testing from a phone, add a stable hosted staging frontend later and update
the CloudFormation `StagingAppUrl` parameter to that exact HTTPS origin.
