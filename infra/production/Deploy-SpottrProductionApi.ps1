[CmdletBinding()]
param(
    [switch]$ConfirmProductionDeploy
)

$ErrorActionPreference = "Stop"

# Production targets are intentionally fixed. The script must not accept an
# account, cluster, service, repository, or health URL from its caller.
$Region = "eu-central-1"
$ExpectedAwsAccountId = "959222626220"
$EcrRepositoryName = "pulse-api"
$ClusterName = "pulse-cluster"
$ServiceName = "pulse-api-service"
$ExpectedTaskFamily = "pulse-api"
$ExpectedDatabaseName = "pulse_db"
$HealthUrl = "https://api.spottr.ro/health"
$DeploymentLockName = "/spottr/deploy-locks/api-production"
$StagingDeploymentLockName = "/spottr/deploy-locks/api-staging"
$VerifiedCommitParameter = "/spottr/deployments/staging/verified-commit"

$temporaryFiles = [System.Collections.Generic.List[string]]::new()
$deploymentLockAcquired = $false
$productionChanged = $false
$deploymentSucceeded = $false
$migrationTaskArn = $null
$currentTaskDefinitionArn = $null
$newTaskDefinitionArn = $null

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][string[]]$Arguments,
        [string]$FailureMessage = "Command failed."
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function New-TemporaryJsonFile {
    param(
        [Parameter(Mandatory)][object]$Value,
        [Parameter(Mandatory)][string]$Prefix
    )

    $path = [System.IO.Path]::Combine(
        [System.IO.Path]::GetTempPath(),
        "$Prefix-$([guid]::NewGuid().ToString('N')).json"
    )
    $json = $Value | ConvertTo-Json -Depth 100 -Compress
    [System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))
    $temporaryFiles.Add($path)
    return $path
}

function Get-AwsJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $raw = & aws @Arguments --region $Region --output json
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')"
    }
    return $raw | ConvertFrom-Json
}

function Get-ProductionService {
    $response = Get-AwsJson -Arguments @(
        "ecs", "describe-services",
        "--cluster", $ClusterName,
        "--services", $ServiceName
    )
    if ($response.failures.Count -gt 0 -or $response.services.Count -ne 1) {
        throw "Expected exactly one ECS service named $ServiceName in cluster $ClusterName."
    }
    return $response.services[0]
}

function Get-DeploymentConfigurationArgument {
    param(
        [Parameter(Mandatory)][bool]$EnableCircuitBreaker,
        [Parameter(Mandatory)][bool]$EnableRollback,
        [Parameter(Mandatory)][int]$MinimumHealthyPercent,
        [Parameter(Mandatory)][int]$MaximumPercent
    )

    $enable = $EnableCircuitBreaker.ToString().ToLowerInvariant()
    $rollback = $EnableRollback.ToString().ToLowerInvariant()
    return "deploymentCircuitBreaker={enable=$enable,rollback=$rollback},maximumPercent=$MaximumPercent,minimumHealthyPercent=$MinimumHealthyPercent"
}

function Test-AlarmRollbackEnabled {
    param([object]$DeploymentConfiguration)

    return (
        $null -ne $DeploymentConfiguration.alarms -and
        [bool]$DeploymentConfiguration.alarms.enable -and
        [bool]$DeploymentConfiguration.alarms.rollback
    )
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repositoryRoot
try {
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne "main") {
        throw "Production deploys must be run from main. Current branch: '$branch'."
    }

    $worktreeStatus = & git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw "The Git worktree status could not be read."
    }
    if ($worktreeStatus) {
        throw "Commit or discard all local changes before deploying production."
    }

    Invoke-CheckedCommand -Executable "git" -Arguments @("fetch", "origin", "main") `
        -FailureMessage "origin/main could not be refreshed."
    $fullCommit = (& git rev-parse HEAD).Trim()
    $originMainCommit = (& git rev-parse origin/main).Trim()
    if ($LASTEXITCODE -ne 0 -or $fullCommit -notmatch "^[0-9a-f]{40}$" -or $fullCommit -ne $originMainCommit) {
        throw "Local main must exactly match origin/main before a production deploy."
    }
    $shortCommit = (& git rev-parse --short=12 HEAD).Trim()

    if (-not $ConfirmProductionDeploy) {
        $answer = Read-Host "Type DEPLOY PRODUCTION to deploy commit $shortCommit"
        if ($answer -cne "DEPLOY PRODUCTION") {
            throw "Production deployment cancelled."
        }
    }

    $identity = Get-AwsJson -Arguments @("sts", "get-caller-identity")
    if ($identity.Account -ne $ExpectedAwsAccountId) {
        throw "Refusing to deploy to AWS account $($identity.Account); expected $ExpectedAwsAccountId."
    }

    $resourceId = "service/$ClusterName/$ServiceName"
    $scalableTargets = (Get-AwsJson -Arguments @(
        "application-autoscaling", "describe-scalable-targets",
        "--service-namespace", "ecs",
        "--resource-ids", $resourceId
    )).ScalableTargets
    $scheduledActions = (Get-AwsJson -Arguments @(
        "application-autoscaling", "describe-scheduled-actions",
        "--service-namespace", "ecs",
        "--resource-id", $resourceId
    )).ScheduledActions
    if (@($scalableTargets).Count -gt 0 -or @($scheduledActions).Count -gt 0) {
        throw "Refusing deployment because autoscaling or scheduled actions could restart production during migrations."
    }

    $activeStagingLocks = (Get-AwsJson -Arguments @(
        "ssm", "get-parameters",
        "--names", $StagingDeploymentLockName
    )).Parameters
    if (@($activeStagingLocks).Count -gt 0) {
        throw "A staging deployment is active or awaiting recovery. Production is blocked."
    }

    $verifiedMarker = (Get-AwsJson -Arguments @(
        "ssm", "get-parameter",
        "--name", $VerifiedCommitParameter
    )).Parameter.Value
    $markerMatch = [regex]::Match(
        $verifiedMarker,
        "^(?<commit>[0-9a-f]{40})\|(?<digest>sha256:[0-9a-f]{64})$"
    )
    if (-not $markerMatch.Success) {
        throw "No valid staging verification marker exists. Deploy this exact commit to staging first."
    }
    $verifiedCommit = $markerMatch.Groups["commit"].Value
    if ($verifiedCommit -ne $fullCommit) {
        throw "Production commit $fullCommit was not the commit last verified in staging ($verifiedCommit)."
    }
    $stagingDigest = $markerMatch.Groups["digest"].Value

    $lockValue = "$env:COMPUTERNAME|$env:USERNAME|$fullCommit|$([DateTime]::UtcNow.ToString('o'))"
    & aws ssm put-parameter `
        --name $DeploymentLockName `
        --type String `
        --value $lockValue `
        --region $Region `
        --output json | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Another production deployment may be active. Inspect SSM parameter $DeploymentLockName before retrying."
    }
    $deploymentLockAcquired = $true

    $service = Get-ProductionService
    if (
        $service.status -ne "ACTIVE" -or
        $service.desiredCount -lt 1 -or
        $service.pendingCount -ne 0 -or
        @($service.deployments).Count -ne 1
    ) {
        throw "The production ECS service is not in a stable, running state."
    }
    $primary = @($service.deployments | Where-Object status -eq "PRIMARY")
    if ($primary.Count -ne 1 -or $primary[0].rolloutState -ne "COMPLETED") {
        throw "The production ECS PRIMARY deployment is not complete."
    }

    $originalDesiredCount = [int]$service.desiredCount
    $currentTaskDefinitionArn = $service.taskDefinition
    $network = $service.networkConfiguration.awsvpcConfiguration
    if ($null -eq $network) {
        throw "The production service network configuration could not be read."
    }

    $originalDeploymentConfiguration = $service.deploymentConfiguration
    if (Test-AlarmRollbackEnabled -DeploymentConfiguration $originalDeploymentConfiguration) {
        throw "Production has CloudWatch alarm rollback enabled. Disable it before using this migration deploy workflow."
    }
    $originalCircuitBreakerEnabled = [bool]$originalDeploymentConfiguration.deploymentCircuitBreaker.enable
    $originalRollbackEnabled = [bool]$originalDeploymentConfiguration.deploymentCircuitBreaker.rollback
    $originalMinimumHealthyPercent = [int]$originalDeploymentConfiguration.minimumHealthyPercent
    $originalMaximumPercent = [int]$originalDeploymentConfiguration.maximumPercent
    $failClosedDeploymentConfiguration = Get-DeploymentConfigurationArgument `
        -EnableCircuitBreaker $true `
        -EnableRollback $false `
        -MinimumHealthyPercent $originalMinimumHealthyPercent `
        -MaximumPercent $originalMaximumPercent
    $restoreDeploymentConfiguration = Get-DeploymentConfigurationArgument `
        -EnableCircuitBreaker $originalCircuitBreakerEnabled `
        -EnableRollback $originalRollbackEnabled `
        -MinimumHealthyPercent $originalMinimumHealthyPercent `
        -MaximumPercent $originalMaximumPercent

    Write-Host "Running the production API test suite..."
    Push-Location "api"
    try {
        Invoke-CheckedCommand -Executable "go" -Arguments @("test", "./...") `
            -FailureMessage "The API tests failed. Production was not changed."
    } finally {
        Pop-Location
    }

    $registry = "$ExpectedAwsAccountId.dkr.ecr.$Region.amazonaws.com"
    $stagingImageTag = "staging-$shortCommit"
    $imageDetails = (Get-AwsJson -Arguments @(
        "ecr", "describe-images",
        "--repository-name", $EcrRepositoryName,
        "--image-ids", "imageDigest=$stagingDigest"
    )).imageDetails
    if (
        @($imageDetails).Count -ne 1 -or
        $imageDetails[0].imageDigest -ne $stagingDigest -or
        $stagingImageTag -notin @($imageDetails[0].imageTags)
    ) {
        throw "The exact staging-tested image digest is missing or no longer has tag $stagingImageTag."
    }
    $immutableImage = "$registry/$EcrRepositoryName@$stagingDigest"
    Write-Host "Promoting the exact staging-tested image $immutableImage."

    # Re-read the service so a concurrent manual change cannot be silently
    # overwritten.
    $serviceBeforeChange = Get-ProductionService
    if (
        $serviceBeforeChange.taskDefinition -ne $currentTaskDefinitionArn -or
        $serviceBeforeChange.desiredCount -ne $originalDesiredCount -or
        $serviceBeforeChange.pendingCount -ne 0 -or
        @($serviceBeforeChange.deployments).Count -ne 1
    ) {
        throw "Production changed during deployment preflight. Nothing was deployed."
    }
    if (Test-AlarmRollbackEnabled -DeploymentConfiguration $serviceBeforeChange.deploymentConfiguration) {
        throw "CloudWatch alarm rollback was enabled during preflight. Nothing was deployed."
    }

    $described = Get-AwsJson -Arguments @(
        "ecs", "describe-task-definition",
        "--task-definition", $currentTaskDefinitionArn,
        "--include", "TAGS"
    )
    $taskDefinition = $described.taskDefinition
    if ($taskDefinition.family -ne $ExpectedTaskFamily) {
        throw "Refusing to clone unexpected task family '$($taskDefinition.family)'."
    }
    $apiContainers = @($taskDefinition.containerDefinitions | Where-Object name -eq "pulse-api")
    if ($apiContainers.Count -ne 1) {
        throw "Expected exactly one pulse-api container in $currentTaskDefinitionArn."
    }
    $databaseNameValues = @($apiContainers[0].environment | Where-Object name -eq "DB_NAME")
    if ($databaseNameValues.Count -ne 1 -or $databaseNameValues[0].value -ne $ExpectedDatabaseName) {
        throw "Refusing to deploy: the task definition does not target production database $ExpectedDatabaseName."
    }
    $stagingSecretReferences = @($apiContainers[0].secrets | Where-Object { $_.valueFrom -match "staging|app-staging" })
    if ($stagingSecretReferences.Count -gt 0) {
        throw "Refusing to deploy: the production task definition references a staging secret."
    }
    $apiContainers[0].image = $immutableImage

    $registerPayload = [ordered]@{
        family = $taskDefinition.family
        taskRoleArn = $taskDefinition.taskRoleArn
        executionRoleArn = $taskDefinition.executionRoleArn
        networkMode = $taskDefinition.networkMode
        containerDefinitions = $taskDefinition.containerDefinitions
        volumes = @($taskDefinition.volumes)
        placementConstraints = @($taskDefinition.placementConstraints)
        requiresCompatibilities = @($taskDefinition.requiresCompatibilities)
        cpu = $taskDefinition.cpu
        memory = $taskDefinition.memory
        runtimePlatform = $taskDefinition.runtimePlatform
        tags = @($described.tags)
    }
    foreach ($optionalProperty in @(
        "pidMode",
        "ipcMode",
        "proxyConfiguration",
        "inferenceAccelerators",
        "ephemeralStorage"
    )) {
        if ($null -ne $taskDefinition.$optionalProperty) {
            $registerPayload[$optionalProperty] = $taskDefinition.$optionalProperty
        }
    }

    $registrationFile = New-TemporaryJsonFile -Value $registerPayload -Prefix "spottr-prod-task-definition"
    $registered = Get-AwsJson -Arguments @(
        "ecs", "register-task-definition",
        "--cli-input-json", "file://$registrationFile"
    )
    $newTaskDefinitionArn = $registered.taskDefinition.taskDefinitionArn
    if ([string]::IsNullOrWhiteSpace($newTaskDefinitionArn)) {
        throw "The new production task definition was not registered."
    }

    # From this point onward failures retain the deployment lock. Automatic
    # rollback is disabled because reverting code after a forward-only database
    # migration could make the old application incompatible with the new schema.
    $productionChanged = $true
    Write-Host "Disabling automatic rollback and stopping the production API..."
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "update-service",
        "--cluster", $ClusterName,
        "--service", $ServiceName,
        "--desired-count", "0",
        "--deployment-configuration", $failClosedDeploymentConfiguration,
        "--region", $Region,
        "--output", "json",
        "--query", "service.{serviceName:serviceName,desiredCount:desiredCount,taskDefinition:taskDefinition}"
    ) -FailureMessage "The production API could not be stopped safely."
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "wait", "services-stable",
        "--cluster", $ClusterName,
        "--services", $ServiceName,
        "--region", $Region
    ) -FailureMessage "The production API did not stop cleanly."

    $stoppedService = Get-ProductionService
    if ($stoppedService.desiredCount -ne 0 -or $stoppedService.runningCount -ne 0 -or $stoppedService.pendingCount -ne 0) {
        throw "Production is not fully stopped; migrations were not started."
    }
    if (
        [bool]$stoppedService.deploymentConfiguration.deploymentCircuitBreaker.rollback -or
        (Test-AlarmRollbackEnabled -DeploymentConfiguration $stoppedService.deploymentConfiguration)
    ) {
        throw "An automatic rollback mechanism is still active; migrations were not started."
    }

    $migrationCommand = 'export PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$DB_USER" PGPASSWORD="$DB_PASSWORD" PGDATABASE="$DB_NAME" PGSSLMODE="$DB_SSLMODE" PGSSLROOTCERT="${DB_SSLROOTCERT:-/etc/ssl/certs/aws-rds-global-bundle.pem}"; export GOOSE_DRIVER=postgres; export GOOSE_DBSTRING="host=$DB_HOST port=$DB_PORT user=$DB_USER dbname=$DB_NAME sslmode=$DB_SSLMODE sslrootcert=$PGSSLROOTCERT"; exec /goose -dir /migrations up'
    $overrides = @{
        containerOverrides = @(
            @{
                name = "pulse-api"
                command = @("/bin/sh", "-ceu", $migrationCommand)
            }
        )
    }
    $overridesFile = New-TemporaryJsonFile -Value $overrides -Prefix "spottr-prod-migration-overrides"
    $subnets = @($network.subnets) -join ","
    $securityGroups = @($network.securityGroups) -join ","
    $networkConfiguration = "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$securityGroups],assignPublicIp=$($network.assignPublicIp)}"

    Write-Host "Running Goose migrations against the production database..."
    $run = Get-AwsJson -Arguments @(
        "ecs", "run-task",
        "--cluster", $ClusterName,
        "--task-definition", $newTaskDefinitionArn,
        "--capacity-provider-strategy", "capacityProvider=FARGATE,weight=1",
        "--network-configuration", $networkConfiguration,
        "--overrides", "file://$overridesFile",
        "--started-by", "spottr-prod-migrate-$shortCommit"
    )
    if ($run.failures.Count -gt 0 -or $run.tasks.Count -ne 1) {
        throw "ECS did not start the production migration task: $($run.failures | ConvertTo-Json -Compress)"
    }
    $migrationTaskArn = $run.tasks[0].taskArn
    Write-Host "Production migration task: $migrationTaskArn"
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "wait", "tasks-stopped",
        "--cluster", $ClusterName,
        "--tasks", $migrationTaskArn,
        "--region", $Region
    ) -FailureMessage "Timed out waiting for the production migration task."
    $migrationTask = (Get-AwsJson -Arguments @(
        "ecs", "describe-tasks",
        "--cluster", $ClusterName,
        "--tasks", $migrationTaskArn
    )).tasks[0]
    $migrationContainer = $migrationTask.containers | Where-Object name -eq "pulse-api" | Select-Object -First 1
    if ($null -eq $migrationContainer -or $migrationContainer.exitCode -ne 0) {
        throw "Production migrations failed. The API remains stopped; inspect task $migrationTaskArn and /ecs/pulse-api."
    }

    Write-Host "Deploying the new production API task definition with automatic rollback still disabled..."
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "update-service",
        "--cluster", $ClusterName,
        "--service", $ServiceName,
        "--task-definition", $newTaskDefinitionArn,
        "--desired-count", $originalDesiredCount.ToString(),
        "--deployment-configuration", $failClosedDeploymentConfiguration,
        "--region", $Region,
        "--output", "json",
        "--query", "service.{serviceName:serviceName,desiredCount:desiredCount,taskDefinition:taskDefinition}"
    ) -FailureMessage "The production service could not be updated."
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "wait", "services-stable",
        "--cluster", $ClusterName,
        "--services", $ServiceName,
        "--region", $Region
    ) -FailureMessage "The production deployment did not stabilize. Automatic rollback remains disabled."

    $deployedService = Get-ProductionService
    $primaryDeployment = @($deployedService.deployments | Where-Object status -eq "PRIMARY")
    if (
        $deployedService.taskDefinition -ne $newTaskDefinitionArn -or
        $deployedService.desiredCount -ne $originalDesiredCount -or
        $deployedService.runningCount -ne $originalDesiredCount -or
        $deployedService.pendingCount -ne 0 -or
        $primaryDeployment.Count -ne 1 -or
        $primaryDeployment[0].taskDefinition -ne $newTaskDefinitionArn -or
        $primaryDeployment[0].rolloutState -ne "COMPLETED" -or
        [bool]$deployedService.deploymentConfiguration.deploymentCircuitBreaker.rollback -or
        (Test-AlarmRollbackEnabled -DeploymentConfiguration $deployedService.deploymentConfiguration)
    ) {
        throw "Production did not stabilize on the expected task definition $newTaskDefinitionArn."
    }

    $runningTaskArns = @((Get-AwsJson -Arguments @(
        "ecs", "list-tasks",
        "--cluster", $ClusterName,
        "--service-name", $ServiceName,
        "--desired-status", "RUNNING"
    )).taskArns)
    if ($runningTaskArns.Count -ne $originalDesiredCount) {
        throw "Expected $originalDesiredCount running production task(s), found $($runningTaskArns.Count)."
    }
    $describeRunningTasksArguments = @(
        "ecs", "describe-tasks",
        "--cluster", $ClusterName,
        "--tasks"
    ) + @($runningTaskArns)
    $runningTasks = @((Get-AwsJson -Arguments $describeRunningTasksArguments).tasks)
    $unexpectedTasks = @($runningTasks | Where-Object {
        $_.lastStatus -ne "RUNNING" -or $_.taskDefinitionArn -ne $newTaskDefinitionArn
    })
    if ($unexpectedTasks.Count -gt 0) {
        throw "At least one production task is not running the expected task definition."
    }

    $health = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 30
    if ($health.status -ne "healthy") {
        throw "The production API did not return a healthy status."
    }

    Write-Host "Restoring the original ECS deployment policy after successful health checks..."
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "update-service",
        "--cluster", $ClusterName,
        "--service", $ServiceName,
        "--deployment-configuration", $restoreDeploymentConfiguration,
        "--region", $Region,
        "--output", "json",
        "--query", "service.{serviceName:serviceName,taskDefinition:taskDefinition,deploymentConfiguration:deploymentConfiguration}"
    ) -FailureMessage "The application is healthy, but the original ECS deployment policy could not be restored."
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "wait", "services-stable",
        "--cluster", $ClusterName,
        "--services", $ServiceName,
        "--region", $Region
    ) -FailureMessage "Production is healthy, but ECS did not stabilize after restoring its deployment policy."

    $finalService = Get-ProductionService
    if (
        $finalService.taskDefinition -ne $newTaskDefinitionArn -or
        [bool]$finalService.deploymentConfiguration.deploymentCircuitBreaker.enable -ne $originalCircuitBreakerEnabled -or
        [bool]$finalService.deploymentConfiguration.deploymentCircuitBreaker.rollback -ne $originalRollbackEnabled
    ) {
        throw "The final production task definition or deployment policy does not match the expected state."
    }

    $deploymentSucceeded = $true
    [pscustomobject]@{
        branch = $branch
        commit = $fullCommit
        image = $immutableImage
        stagingImageDigest = $stagingDigest
        previousTaskDefinition = $currentTaskDefinitionArn
        taskDefinition = $newTaskDefinitionArn
        migrationTask = $migrationTaskArn
        service = $ServiceName
        health = $health.status
    } | ConvertTo-Json
} catch {
    if ($productionChanged) {
        Write-Warning "Production changed before the failure. Automatic recovery is intentionally disabled after migrations."
        Write-Warning "Previous task definition: $currentTaskDefinitionArn"
        Write-Warning "New task definition: $newTaskDefinitionArn"
        Write-Warning "Migration task: $migrationTaskArn"
        Write-Warning "Inspect schema compatibility, ECS tasks, and logs before any restart or rollback."
    }
    throw
} finally {
    foreach ($path in $temporaryFiles) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force
        }
    }

    if ($deploymentLockAcquired -and ($deploymentSucceeded -or -not $productionChanged)) {
        & aws ssm delete-parameter --name $DeploymentLockName --region $Region --output json | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not release deployment lock $DeploymentLockName. Remove it only after confirming no deployment is active."
        }
    } elseif ($deploymentLockAcquired) {
        Write-Warning "Deployment lock $DeploymentLockName was retained because production changed before failure."
    }
    Pop-Location
}
