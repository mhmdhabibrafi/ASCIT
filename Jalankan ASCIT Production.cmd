@echo off
cd /d "%~dp0"

powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if(-not $c){exit 1}; $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$c.OwningProcess); if($p.CommandLine -match 'next start'){exit 0}; exit 2" >nul
if %errorlevel% GEQ 2 (
    echo Port 3000 sedang dipakai aplikasi lain. Hentikan aplikasi itu lalu klik ulang.
    pause
    exit /b 1
)
if errorlevel 1 (
    call npm.cmd run build
    if errorlevel 1 (
        echo Build production gagal.
        pause
        exit /b 1
    )

    start "ASCIT Production" cmd /k "node scripts/local.mjs start --skip-seed"
    powershell -NoProfile -Command "$ready=$false; for($i=0; $i -lt 60; $i++){try{if((Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){$ready=$true; break}}catch{}; Start-Sleep -Seconds 1}; if(-not $ready){exit 1}"
    if errorlevel 1 (
        echo ASCIT belum siap. Periksa jendela ASCIT Production.
        pause
        exit /b 1
    )
)

curl.exe --silent --fail --max-time 5 http://localhost:3000/api/health >nul 2>&1
if errorlevel 1 (
    echo ASCIT tidak merespons. Periksa jendela ASCIT Production.
    pause
    exit /b 1
)

start "" "http://localhost:3000"
