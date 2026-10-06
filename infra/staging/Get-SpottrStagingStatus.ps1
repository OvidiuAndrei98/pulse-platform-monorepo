[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ExpectedAccountId = "959222626220"
$Region = "eu-central-1"
$ClusterName = "pulse-cluster"
$ServiceName = "pulse-api-staging-service"
$StackName = "spottr-staging-api"
$ScheduleName = "spottr-staging-auto-stop"
$ScheduleGroupName = "default"
$HealthUrl = "https://api-staging.spottr.ro/health"

function Invoke-AwsRaw {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& aws @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    return [PSCustomObject]@{
        ExitCode = $exitCode
        Output = @($output | ForEach-Object { [string]$_ })
    }
}

function Invoke-AwsJson {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $result = Invoke-AwsRaw -Arguments ($Arguments + @("--region", $Region, "--output", "json"))
    if ($result.ExitCode -ne 0) {
        throw ($result.Output -join [Environment]::NewLine)
    }

    return ($result.Output -join [Environment]::NewLine) | ConvertFrom-Json
}

$identity = Invoke-AwsJson -Arguments @("sts", "get-caller-identity")
if ([string]$identity.Account -ne $ExpectedAccountId) {
    throw "Refusing to inspect AWS account '$($identity.Account)'; expected '$ExpectedAccountId'."
}

$serviceResponse = Invoke-AwsJson -Arguments @(
    "ecs", "describe-services",
    "--cluster", $ClusterName,
    "--services", $ServiceName
)
if ($serviceResponse.failures.Count -gt 0 -or $serviceResponse.services.Count -ne 1) {
    throw "The fixed SPOTTR staging ECS service could not be found."
}

$service = $serviceResponse.services[0]
$desiredCount = [int]$service.desiredCount
$runningCount = [int]$service.runningCount
$pendingCount = [int]$service.pendingCount
$state = if ($desiredCount -eq 0 -and $runningCount -eq 0 -and $pendingCount -eq 0) {
    "STOPPED"
} elseif ($desiredCount -eq 1 -and $runningCount -eq 1 -and $pendingCount -eq 0) {
    "RUNNING"
} else {
    "TRANSITIONING"
}

$scheduleResult = Invoke-AwsRaw -Arguments @(
    "scheduler", "get-schedule",
    "--name", $ScheduleName,
    "--group-name", $ScheduleGroupName,
    "--region", $Region,
    "--output", "json"
)
if ($scheduleResult.ExitCode -eq 0) {
    $schedule = ($scheduleResult.Output -join [Environment]::NewLine) | ConvertFrom-Json
    $autoStop = [string]$schedule.ScheduleExpression
    if ($autoStop -match '^at\((?<timestamp>[^)]+)\)$') {
        $stopAtUtc = [DateTime]::SpecifyKind(
            [DateTime]::ParseExact($Matches.timestamp, "yyyy-MM-ddTHH:mm:ss", [Globalization.CultureInfo]::InvariantCulture),
            [DateTimeKind]::Utc
        )
        $autoStop = $stopAtUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss zzz")
    }
} else {
    $scheduleError = $scheduleResult.Output -join [Environment]::NewLine
    if ($scheduleError -match "ResourceNotFoundException") {
        $autoStop = "not scheduled"
    } else {
        throw $scheduleError
    }
}

$health = if ($desiredCount -eq 0) { "not checked (stopped)" } else { "unavailable" }
if ($desiredCount -gt 0) {
    try {
        $healthResponse = Invoke-WebRequest -Uri $HealthUrl -Method Get -TimeoutSec 15 -UseBasicParsing
        $health = "HTTP $([int]$healthResponse.StatusCode)"
    } catch {
        if ($null -ne $_.Exception.Response -and $null -ne $_.Exception.Response.StatusCode) {
            $health = "HTTP $([int]$_.Exception.Response.StatusCode)"
        } else {
            $health = "unreachable"
        }
    }
}

$deadLetterMessages = "unavailable"
try {
    $stack = Invoke-AwsJson -Arguments @(
        "cloudformation", "describe-stacks",
        "--stack-name", $StackName
    )
    $queueOutput = $stack.Stacks[0].Outputs | Where-Object { $_.OutputKey -eq "AutoStopDeadLetterQueueUrl" } | Select-Object -First 1
    if ($null -ne $queueOutput) {
        $queueAttributes = Invoke-AwsJson -Arguments @(
            "sqs", "get-queue-attributes",
            "--queue-url", ([string]$queueOutput.OutputValue),
            "--attribute-names", "ApproximateNumberOfMessages"
        )
        $deadLetterMessages = [string]$queueAttributes.Attributes.ApproximateNumberOfMessages
    }
} catch {
    $deadLetterMessages = "unavailable"
}

[PSCustomObject]@{
    State = $state
    DesiredTasks = $desiredCount
    RunningTasks = $runningCount
    PendingTasks = $pendingCount
    Health = $health
    AutoStop = $autoStop
    AutoStopDLQMessages = $deadLetterMessages
} | Format-List
