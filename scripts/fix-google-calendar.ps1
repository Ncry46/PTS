# PTS Learning — ติดตั้ง Google Calendar แล้วรีสตาร์ทเซิร์ฟเวอร์
# รันใน PowerShell:
#   cd C:\Users\Admin_Support\Desktop\BD-PTS\PTS
#   powershell -ExecutionPolicy Bypass -File .\scripts\fix-google-calendar.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'backend\server.js'))) {
    $Root = (Get-Location).Path
}
Set-Location $Root
Write-Host "โฟลเดอร์โปรเจกต์: $Root" -ForegroundColor Cyan

if (-not (Test-Path 'backend\server.js')) {
    Write-Host "ไม่พบ backend\server.js — เปิด PowerShell ในโฟลเดอร์ PTS ก่อน" -ForegroundColor Red
    exit 1
}

Write-Host "`n[1/5] ดึงโค้ดล่าสุด..." -ForegroundColor Yellow
git fetch origin
git reset --hard origin/cursor/complete-missing-features-eb8c

Write-Host "`n[2/5] สร้าง backend\google.local.js (ถ้ายังไม่มี)..." -ForegroundColor Yellow
$gcalPath = Join-Path $Root 'backend\google.local.js'
$examplePath = Join-Path $Root 'backend\google.local.example.js'
if (-not (Test-Path $gcalPath)) {
    if (Test-Path $examplePath) {
        Copy-Item $examplePath $gcalPath -Force
    } else {
        @"
module.exports = {
    clientId: 'PASTE_CLIENT_ID_HERE',
    clientSecret: 'PASTE_CLIENT_SECRET_HERE',
    redirectUri: 'http://localhost:3000/api/google/oauth/callback',
    appBaseUrl: 'http://localhost:3000'
};
"@ | Set-Content -Path $gcalPath -Encoding UTF8
    }
    Write-Host "สร้างไฟล์แล้ว: $gcalPath" -ForegroundColor Green
    Write-Host "เปิดไฟล์นี้แล้วใส่ clientId / clientSecret จาก Google Cloud แล้วบันทึก" -ForegroundColor Yellow
    if (Get-Command notepad -ErrorAction SilentlyContinue) {
        Start-Process notepad $gcalPath -Wait
    }
} else {
    Write-Host "มีไฟล์อยู่แล้ว: $gcalPath" -ForegroundColor Green
}

# ตรวจว่ายังเป็นค่าว่าง/ตัวอย่างอยู่หรือไม่
$raw = Get-Content $gcalPath -Raw
if ($raw -match "PASTE_CLIENT|clientId:\s*''" ) {
    Write-Host "ยังไม่ได้ใส่ Client ID/Secret ใน google.local.js" -ForegroundColor Red
    exit 1
}

Write-Host "`n[3/5] ปิด Node ที่ใช้พอร์ต 3000 (เซิร์ฟเวอร์เก่า)..." -ForegroundColor Yellow
try {
    $conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $conns) {
        if ($procId -and $procId -ne 0) {
            Write-Host "ฆ่า process $procId"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
} catch {}
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "หยุด node PID $($_.Id)"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

Write-Host "`n[4/5] ตรวจไฟล์ระบบ Google Calendar..." -ForegroundColor Yellow
$need = @(
    'backend\googleCalendar.js',
    'backend\googleCalendarRoutes.js',
    'backend\google.local.js'
)
foreach ($f in $need) {
    if (Test-Path $f) { Write-Host "OK $f" -ForegroundColor Green }
    else { Write-Host "ขาด $f" -ForegroundColor Red; exit 1 }
}

Write-Host "`n[5/5] สตาร์ทเซิร์ฟเวอร์..." -ForegroundColor Yellow
Write-Host "หลังขึ้น Server running ให้เปิด:" -ForegroundColor Cyan
Write-Host "  http://localhost:3000/api/google/status"
Write-Host "ต้องเห็น JSON มี configured: true"
Write-Host "แล้วไป http://localhost:3000/Settings.html กด เชื่อมต่อ Google Calendar"
Write-Host ""

npm start
