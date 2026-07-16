$pgDir = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Directory | Select-Object -First 1 -ExpandProperty FullName

if (-not $pgDir) {
    Write-Error "PostgreSQL was not found in C:\Program Files\PostgreSQL."
    exit 1
}

$psqlPath = Join-Path $pgDir "bin\psql.exe"
Write-Host "PostgreSQL found at: $psqlPath"

& $psqlPath -U postgres -f init_db.sql

if ($LASTEXITCODE -ne 0) {
    Write-Error "Error configuring the database."
    exit 1
}