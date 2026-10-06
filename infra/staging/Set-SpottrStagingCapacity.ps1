[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateRange(0, 1)]
    [int]$DesiredCount,
    [ValidateRange(1, 24)]
    [int]$AutoStopAfterHours = 4,
    [string]$Region = "eu-central-1",
    [string]$ClusterName = "pulse-cluster",
    [string]$ServiceName = "pulse-api-staging-service",
    [string]$StackName = "spottr-staging-api"
)

$ErrorActionPreference = "Stop"
$ExpectedAccountId = "959222626220"
$ExpectedRegion = "eu-central-1"
$ExpectedClusterName = "pulse-cluster"
$ExpectedServiceName = "pulse-api-staging-service"
$ExpectedStackName = "spottr-staging-api"
$ScheduleName = "spottr-staging-auto-stop"
$ScheduleGroupName = "default"
$TemporaryRequestFile = $null

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

    $json = $result.Output -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($json)) {
        return $null
    }

    return $json | ConvertFrom-Json
}

function Get-StackOutputValue {
    param(
        [Parameter(Mandatory)]
        [string]$OutputKey
    )

    $response = Invoke-AwsJson -Arguments @(
        "cloudformation", "describe-stacks",
        "--stack-name", $StackName
    )
    $output = $response.Stacks[0].Outputs | Where-Object { $_.OutputKey -eq $OutputKey } | Select-Object -First 1
    if ($null -eq $output -or [string]::IsNullOrWhiteSpace([string]$output.OutputValue)) {
        throw "CloudFormation output '$OutputKey' is missing. Deploy the updated staging stack before starting staging."
    }

    return [string]$output.OutputValue
}

function Test-ScheduleExists {
    $result = Invoke-AwsRaw -Arguments @(
        "scheduler", "get-schedule",
        "--name", $ScheduleName,
        "--group-name", $ScheduleGroupName,
        "--region", $Region,
        "--output", "json"
    )

    if ($result.ExitCode -eq 0) {
        return $true
    }

    $message = $result.Output -join [Environment]::NewLine
    if ($message -match "ResourceNotFoundException") {
        return $false
    }

    throw $message
}

function Set-AutoStopSchedule {
    $roleArn = Get-StackOutputValue -OutputKey "AutoStopSchedulerRoleArn"
    $deadLetterQueueArn = Get-StackOutputValue -OutputKey "AutoStopDeadLetterQueueArn"
    $stopAtUtc = [DateTime]::UtcNow.AddHours($AutoStopAfterHours)
    $scheduleExpression = "at($($stopAtUtc.ToString('yyyy-MM-ddTHH:mm:ss')))"
    $ecsInput = @{
        Cluster = $ClusterName
        Service = $ServiceName
        DesiredCount = 0
    } | ConvertTo-Json -Compress

    $request = @{
        Name = $ScheduleName
        GroupName = $ScheduleGroupName
        Description = "Automatically stop the SPOTTR staging API after a test session."
        ScheduleExpression = $scheduleExpression
        ScheduleExpressionTimezone = "UTC"
        FlexibleTimeWindow = @{ Mode = "OFF" }
        ActionAfterCompletion = "DELETE"
        State = "ENABLED"
        Target = @{
            Arn = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
            RoleArn = $roleArn
            Input = $ecsInput
            DeadLetterConfig = @{ Arn = $deadLetterQueueArn }
            RetryPolicy = @{
                MaximumEventAgeInSeconds = 3600
                MaximumRetryAttempts = 5
            }
        }
    }

    $script:TemporaryRequestFile = Join-Path ([System.IO.Path]::GetTempPath()) ("spottr-staging-schedule-{0}.json" -f [Guid]::NewGuid().ToString("N"))
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($script:TemporaryRequestFile, ($request | ConvertTo-Json -Depth 8), $utf8WithoutBom)

    $operation = if (Test-ScheduleExists) { "update-schedule" } else { "create-schedule" }
    Invoke-AwsJson -Arguments @(
        "scheduler", $operation,
        "--cli-input-json", "file://$script:TemporaryRequestFile"
    ) | Out-Null

    Write-Host "Automatic stop scheduled for $($stopAtUtc.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz'))."
}

function Remove-AutoStopSchedule {
    if (-not (Test-ScheduleExists)) {
        return
    }

    $result = Invoke-AwsRaw -Arguments @(
        "scheduler", "delete-schedule",
        "--name", $ScheduleName,
        "--group-name", $ScheduleGroupName,
        "--region", $Region
    )
    if ($result.ExitCode -ne 0) {
        $message = $result.Output -join [Environment]::NewLine
        if ($message -match "ResourceNotFoundException") {
            Write-Host "Automatic stop schedule was already removed."
            return
        }
        throw "The staging auto-stop schedule could not be deleted: $message"
    }

    Write-Host "Automatic stop schedule removed."
}

if ($Region -ne $ExpectedRegion -or
    $ClusterName -ne $ExpectedClusterName -or
    $ServiceName -ne $ExpectedServiceName -or
    $StackName -ne $ExpectedStackName) {
    throw "Refusing to operate on an unexpected AWS target. This script controls only the fixed SPOTTR staging service."
}

$identity = Invoke-AwsJson -Arguments @("sts", "get-caller-identity")
if ([string]$identity.Account -ne $ExpectedAccountId) {
    throw "Refusing to operate in AWS account '$($identity.Account)'; expected '$ExpectedAccountId'."
}

try {
    if ($DesiredCount -eq 1) {
        Set-AutoStopSchedule
    }

    $scaleResult = Invoke-AwsRaw -Arguments @(
        "ecs", "update-service",
        "--cluster", $ClusterName,
        "--service", $ServiceName,
        "--desired-count", ([string]$DesiredCount),
        "--region", $Region,
        "--query", "service.{serviceName:serviceName,desiredCount:desiredCount,status:status}",
        "--output", "json"
    )
    if ($scaleResult.ExitCode -ne 0) {
        throw "The staging ECS service could not be scaled: $($scaleResult.Output -join [Environment]::NewLine)"
    }
    $scaleResult.Output | Write-Host

    Write-Host "Waiting for ECS service stability..."
    $waitResult = Invoke-AwsRaw -Arguments @(
        "ecs", "wait", "services-stable",
        "--cluster", $ClusterName,
        "--services", $ServiceName,
        "--region", $Region
    )
    if ($waitResult.ExitCode -ne 0) {
        throw "The staging ECS service did not become stable. Check ECS events and CloudWatch logs. $($waitResult.Output -join [Environment]::NewLine)"
    }

    if ($DesiredCount -eq 0) {
        Remove-AutoStopSchedule
    }

    Write-Host "Staging desired count is now $DesiredCount."
} finally {
    if ($null -ne $TemporaryRequestFile -and (Test-Path -LiteralPath $TemporaryRequestFile)) {
        Remove-Item -LiteralPath $TemporaryRequestFile -Force
    }
}
