[CmdletBinding()]
param(
    [string]$Region = "eu-central-1",
    [string]$ClusterName = "pulse-cluster",
    [string]$ServiceName = "pulse-api-service",
    [string]$DatabaseIdentifier = "pulse-db",
    [string]$HostedZoneName = "spottr.ro"
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

$identity = Invoke-AwsJson -Arguments @("sts", "get-caller-identity")
$services = Invoke-AwsJson -Arguments @(
    "ecs", "describe-services",
    "--cluster", $ClusterName,
    "--services", $ServiceName
)
if ($services.failures.Count -gt 0 -or $services.services.Count -ne 1) {
    throw "ECS service $ClusterName/$ServiceName was not found."
}

$service = $services.services[0]
$taskDefinitionResponse = Invoke-AwsJson -Arguments @(
    "ecs", "describe-task-definition",
    "--task-definition", $service.taskDefinition
)
$taskDefinition = $taskDefinitionResponse.taskDefinition
$container = $taskDefinition.containerDefinitions | Select-Object -First 1

if ($service.loadBalancers.Count -ne 1) {
    throw "Expected exactly one load balancer mapping on the production API service."
}
$targetGroupArn = $service.loadBalancers[0].targetGroupArn
$targetGroups = Invoke-AwsJson -Arguments @(
    "elbv2", "describe-target-groups",
    "--target-group-arns", $targetGroupArn
)
$targetGroup = $targetGroups.TargetGroups[0]
if ($targetGroup.LoadBalancerArns.Count -ne 1) {
    throw "Expected the production API target group to belong to exactly one ALB."
}

$loadBalancerArn = $targetGroup.LoadBalancerArns[0]
$loadBalancers = Invoke-AwsJson -Arguments @(
    "elbv2", "describe-load-balancers",
    "--load-balancer-arns", $loadBalancerArn
)
$loadBalancer = $loadBalancers.LoadBalancers[0]
$listenersResponse = Invoke-AwsJson -Arguments @(
    "elbv2", "describe-listeners",
    "--load-balancer-arn", $loadBalancerArn
)
$httpsListener = $listenersResponse.Listeners |
    Where-Object { $_.Protocol -eq "HTTPS" } |
    Select-Object -First 1
if ($null -eq $httpsListener) {
    throw "The existing ALB has no HTTPS listener."
}

$databaseResponse = Invoke-AwsJson -Arguments @(
    "rds", "describe-db-instances",
    "--db-instance-identifier", $DatabaseIdentifier
)
$database = $databaseResponse.DBInstances[0]

$zoneResponse = Invoke-AwsJson -Arguments @(
    "route53", "list-hosted-zones-by-name",
    "--dns-name", $HostedZoneName,
    "--max-items", "1"
)
$hostedZone = $zoneResponse.HostedZones | Select-Object -First 1

$network = $service.networkConfiguration.awsvpcConfiguration
$inventory = [ordered]@{
    accountId = $identity.Account
    region = $Region
    ecs = [ordered]@{
        cluster = $ClusterName
        productionService = $ServiceName
        productionTaskDefinition = $service.taskDefinition
        launchType = $service.launchType
        capacityProviderStrategy = $service.capacityProviderStrategy
        platformVersion = $service.platformVersion
        subnets = @($network.subnets)
        securityGroups = @($network.securityGroups)
        assignPublicIp = $network.assignPublicIp
        executionRoleArn = $taskDefinition.executionRoleArn
        taskRoleArn = $taskDefinition.taskRoleArn
        cpu = $taskDefinition.cpu
        memory = $taskDefinition.memory
        operatingSystemFamily = $taskDefinition.runtimePlatform.operatingSystemFamily
        cpuArchitecture = $taskDefinition.runtimePlatform.cpuArchitecture
        containerName = $container.name
        containerPort = $service.loadBalancers[0].containerPort
        image = $container.image
        environmentNames = @($container.environment | ForEach-Object { $_.name } | Sort-Object)
        secretNames = @($container.secrets | ForEach-Object { $_.name } | Sort-Object)
        logGroup = $container.logConfiguration.options.'awslogs-group'
    }
    alb = [ordered]@{
        arn = $loadBalancer.LoadBalancerArn
        dnsName = $loadBalancer.DNSName
        canonicalHostedZoneId = $loadBalancer.CanonicalHostedZoneId
        vpcId = $loadBalancer.VpcId
        securityGroups = @($loadBalancer.SecurityGroups)
        httpsListenerArn = $httpsListener.ListenerArn
        certificateArns = @($httpsListener.Certificates | ForEach-Object { $_.CertificateArn })
        productionTargetGroupArn = $targetGroupArn
        healthCheckPath = $targetGroup.HealthCheckPath
    }
    database = [ordered]@{
        identifier = $database.DBInstanceIdentifier
        endpoint = $database.Endpoint.Address
        port = $database.Endpoint.Port
        vpcSecurityGroups = @($database.VpcSecurityGroups | ForEach-Object { $_.VpcSecurityGroupId })
        dbSubnetGroup = $database.DBSubnetGroup.DBSubnetGroupName
        masterUserSecretArn = $database.MasterUserSecret.SecretArn
        publiclyAccessible = $database.PubliclyAccessible
    }
    dns = [ordered]@{
        hostedZoneName = $hostedZone.Name
        hostedZoneId = $hostedZone.Id
    }
}

# This output intentionally contains identifiers and configuration names only.
# It never calls Secrets Manager GetSecretValue and never prints env values.
$inventory | ConvertTo-Json -Depth 8
