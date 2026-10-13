[CmdletBinding()]
param(
    [ValidatePattern("^$|^pk_test_[A-Za-z0-9]+$")]
    [string]$StripePublishableKey,
    [ValidatePattern("^$|^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$")]
    [string]$ExpoPushProjectId,
    [ValidatePattern("^$|^arn:aws:secretsmanager:eu-central-1:959222626220:secret:spottr/staging/expo-push-[a-zA-Z0-9_-]+$")]
    [string]$ExpoPushAccessTokenSecretArn
)

$ErrorActionPreference = "Stop"

# Deployment targets are intentionally fixed. A typo or an injected parameter must
# never turn a staging deployment into a production deployment.
$Region = "eu-central-1"
$ExpectedAwsAccountId = "959222626220"
$EcrRepositoryName = "pulse-api"
$StackName = "spottr-staging-api"
$ClusterName = "pulse-cluster"
$ServiceName = "pulse-api-staging-service"
$StagingAppUrl = "https://dev.spottr.ro"
$HealthUrl = "https://api-staging.spottr.ro/health"
$DeploymentLockName = "/spottr/deploy-locks/api-staging"
$VerifiedCommitParameter = "/spottr/deployments/staging/verified-commit"

$deploymentLockAcquired = $false
$environmentChanged = $false
$deploymentSucceeded = $false

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

function Get-AwsJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $raw = & aws @Arguments --region $Region --output json
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')"
    }
    return $raw | ConvertFrom-Json
}

function Get-StackOutputs {
    $stackResponse = Get-AwsJson -Arguments @(
        "cloudformation", "describe-stacks",
        "--stack-name", $StackName
    )
    if ($stackResponse.Stacks.Count -ne 1) {
        throw "Expected exactly one CloudFormation stack named $StackName."
    }
    $stack = $stackResponse.Stacks[0]
    if ($stack.StackStatus -notmatch "_COMPLETE$") {
        throw "Stack $StackName is not stable: $($stack.StackStatus)."
    }

    $outputs = @{}
    foreach ($output in $stack.Outputs) {
        $outputs[$output.OutputKey] = $output.OutputValue
    }
    return $outputs
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repositoryRoot
try {
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne "staging") {
        throw "Staging deploys must be run from the staging branch. Current branch: '$branch'."
    }

    $worktreeStatus = & git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw "The Git worktree status could not be read."
    }
    if ($worktreeStatus) {
        throw "Commit or discard all local changes before deploying staging. The image must map to one Git commit."
    }

    $fullCommit = (& git rev-parse HEAD).Trim()
    $shortCommit = (& git rev-parse --short=12 HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $fullCommit -notmatch "^[0-9a-f]{40}$") {
        throw "The current Git commit could not be determined."
    }

    $identity = Get-AwsJson -Arguments @("sts", "get-caller-identity")
    if ($identity.Account -ne $ExpectedAwsAccountId) {
        throw "Refusing to deploy to AWS account $($identity.Account); expected $ExpectedAwsAccountId."
    }

    $outputs = Get-StackOutputs
    if ($outputs.ServiceName -ne $ServiceName) {
        throw "Stack $StackName targets service '$($outputs.ServiceName)', not expected service '$ServiceName'."
    }

    $service = (Get-AwsJson -Arguments @(
        "ecs", "describe-services",
        "--cluster", $ClusterName,
        "--services", $ServiceName
    )).services[0]
    if ($null -eq $service -or $service.status -ne "ACTIVE") {
        throw "The staging ECS service is not active."
    }
    if ($service.pendingCount -ne 0 -or @($service.deployments).Count -ne 1) {
        throw "The staging ECS service already has pending work or multiple deployments. Wait for it to stabilize."
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
        throw "Refusing deployment because autoscaling or scheduled actions could restart staging during migrations."
    }

    $lockValue = "$env:COMPUTERNAME|$env:USERNAME|$fullCommit|$([DateTime]::UtcNow.ToString('o'))"
    & aws ssm put-parameter `
        --name $DeploymentLockName `
        --type String `
        --value $lockValue `
        --region $Region `
        --output json | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Another staging deployment may be active. Inspect SSM parameter $DeploymentLockName before retrying."
    }
    $deploymentLockAcquired = $true

    Write-Host "Running the staging API test suite..."
    Push-Location "api"
    try {
        Invoke-CheckedCommand -Executable "go" -Arguments @("test", "./...") `
            -FailureMessage "The API tests failed. Staging was not changed."
    } finally {
        Pop-Location
    }

    Invoke-CheckedCommand -Executable "docker" -Arguments @("info", "--format", "{{.ServerVersion}}") `
        -FailureMessage "Docker is not running. Start Docker Desktop and try again."

    $registry = "$ExpectedAwsAccountId.dkr.ecr.$Region.amazonaws.com"
    $imageTag = "staging-$shortCommit"
    $taggedImage = "$registry/$EcrRepositoryName`:$imageTag"

    Write-Host "Authenticating Docker to the staging ECR repository..."
    & aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registry
    if ($LASTEXITCODE -ne 0) {
        throw "Docker could not authenticate to ECR."
    }

    Write-Host "Building $taggedImage from commit $shortCommit..."
    Invoke-CheckedCommand -Executable "docker" -Arguments @(
        "build",
        "--platform", "linux/amd64",
        "--file", "api/Dockerfile",
        "--tag", $taggedImage,
        "api"
    ) -FailureMessage "The staging API image build failed."

    Write-Host "Pushing the immutable staging tag..."
    Invoke-CheckedCommand -Executable "docker" -Arguments @("push", $taggedImage) `
        -FailureMessage "The staging API image push failed."

    $digest = (& aws ecr describe-images `
        --repository-name $EcrRepositoryName `
        --image-ids "imageTag=$imageTag" `
        --region $Region `
        --query "imageDetails[0].imageDigest" `
        --output text).Trim()
    if ($LASTEXITCODE -ne 0 -or $digest -notmatch "^sha256:[0-9a-f]{64}$") {
        throw "The pushed image digest could not be verified in ECR."
    }
    $immutableImage = "$registry/$EcrRepositoryName@$digest"

    $deploymentParameters = @(
        "ApiImageUri=$immutableImage",
        "StagingAppUrl=$StagingAppUrl",
        "DesiredCount=0"
    )
    # Omission preserves the existing stack value on routine deployments.
    # The publishable key is public; do not modify the integration SecretString,
    # which would overwrite manually configured Stripe/SMTP secrets with blanks.
    if ($PSBoundParameters.ContainsKey("StripePublishableKey")) {
        $deploymentParameters += "StripePublishableKey=$StripePublishableKey"
    }
    foreach ($pushParameter in @("ExpoPushProjectId", "ExpoPushAccessTokenSecretArn")) {
        if ($PSBoundParameters.ContainsKey($pushParameter)) {
            $deploymentParameters += "$pushParameter=$($PSBoundParameters[$pushParameter])"
        }
    }

    $environmentChanged = $true
    Write-Host "Deploying only CloudFormation stack $StackName with the API stopped..."
    Invoke-CheckedCommand -Executable "aws" -Arguments (@(
        "cloudformation", "deploy",
        "--region", $Region,
        "--stack-name", $StackName,
        "--template-file", "infra/cloudformation/staging-api.yml",
        "--capabilities", "CAPABILITY_NAMED_IAM",
        "--no-fail-on-empty-changeset",
        "--parameter-overrides"
    ) + $deploymentParameters) -FailureMessage "The staging CloudFormation deployment failed."

    # This is required even when CloudFormation reports an empty changeset: the
    # service may have been manually scaled to one after the previous deploy.
    Write-Host "Explicitly stopping the staging API before migrations..."
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "update-service",
        "--cluster", $ClusterName,
        "--service", $ServiceName,
        "--desired-count", "0",
        "--region", $Region,
        "--output", "json",
        "--query", "service.{serviceName:serviceName,desiredCount:desiredCount}"
    ) -FailureMessage "The staging API could not be stopped."
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ecs", "wait", "services-stable",
        "--cluster", $ClusterName,
        "--services", $ServiceName,
        "--region", $Region
    ) -FailureMessage "The staging API did not stop cleanly."

    $stoppedService = (Get-AwsJson -Arguments @(
        "ecs", "describe-services",
        "--cluster", $ClusterName,
        "--services", $ServiceName
    )).services[0]
    if ($stoppedService.desiredCount -ne 0 -or $stoppedService.runningCount -ne 0 -or $stoppedService.pendingCount -ne 0) {
        throw "Staging is not fully stopped; migrations were not started."
    }

    Write-Host "Running database migrations against spottr_staging..."
    & (Join-Path $PSScriptRoot "Invoke-SpottrStagingTask.ps1") `
        -Mode Migrate `
        -Region $Region `
        -StackName $StackName `
        -ClusterName $ClusterName

    Write-Host "Starting the staging API..."
    & (Join-Path $PSScriptRoot "Set-SpottrStagingCapacity.ps1") `
        -DesiredCount 1 `
        -Region $Region `
        -ClusterName $ClusterName `
        -ServiceName $ServiceName

    $outputs = Get-StackOutputs
    $expectedTaskDefinitionArn = $outputs.ApiTaskDefinitionArn
    if ([string]::IsNullOrWhiteSpace($expectedTaskDefinitionArn)) {
        throw "Stack output ApiTaskDefinitionArn is missing."
    }

    $deployedService = (Get-AwsJson -Arguments @(
        "ecs", "describe-services",
        "--cluster", $ClusterName,
        "--services", $ServiceName
    )).services[0]
    $primaryDeployment = @($deployedService.deployments | Where-Object status -eq "PRIMARY")
    if (
        $deployedService.taskDefinition -ne $expectedTaskDefinitionArn -or
        $deployedService.desiredCount -ne 1 -or
        $deployedService.runningCount -ne 1 -or
        $deployedService.pendingCount -ne 0 -or
        $primaryDeployment.Count -ne 1 -or
        $primaryDeployment[0].taskDefinition -ne $expectedTaskDefinitionArn -or
        $primaryDeployment[0].rolloutState -ne "COMPLETED"
    ) {
        throw "Staging did not stabilize on the expected task definition $expectedTaskDefinitionArn."
    }

    $runningTaskArns = @((Get-AwsJson -Arguments @(
        "ecs", "list-tasks",
        "--cluster", $ClusterName,
        "--service-name", $ServiceName,
        "--desired-status", "RUNNING"
    )).taskArns)
    if ($runningTaskArns.Count -ne 1) {
        throw "Expected exactly one running staging task, found $($runningTaskArns.Count)."
    }
    $runningTask = (Get-AwsJson -Arguments @(
        "ecs", "describe-tasks",
        "--cluster", $ClusterName,
        "--tasks", $runningTaskArns[0]
    )).tasks[0]
    if ($runningTask.lastStatus -ne "RUNNING" -or $runningTask.taskDefinitionArn -ne $expectedTaskDefinitionArn) {
        throw "The running staging task does not use the expected task definition."
    }

    $health = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 30
    if ($health.status -ne "healthy") {
        throw "The staging API did not return a healthy status."
    }

    $verifiedValue = "$fullCommit|$digest"
    Invoke-CheckedCommand -Executable "aws" -Arguments @(
        "ssm", "put-parameter",
        "--name", $VerifiedCommitParameter,
        "--type", "String",
        "--value", $verifiedValue,
        "--overwrite",
        "--region", $Region,
        "--output", "json"
    ) -FailureMessage "Staging is healthy, but its verified-commit marker could not be written. Production remains blocked."

    $deploymentSucceeded = $true
    [pscustomobject]@{
        branch = $branch
        commit = $fullCommit
        image = $immutableImage
        stack = $StackName
        service = $ServiceName
        taskDefinition = $expectedTaskDefinitionArn
        health = $health.status
        productionGate = $VerifiedCommitParameter
    } | ConvertTo-Json
} catch {
    if ($environmentChanged) {
        Write-Warning "Staging changed before the failure. It may intentionally remain stopped or unhealthy; inspect ECS and CloudFormation before recovery."
    }
    throw
} finally {
    if ($deploymentLockAcquired -and ($deploymentSucceeded -or -not $environmentChanged)) {
        & aws ssm delete-parameter --name $DeploymentLockName --region $Region --output json | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not release deployment lock $DeploymentLockName. Remove it only after confirming no deployment is active."
        }
    } elseif ($deploymentLockAcquired) {
        Write-Warning "Deployment lock $DeploymentLockName was retained because staging changed before failure."
    }
    Pop-Location
}
