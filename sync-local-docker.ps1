param(
  [int]$LocalPort = 3000,
  [int]$DockerPort = 3010,
  [int]$DbPort = 5433,
  [switch]$NoCache,
  [switch]$SkipSeed,
  [switch]$ResetDb,
  [switch]$StartLocalNpm
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked {
  param([string]$Command, [string[]]$CommandArgs)

  & $Command @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($CommandArgs -join ' ') (exit code $LASTEXITCODE)"
  }
}

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Ensure-RepoRoot {
  if (-not (Test-Path "./docker-compose.yml")) {
    throw "Run this script from the repository root (folder containing docker-compose.yml)."
  }
}

function Assert-LocalPortNotClaimedByOtherContainer {
  param([int]$Port)

  $lines = docker ps --format "{{.Names}}|{{.Ports}}"
  if (-not $lines) {
    return
  }

  foreach ($line in $lines) {
    if (-not $line) { continue }
    $parts = $line -split '\|', 2
    if ($parts.Count -ne 2) { continue }

    $name = $parts[0]
    $ports = $parts[1]

    if ($ports -match "0\.0\.0\.0:$Port->" -or $ports -match "\[::\]:$Port->") {
      if ($name -ne 'payevo-base-clone-app-1') {
        throw "LocalPort $Port is currently mapped by Docker container '$name'. This is not your npm process. Use your real npm port (for example 3000) or stop that container first."
      }
    }
  }
}

function Ensure-EnvLocal {
  param([int]$TargetDbPort)

  $envPath = Join-Path (Get-Location) ".env.local"
  $databaseUrl = "DATABASE_URL=`"postgresql://appuser:apppass@localhost:$TargetDbPort/app_dev`""
  $bypass = "DEV_BYPASS_AUTH=true"

  if (-not (Test-Path $envPath)) {
    @(
      $databaseUrl,
      $bypass
    ) | Set-Content -Path $envPath
    Write-Host "Created .env.local with DATABASE_URL and DEV_BYPASS_AUTH." -ForegroundColor Yellow
    return
  }

  $lines = Get-Content $envPath

  if ($lines -match '^DATABASE_URL=') {
    $lines = $lines -replace '^DATABASE_URL=.*$', $databaseUrl
  } else {
    $lines += $databaseUrl
  }

  if ($lines -match '^DEV_BYPASS_AUTH=') {
    $lines = $lines -replace '^DEV_BYPASS_AUTH=.*$', $bypass
  } else {
    $lines += $bypass
  }

  Set-Content -Path $envPath -Value $lines
  Write-Host "Updated .env.local DATABASE_URL and DEV_BYPASS_AUTH." -ForegroundColor Yellow
}

function Invoke-Json {
  param([string]$Uri)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri
    return @{
      ok = $true
      status = [int]$response.StatusCode
      body = $response.Content | ConvertFrom-Json
    }
  } catch {
    if ($_.Exception.Response) {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $raw = $reader.ReadToEnd()
      $body = $null
      try {
        $body = $raw | ConvertFrom-Json
      } catch {
        $body = @{ raw = $raw }
      }
      return @{
        ok = $false
        status = [int]$_.Exception.Response.StatusCode
        body = $body
      }
    }

    return @{
      ok = $false
      status = -1
      body = @{ error = $_.Exception.Message }
    }
  }
}

function Wait-ForLocalApp {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $probe = Invoke-Json -Uri "http://localhost:$Port/api/auth/me"
    if ($probe.ok) {
      return $true
    }
    Start-Sleep -Milliseconds 1200
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Compare-Parity {
  param(
    [int]$NpmPort,
    [int]$ContainerPort
  )

  Write-Step "Parity checks for npm:$NpmPort and docker:$ContainerPort"

  $authLocal = Invoke-Json -Uri "http://localhost:$NpmPort/api/auth/me"
  $authDocker = Invoke-Json -Uri "http://localhost:$ContainerPort/api/auth/me"

  if (-not $authLocal.ok) {
    throw "Local npm app is not reachable on port $NpmPort. Start it first (example: npm run dev -- --port $NpmPort), then rerun this script."
  }

  $flagsLocal = Invoke-Json -Uri "http://localhost:$NpmPort/api/permissions/flags?key=module:feature-a"
  $flagsDocker = Invoke-Json -Uri "http://localhost:$ContainerPort/api/permissions/flags?key=module:feature-a"

  $employeesLocal = Invoke-Json -Uri "http://localhost:$NpmPort/api/feature-a/employees"
  $employeesDocker = Invoke-Json -Uri "http://localhost:$ContainerPort/api/feature-a/employees"

  $authMatch = $false
  if ($authLocal.body.success -and $authDocker.body.success) {
    $authMatch = (
      $authLocal.body.data.role -eq $authDocker.body.data.role -and
      $authLocal.body.data.tenantId -eq $authDocker.body.data.tenantId
    )
  }

  $flagsMatch = $false
  if ($flagsLocal.body.success -and $flagsDocker.body.success) {
    $flagsMatch = ($flagsLocal.body.data.enabled -eq $flagsDocker.body.data.enabled)
  }

  $employeeLocalCount = if ($employeesLocal.body.success) { @($employeesLocal.body.data.employees).Count } else { -1 }
  $employeeDockerCount = if ($employeesDocker.body.success) { @($employeesDocker.body.data.employees).Count } else { -1 }
  $employeesMatch = ($employeeLocalCount -eq $employeeDockerCount)

  $summary = @(
    [PSCustomObject]@{
      Check = 'auth role+tenant'
      Match = $authMatch
      Local = "status=$($authLocal.status)"
      Docker = "status=$($authDocker.status)"
    },
    [PSCustomObject]@{
      Check = 'feature-a flag'
      Match = $flagsMatch
      Local = "status=$($flagsLocal.status)"
      Docker = "status=$($flagsDocker.status)"
    },
    [PSCustomObject]@{
      Check = 'employee count'
      Match = $employeesMatch
      Local = "status=$($employeesLocal.status); count=$employeeLocalCount"
      Docker = "status=$($employeesDocker.status); count=$employeeDockerCount"
    }
  )

  $summary | Format-Table -AutoSize

  if (-not ($authMatch -and $flagsMatch -and $employeesMatch)) {
    Write-Host "`nParity check found differences. Compare payload details below:" -ForegroundColor Yellow
    Write-Host "Local auth:" ($authLocal.body | ConvertTo-Json -Depth 6)
    Write-Host "Docker auth:" ($authDocker.body | ConvertTo-Json -Depth 6)
    Write-Host "Local flags:" ($flagsLocal.body | ConvertTo-Json -Depth 6)
    Write-Host "Docker flags:" ($flagsDocker.body | ConvertTo-Json -Depth 6)
    Write-Host "Local employees:" ($employeesLocal.body | ConvertTo-Json -Depth 6)
    Write-Host "Docker employees:" ($employeesDocker.body | ConvertTo-Json -Depth 6)
  } else {
    Write-Host "`nParity check passed." -ForegroundColor Green
  }
}

Ensure-RepoRoot
Assert-LocalPortNotClaimedByOtherContainer -Port $LocalPort

Write-Step "Aligning .env.local"
Ensure-EnvLocal -TargetDbPort $DbPort

$env:DATABASE_URL = "postgresql://appuser:apppass@localhost:$DbPort/app_dev"
$env:DEV_BYPASS_AUTH = 'true'

Write-Step "Starting database container"
$env:DB_HOST_PORT = "$DbPort"
Invoke-Checked -Command "docker" -CommandArgs @("compose", "up", "-d", "db")

Write-Step "Applying migrations with migrate deploy"
try {
  Invoke-Checked -Command "npm" -CommandArgs @("run", "db:migrate")
} catch {
  if ($ResetDb) {
    Write-Host "Migration failed. ResetDb enabled: resetting local development database..." -ForegroundColor Yellow
    Invoke-Checked -Command "npx" -CommandArgs @("prisma", "migrate", "reset", "--force")
    Invoke-Checked -Command "npm" -CommandArgs @("run", "db:migrate")
  } else {
    throw "migrate deploy failed. Re-run with -ResetDb if the local database needs reset. Original error: $($_.Exception.Message)"
  }
}

if (-not $SkipSeed) {
  Write-Step "Seeding database"
  Invoke-Checked -Command "npm" -CommandArgs @("run", "db:seed")
}

Write-Step "Building Docker app image"
if ($NoCache) {
  Invoke-Checked -Command "docker" -CommandArgs @("compose", "build", "--no-cache", "app")
} else {
  Invoke-Checked -Command "docker" -CommandArgs @("compose", "build", "app")
}

Write-Step "Starting Docker app on host port $DockerPort"
$env:APP_HOST_PORT = "$DockerPort"
Invoke-Checked -Command "docker" -CommandArgs @("compose", "up", "-d", "app")

Write-Step "Starting local npm dev server check"
if ($StartLocalNpm) {
  $localProbe = Invoke-Json -Uri "http://localhost:$LocalPort/api/auth/me"
  if (-not $localProbe.ok) {
    Write-Host "Starting local npm dev server on port $LocalPort..." -ForegroundColor Yellow
    Start-Process -FilePath "npm" -ArgumentList @("run", "dev", "--", "--port", "$LocalPort") -WorkingDirectory (Get-Location) | Out-Null
    if (-not (Wait-ForLocalApp -Port $LocalPort)) {
      throw "Started npm dev but app did not become reachable on port $LocalPort within timeout."
    }
  }
} else {
  Write-Host "Ensure npm dev server is running on port $LocalPort before parity check." -ForegroundColor Yellow
}

Compare-Parity -NpmPort $LocalPort -ContainerPort $DockerPort
