@echo off
setlocal
set "PROJECT=D:\ascit"
if not exist "%PROJECT%\package.json" (
  echo Folder proyek tidak ditemukan: %PROJECT%
  echo Ubah variabel PROJECT pada file CMD sesuai lokasi ASCIT.
  pause
  exit /b 1
)
node "%~dp0buat-lampiran-b.mjs" "%PROJECT%"
echo.
pause
