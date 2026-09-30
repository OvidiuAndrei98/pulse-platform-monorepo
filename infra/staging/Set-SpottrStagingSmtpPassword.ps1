[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Region = "eu-central-1"
$ExpectedAwsAccountId = "959222626220"
$StackName = "spottr-staging-api"
$temporaryFile = $null
$plainPassword = $null

function Get-AwsJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $raw = & aws @Arguments --region $Region --output json
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI command failed: aws $($Arguments -join ' ')"
    }
    return $raw | ConvertFrom-Json
}

try {
    $identity = Get-AwsJson -Arguments @("sts", "get-caller-identity")
    if ($identity.Account -ne $ExpectedAwsAccountId) {
        throw "Refusing to update AWS account $($identity.Account); expected $ExpectedAwsAccountId."
    }

    $stack = Get-AwsJson -Arguments @(
        "cloudformation", "describe-stacks",
        "--stack-name", $StackName
    )
    $secretArn = ($stack.Stacks[0].Outputs | Where-Object OutputKey -eq "ApplicationSecretsArn").OutputValue
    if ([string]::IsNullOrWhiteSpace($secretArn) -or $secretArn -notmatch ":secret:pulse-api/app-staging-") {
        throw "The staging application secret could not be identified safely."
    }

    $securePassword = Read-Host "Paste the dedicated staging Resend API key" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    if ([string]::IsNullOrWhiteSpace($plainPassword) -or -not $plainPassword.StartsWith("re_")) {
        throw "The value does not look like a Resend API key. No secret was changed."
    }

    $secretString = (& aws secretsmanager get-secret-value `
        --secret-id $secretArn `
        --region $Region `
        --query SecretString `
        --output text)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($secretString)) {
        throw "The current staging secret could not be read."
    }
    $secret = $secretString | ConvertFrom-Json
    $secret.SMTP_PASSWORD = $plainPassword

    $temporaryFile = [System.IO.Path]::Combine(
        [System.IO.Path]::GetTempPath(),
        "spottr-staging-smtp-$([guid]::NewGuid().ToString('N')).json"
    )
    $updatedJson = $secret | ConvertTo-Json -Depth 20 -Compress
    [System.IO.File]::WriteAllText($temporaryFile, $updatedJson, [System.Text.UTF8Encoding]::new($false))

    & aws secretsmanager put-secret-value `
        --secret-id $secretArn `
        --secret-string "file://$temporaryFile" `
        --region $Region `
        --query "{ARN:ARN,VersionId:VersionId}" `
        --output json
    if ($LASTEXITCODE -ne 0) {
        throw "The staging SMTP credential could not be saved."
    }

    Write-Host "Staging SMTP credential saved. Deploy or restart staging so ECS loads the new secret version."
} finally {
    $plainPassword = $null
    if ($null -ne $temporaryFile -and (Test-Path -LiteralPath $temporaryFile)) {
        Remove-Item -LiteralPath $temporaryFile -Force
    }
}
