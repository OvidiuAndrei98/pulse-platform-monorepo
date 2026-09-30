[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet("BootstrapDatabase", "Migrate")]
    [string]$Mode,
    [string]$Region = "eu-central-1",
    [string]$StackName = "spottr-staging-api",
    [string]$ClusterName = "pulse-cluster"
)

$ErrorActionPreference = "Stop"

function Invoke-AwsJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $raw = & aws @Arguments --region $Region --output json
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')"
    }
    return $raw | ConvertFrom-Json
}

$stack = Invoke-AwsJson -Arguments @(
    "cloudformation", "describe-stacks",
    "--stack-name", $StackName
)
$outputs = @{}
foreach ($output in $stack.Stacks[0].Outputs) {
    $outputs[$output.OutputKey] = $output.OutputValue
}

if ($Mode -eq "BootstrapDatabase") {
    $taskDefinition = $outputs.DatabaseBootstrapTaskDefinitionArn
    $containerName = "database-bootstrap"
} else {
    $taskDefinition = $outputs.MigrationTaskDefinitionArn
    $containerName = "migrations"
}
if ([string]::IsNullOrWhiteSpace($taskDefinition)) {
    throw "The expected task definition output is missing from stack $StackName."
}

$serviceResponse = Invoke-AwsJson -Arguments @(
    "ecs", "describe-services",
    "--cluster", $ClusterName,
    "--services", $outputs.ServiceName
)
$network = $serviceResponse.services[0].networkConfiguration.awsvpcConfiguration
if ($null -eq $network) {
    throw "The staging service network configuration could not be read."
}

$subnets = @($network.subnets) -join ","
$securityGroups = @($network.securityGroups) -join ","
$networkConfiguration = "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$securityGroups],assignPublicIp=$($network.assignPublicIp)}"

$run = Invoke-AwsJson -Arguments @(
    "ecs", "run-task",
    "--cluster", $ClusterName,
    "--task-definition", $taskDefinition,
    "--capacity-provider-strategy", "capacityProvider=FARGATE,weight=1",
    "--network-configuration", $networkConfiguration,
    "--started-by", "spottr-staging-$($Mode.ToLowerInvariant())"
)
if ($run.failures.Count -gt 0 -or $run.tasks.Count -ne 1) {
    throw "ECS did not start the staging task: $($run.failures | ConvertTo-Json -Compress)"
}

$taskArn = $run.tasks[0].taskArn
Write-Host "Started $Mode task: $taskArn"

& aws ecs wait tasks-stopped `
    --cluster $ClusterName `
    --tasks $taskArn `
    --region $Region
if ($LASTEXITCODE -ne 0) {
    throw "Timed out while waiting for staging task $taskArn."
}

$result = Invoke-AwsJson -Arguments @(
    "ecs", "describe-tasks",
    "--cluster", $ClusterName,
    "--tasks", $taskArn
)
$task = $result.tasks[0]
$container = $task.containers | Where-Object { $_.name -eq $containerName } | Select-Object -First 1
if ($null -eq $container) {
    throw "Container $containerName was not present in task $taskArn."
}

$summary = [ordered]@{
    taskArn = $taskArn
    mode = $Mode
    stopCode = $task.stopCode
    stoppedReason = $task.stoppedReason
    exitCode = $container.exitCode
    reason = $container.reason
}
$summary | ConvertTo-Json

if ($container.exitCode -ne 0) {
    throw "$Mode failed. Inspect /ecs/pulse-api-staging in CloudWatch Logs."
}

