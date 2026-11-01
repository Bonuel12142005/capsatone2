@echo off
REM EchoTrace System Startup Script
REM This script starts all required services

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║        EchoTrace System - Automated Startup               ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Change to project directory
cd /d "C:\Users\PC\OneDrive\Desktop\capsatone2" || (
    echo Error: Project directory not found
    pause
    exit /b 1
)

REM Load the project .env before starting either service. This prevents a
REM stale process-level ECHOTRACE_SERVICE_KEY from making PHP and Flask use
REM different internal authentication keys.
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do if not "%%A"=="" set "%%A=%%B"

echo [1/3] Checking Python installation...
py --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python not found. Please install Python 3.8+
    pause
    exit /b 1
)
echo       OK - Python is available
echo.

echo [2/3] Checking MySQL connection...
py -c "import mysql.connector; mysql.connector.connect(host='127.0.0.1', user='root', password='')" >nul 2>&1
if errorlevel 1 (
    echo Error: MySQL is not running!
    echo Please start MySQL via Laragon or XAMPP first.
    echo.
    pause
    exit /b 1
)
echo       OK - MySQL is running
echo.

echo [3/3] Starting PHP Backend on http://localhost:8000
start "EchoTrace PHP Backend" cmd /k "php -S localhost:8000 index.php"
echo       OK - PHP server started
echo.

echo [4/4] Starting Python AI Microservice on http://127.0.0.1:5000
echo.
echo ════════════════════════════════════════════════════════════
"C:\Users\PC\AppData\Local\Python\pythoncore-3.14-64\python.exe" python_ai/app.py
echo ════════════════════════════════════════════════════════════
echo.
pause
