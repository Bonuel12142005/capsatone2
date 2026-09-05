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

echo [3/3] Starting Python AI Microservice on http://127.0.0.1:5000
echo.
echo ════════════════════════════════════════════════════════════
py python_ai/app.py
echo ════════════════════════════════════════════════════════════
echo.
pause
