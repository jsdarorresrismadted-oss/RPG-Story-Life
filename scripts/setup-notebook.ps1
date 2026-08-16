param(
  [Parameter(Mandatory = $true)][string]$NgrokToken,
  [Parameter(Mandatory = $true)][string]$NgrokUrl,
  [Parameter(Mandatory = $true)][string]$DbPassword,
  [string]$RailwayService = "Backend"
)

$ErrorActionPreference = "Stop"
$repo = "C:\Users\Dark\Desktop\RPG-Story-Life-Text"
$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$redisMsi = "C:\Users\Dark\AppData\Local\Temp\opencode\Redis-x64-5.0.14.1.msi"
$logsDir = Join-Path $repo "logs"

Write-Host "=== 1/8 PostgreSQL 16 ==="
if (Test-Path "$pgBin\psql.exe") {
  Write-Host "    ja instalado"
} else {
  winget install -e --id PostgreSQL.PostgreSQL.16 --override "/S --superpassword=$DbPassword --serverport=5432" --accept-package-agreements --accept-source-agreements --silent
  if (-not (Test-Path "$pgBin\psql.exe")) { throw "Falha na instalacao do PostgreSQL" }
}
$pgService = Get-Service -Name "postgresql-x64-16" -ErrorAction SilentlyContinue
if ($pgService -and $pgService.Status -ne "Running") { Start-Service $pgService }

Write-Host "=== 2/8 Redis (Windows) ==="
if (Get-Service -Name "Redis" -ErrorAction SilentlyContinue) {
  Write-Host "    ja instalado"
} else {
  Invoke-WebRequest -Uri "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.msi" -OutFile $redisMsi -UseBasicParsing
  Start-Process msiexec -ArgumentList "/i", "`"$redisMsi`"", "/qn", "/norestart" -Wait
  if (-not (Get-Service -Name "Redis" -ErrorAction SilentlyContinue)) { throw "Falha na instalacao do Redis" }
  Start-Service Redis
}

Write-Host "=== 3/8 ngrok ==="
winget install -e --id ngrok.ngrok --accept-package-agreements --accept-source-agreements --silent | Out-Null
$ngrok = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
if (-not $ngrok) { throw "ngrok nao encontrado" }
& $ngrok config add-authtoken $NgrokToken
$ngrokDir = Join-Path $env:LOCALAPPDATA "ngrok"
New-Item -ItemType Directory -Path $ngrokDir -Force | Out-Null
$url = $NgrokUrl -replace "^https?://", ""
$ngrokYml = @"
version: "2"
authtoken: $NgrokToken
tunnels:
  rpg:
    proto: http
    addr: 3001
    domain: $url
"@
Set-Content -Path (Join-Path $ngrokDir "ngrok.yml") -Value $ngrokYml -Encoding UTF8

Write-Host "=== 4/8 Energia (nunca dormir na tomada) ==="
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null

Write-Host "=== 5/8 Banco de dados local ==="
$env:PGPASSWORD = $DbPassword
$exists = & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -t -A -c "SELECT 1 FROM pg_roles WHERE rolname='rpgstory'" 2>$null
if ($exists -ne "1") {
  & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE ROLE rpgstory LOGIN PASSWORD '$DbPassword'" | Out-Null
}
$dbExists = & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -t -A -c "SELECT 1 FROM pg_database WHERE datname='rpgstorylife'" 2>$null
if ($dbExists -ne "1") {
  & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE DATABASE rpgstorylife OWNER rpgstory" | Out-Null
}
Remove-Item Env:PGPASSWORD

Write-Host "=== 6/8 .env.notebook (secrets do Railway) ==="
$railwayCli = "C:\Users\Dark\AppData\Roaming\npm\node_modules\@railway\cli\bin\railway.js"
$varsOut = ""
try {
  $varsOut = & node $railwayCli variables -s $RailwayService -k 2>$null
} catch { }
if (-not $varsOut) {
  $varsOut = & node $railwayCli variables -k 2>$null
}
if (-not $varsOut) { throw "Nao consegui ler as secrets do Railway (logado no railway CLI?). Use: railway login" }
$lines = @()
foreach ($kv in $varsOut -split "`r?`n") {
  if ($kv -match "^[A-Z_]+=") { $lines += $kv }
}
$lines += "NODE_ENV=production"
$lines += "PORT=3001"
$lines += "DATABASE_URL=postgresql://rpgstory:$DbPassword@127.0.0.1:5432/rpgstorylife?schema=public"
$lines += "REDIS_URL=redis://127.0.0.1:6379"
$lines += "FRONTEND_URL=https://$url"
$lines += "ADMIN_URL=https://$url"
$lines += "CORS_ORIGIN=https://$url"
$seen = @{}
$final = @()
foreach ($line in $lines) {
  $key = ($line -split "=", 2)[0]
  if ($seen.ContainsKey($key)) { continue }
  $seen[$key] = $true
  $final += $line
}
Set-Content -Path (Join-Path $repo "backend\.env.notebook") -Value ($final -join "`r`n") -Encoding UTF8
Write-Host "    .env.notebook gerado com $($final.Count) variaveis"

Write-Host "=== 7/8 Build de producao ==="
Push-Location $repo
npm run build
Pop-Location

Write-Host "=== 8/8 Tarefas de inicio automatico ==="
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
$backendAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$repo\scripts\start-backend.ps1`""
$backendTrigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "RPG-Backend" -Action $backendAction -Trigger $backendTrigger -RunLevel Highest -Force | Out-Null
$ngrokAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$repo\scripts\start-ngrok.ps1`""
$ngrokTrigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "RPG-Ngrok" -Action $ngrokAction -Trigger $ngrokTrigger -RunLevel Highest -Force | Out-Null

Write-Host ""
Write-Host "Setup concluido!"
Write-Host "URL publica: https://$url"
Write-Host "Proximos passos: rodar scripts\notebook-migrate.js (migrar dados) e iniciar as tarefas RPG-Backend / RPG-Ngrok."