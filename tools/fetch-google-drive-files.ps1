# Download Google Drive feature files from GitHub main into this PTS folder.
# Run in PowerShell from project root:
#   powershell -ExecutionPolicy Bypass -File tools/fetch-google-drive-files.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'backend'))) {
  $root = Get-Location
}
Set-Location $root

$base = 'https://raw.githubusercontent.com/Ncry46/PTS/main'
$files = @(
  'backend/googleDrive.js',
  'backend/googleCalendarRoutes.js',
  'backend/profileRoutes.js',
  'backend/learningRoutes.js',
  'backend/server.js',
  'backend/google.local.example.js',
  'GOOGLE_DRIVE.md',
  '.env.example',
  '.gitignore'
)

Write-Host "Downloading Drive files into: $root"
foreach ($rel in $files) {
  $url = "$base/$rel"
  $dest = Join-Path $root ($rel -replace '/', '\')
  $dir = Split-Path -Parent $dest
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  Write-Host "  GET $rel"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

$check = Join-Path $root 'backend\googleDrive.js'
if (Test-Path $check) {
  Write-Host ""
  Write-Host "OK: backend\googleDrive.js is ready"
  Write-Host "Next: put google-service-account.json in backend\, set GOOGLE_DRIVE_FOLDER_ID in .env, then npm start"
} else {
  Write-Host "FAILED: googleDrive.js still missing"
  exit 1
}
