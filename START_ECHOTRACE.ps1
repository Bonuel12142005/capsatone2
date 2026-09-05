#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Automated startup script for EchoTrace system
.DESCRIPTION
    Starts all required services for EchoTrace (MySQL, Python AI, PHP Backend)
.NOTES
    Run with: powershell -ExecutionPolicy Bypass -File START_ECHOTRACE.ps1
#>

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        EchoTrace System - Automated Startup Script         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Configuration
$PROJECT_ROOT = "C:\Users\PC\OneDrive\Desktop\capsatone2"
$PYTHON_AI_DIR = Join-Path $PROJECT_ROOT "python_ai"
$BACKEND_DIR = Join-Path $PROJECT_ROOT "backend"
$FRONTEND_DIR = Join-Path $PROJECT_ROOT "frontend"

# Colors
$SUCCESS = "Green"
$ERROR = "Red"
$WARNING = "Yellow"
$INFO = "Cyan"

# Check Python
Write-Host "[1/4] Checking Python installation..." -ForegroundColor $INFO
try {
    $pythonVersion = py --version 2>&1
    Write-Host "      ✓ Python found: $pythonVersion" -ForegroundColor $SUCCESS
} catch {
    Write-Host "      ✗ Python not found. Install Python 3.8+" -ForegroundColor $ERROR
    exit 1
}

# Check required packages
Write-Host "[2/4] Checking Python dependencies..." -ForegroundColor $INFO
$packages = @("flask", "mysql-connector-python", "scikit-learn", "nltk")
$missing = @()
foreach ($package in $packages) {
    $check = py -m pip show $package 2>$null
    if ($check) {
        Write-Host "      ✓ $package" -ForegroundColor $SUCCESS
    } else {
        $missing += $package
    }
}

if ($missing.Count -gt 0) {
    Write-Host "      ⚠ Missing packages: $($missing -join ', ')" -ForegroundColor $WARNING
    Write-Host "      Installing..." -ForegroundColor $INFO
    py -m pip install -r (Join-Path $PYTHON_AI_DIR "requirements.txt") | Out-Null
}

# Check MySQL connection
Write-Host "[3/4] Checking MySQL connection..." -ForegroundColor $INFO
$mysqlCheck = py -c "import mysql.connector; mysql.connector.connect(host='127.0.0.1', user='root', password=''); print('OK')" 2>&1
if ($mysqlCheck -like "*OK*") {
    Write-Host "      ✓ MySQL is running on 127.0.0.1:3306" -ForegroundColor $SUCCESS
} else {
    Write-Host "      ✗ MySQL is not running!" -ForegroundColor $ERROR
    Write-Host "      Please start MySQL via Laragon/XAMPP and try again." -ForegroundColor $WARNING
    Write-Host ""
    Write-Host "      Quick start Laragon: Start-Process 'C:\laragon\laragon.exe'" -ForegroundColor $INFO
    exit 1
}

# Start Python AI Service
Write-Host "[4/4] Starting Python AI Microservice..." -ForegroundColor $INFO
Write-Host ""
Write-Host "      Launching Flask server on http://127.0.0.1:5000" -ForegroundColor $INFO
Write-Host ""

$pythonScript = Join-Path $PYTHON_AI_DIR "app.py"
Start-Process py -ArgumentList $pythonScript -NoNewWindow -PassThru

Start-Sleep -Seconds 3

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor $SUCCESS
Write-Host "║              ✓ EchoTrace Services Started!                 ║" -ForegroundColor $SUCCESS
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor $SUCCESS
Write-Host ""

Write-Host "Available Services:" -ForegroundColor $INFO
Write-Host "  • Python AI Engine:  http://127.0.0.1:5000" -ForegroundColor $SUCCESS
Write-Host "  • Backend API:       http://127.0.0.1:8000 (if running PHP)" -ForegroundColor $SUCCESS
Write-Host "  • Frontend:          $FRONTEND_DIR" -ForegroundColor $SUCCESS
Write-Host "  • Database:          127.0.0.1:3306 (echotrace)" -ForegroundColor $SUCCESS
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor $INFO
Write-Host "  1. Keep this window open (Python AI is running)" -ForegroundColor "Cyan"
Write-Host "  2. Open another PowerShell and run:" -ForegroundColor "Cyan"
Write-Host "     cd $BACKEND_DIR" -ForegroundColor "DarkCyan"
Write-Host "     php -S localhost:8000" -ForegroundColor "DarkCyan"
Write-Host "  3. Open browser to: http://localhost:8000/../frontend/" -ForegroundColor "Cyan"
Write-Host "  4. Login with: admin / Admin123!" -ForegroundColor "Cyan"
Write-Host ""

Write-Host "Press CTRL+C to stop the Python AI service." -ForegroundColor $WARNING
Read-Host "Press Enter to exit this script and let services run"
