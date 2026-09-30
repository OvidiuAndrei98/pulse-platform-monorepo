[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateRange(0, 1)]
    [int]$DesiredCount,
    [string]$Region = "eu-central-1",
    [string]$ClusterName = "pulse-cluster",
    [string]$ServiceName = "pulse-api-staging-service"
)

$ErrorActionPreference = "Stop"

& aws ecs update-service `
    --cluster $ClusterName `
    --service $ServiceName `
    --desired-count $DesiredCount `
    --region $Region `
    --query "service.{serviceName:serviceName,desiredCount:desiredCount,status:status}" `
    --output json
if ($LASTEXITCODE -ne 0) {
    throw "The staging ECS service could not be scaled."
}

Write-Host "Waiting for ECS service stability..."
& aws ecs wait services-stable `
    --cluster $ClusterName `
    --services $ServiceName `
    --region $Region
if ($LASTEXITCODE -ne 0) {
    throw "The staging ECS service did not become stable. Check ECS events and CloudWatch logs."
}

Write-Host "Staging desired count is now $DesiredCount."
