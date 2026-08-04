# Force-update PTS auth background code on this PC
# Run in PowerShell from anywhere:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\Admin_Support\Desktop\PA\PTS\tools\force-update-auth-bg.ps1"

$ErrorActionPreference = "Stop"
$Root = "C:\Users\Admin_Support\Desktop\PA\PTS"

if (-not (Test-Path $Root)) {
  Write-Host "ERROR: ไม่พบโฟลเดอร์ $Root" -ForegroundColor Red
  Write-Host "แก้ path ในสคริปต์ให้ตรงกับที่คุณรัน npm start จริง"
  exit 1
}

Set-Location $Root
Write-Host "== PTS folder ==" $Root
Write-Host "== git remote ==" (git remote get-url origin)
Write-Host "== before ==" (git log -1 --oneline)

git fetch origin main
git checkout main
git pull origin main

Write-Host "== after ==" (git log -1 --oneline)

$login = Get-Content ".\frontend\Login.html" -Raw
if ($login -notmatch 'data-pts-auth-build="iri3-20260804"') {
  Write-Host "WARNING: Login.html ยังไม่มี build stamp ใหม่ — อาจ pull คนละ repo/branch" -ForegroundColor Yellow
} else {
  Write-Host "OK: Login.html มี build stamp ใหม่แล้ว" -ForegroundColor Green
}

if ($login -match 'auth-geo\.svg|pts-auth-scene__geo') {
  Write-Host "WARNING: ยังมีอ้างอิง geo เก่าใน Login.html" -ForegroundColor Yellow
} else {
  Write-Host "OK: ไม่มี geo layer ใน Login.html" -ForegroundColor Green
}

Write-Host ""
Write-Host "ถัดไป:"
Write-Host "1) ปิด node/server เก่าทั้งหมด (Task Manager ถ้าจำเป็น)"
Write-Host "2) ในโฟลเดอร์นี้รัน: npm install"
Write-Host "3) รัน: npm start"
Write-Host "4) เปิด http://localhost:3000/Login.html แล้ว Ctrl+F5"
Write-Host "5) มุมขวาล่างต้องมีป้าย 'AUTH BG NEW' และพื้นหลังต้องเป็นแดงเคลื่อนไหว ไม่ใช่วงกลมลาย"
