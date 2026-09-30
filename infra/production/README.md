# SPOTTR production deployment

Production and staging deliberately use different deployment entry points.
Never adapt the staging CloudFormation stack to target the live service.

## API deployment

The production deploy must start from a clean `main` branch that exactly
matches `origin/main`. AWS authentication must be available.
The exact commit must first complete the staging deployment successfully. A
merge or squash that creates a new commit must be deployed to staging again
before it can go to production.

```powershell
git switch main
git pull --ff-only origin main
task deploy:production
```

The task invokes `infra/production/Deploy-SpottrProductionApi.ps1`.

The script asks the operator to type `DEPLOY PRODUCTION`. For explicitly
authorized non-interactive automation, pass `-ConfirmProductionDeploy`.

The workflow verifies the staging marker in SSM, refuses concurrent staging or
production deploys and autoscaling, and runs the Go tests. Production does not
rebuild the container: it verifies and promotes the exact immutable ECR digest
that passed the staging migration and health checks. This avoids deploying a
different artifact produced from mutable base images or build inputs. It then
validates the current service, task family, production database name, and
secret references before cloning the active task definition and changing only
the image.

Immediately before shutdown, the script verifies CloudWatch alarm rollback is
not active and disables ECS circuit-breaker rollback. It then stops the API and
verifies there are zero desired, running, and pending tasks before running
Goose with the new image. This fail-closed policy prevents ECS from silently
starting old code after a forward-only schema migration. The script deploys
only `pulse-api-service`, verifies every running task uses the new task
definition, checks `https://api.spottr.ro/health`, and only then restores the
service's original deployment policy.

There is intentional API downtime while production migrations run. If a
migration fails, the script leaves the API stopped so an operator can inspect
the database and logs before deciding whether the old application is safe to
restart.

The production deployment lock is
`/spottr/deploy-locks/api-production`. It is released after a clean success or
a failure that occurred before production changed. Once shutdown begins, a
failure intentionally retains the lock and prints the old task definition, new
task definition, and migration task ARN. Do not blindly restart or roll back:

1. inspect the migration task and `/ecs/pulse-api` logs;
2. establish which migrations committed and whether the old application is
   compatible with that schema;
3. inspect the ECS service, desired/running counts, tasks, and events;
4. either repair and deploy the new revision or perform an explicitly reviewed
   database/application recovery;
5. delete the SSM lock only after the service is healthy and no deployment is
   active.

Frontend production deployment remains owned by the Vercel production branch;
this script deploys only the Go API.
