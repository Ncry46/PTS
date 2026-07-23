@echo off
REM สร้าง backend\google.local.js ถ้ายังไม่มี แล้วแนะนำรัน npm start
cd /d "%~dp0.."
if exist "backend\google.local.js" (
  echo [OK] มีไฟล์ backend\google.local.js แล้ว
) else (
  if not exist "backend\google.local.example.js" (
    echo [ERROR] ไม่พบ backend\google.local.example.js — ดึงโค้ดล่าสุดก่อน
    pause
    exit /b 1
  )
  copy /Y "backend\google.local.example.js" "backend\google.local.js" >nul
  echo [CREATED] backend\google.local.js
  echo เปิดไฟล์นี้แล้วใส่ clientId / clientSecret จาก Google Cloud
  notepad "backend\google.local.js"
)
echo.
echo จากนั้นรัน: npm start
echo เปิด: http://localhost:3000/Settings.html
echo กดปุ่ม: เชื่อมต่อ Google Calendar
pause
