param(
    [string]$EnvFile = '.env'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'docker-compose.release.yml'

Write-Host 'Validating docker compose configuration'
docker compose -f $composeFile --env-file $EnvFile config | Out-Null

Write-Host 'Pulling images'
docker compose -f $composeFile --env-file $EnvFile pull

Write-Host 'Starting containers'
docker compose -f $composeFile --env-file $EnvFile up -d

Write-Host 'Current container status'
docker compose -f $composeFile --env-file $EnvFile ps
