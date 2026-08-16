$repo = "C:\Users\Dark\Desktop\RPG-Story-Life-Text"
$log = Join-Path $repo "logs\backend.log"
Set-Location (Join-Path $repo "backend")
while ($true) {
  node --env-file=.env.notebook dist/server.js *>> $log
  Start-Sleep -Seconds 5
}