param(
    [Parameter(Mandatory = $true)]
    [string]$DockerHubUser,

    [Parameter(Mandatory = $true)]
    [string]$VersionTag
)

$ErrorActionPreference = 'Stop'

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Host $Message
    & $Action

    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Message"
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendImage = "$DockerHubUser/simklinik-backend:$VersionTag"
$frontendImage = "$DockerHubUser/simklinik-frontend:$VersionTag"

Invoke-Step -Message "Building backend image: $backendImage" -Action {
    docker build -t $backendImage "$repoRoot/backend"
}

Invoke-Step -Message "Building frontend image: $frontendImage" -Action {
    docker build --build-arg VITE_API_URL=/api -t $frontendImage "$repoRoot/frontend"
}

Invoke-Step -Message "Pushing backend image" -Action {
    docker push $backendImage
}

Invoke-Step -Message "Pushing frontend image" -Action {
    docker push $frontendImage
}

Write-Host "Release images pushed successfully."
Write-Host "Set BACKEND_IMAGE=$backendImage"
Write-Host "Set FRONTEND_IMAGE=$frontendImage"
