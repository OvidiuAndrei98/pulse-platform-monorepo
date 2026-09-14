$dbPassword = [Environment]::GetEnvironmentVariable("DB_PASSWORD")
if ([string]::IsNullOrWhiteSpace($dbPassword) -or $dbPassword.Length -lt 16) {
    Write-Error "DB_PASSWORD must be set to at least 16 characters before running setup_db.ps1."
    exit 1
}

$pgDir = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Directory | Select-Object -First 1 -ExpandProperty FullName

if (-not $pgDir) {
    Write-Error "PostgreSQL was not found in C:\Program Files\PostgreSQL."
    exit 1
}

$psqlPath = Join-Path $pgDir "bin\psql.exe"
Write-Host "PostgreSQL found at: $psqlPath"

# init_db.sql reads DB_PASSWORD directly through psql's \getenv command. The
# secret is never included in the process command line or printed by this script.
& $psqlPath -v ON_ERROR_STOP=1 -U postgres -f init_db.sql

if ($LASTEXITCODE -ne 0) {
    Write-Error "Error configuring the database."
    exit 1
}
