@echo off
REM EchoTrace Maintenance Mode Manager for Windows
REM Usage: maintenance.bat [enable|disable|status] [options]

setlocal enabledelayedexpansion

if "%1"=="" (
    echo EchoTrace Maintenance Mode Manager
    echo Usage: maintenance.bat ^<command^> [options]
    echo.
    echo Commands:
    echo   enable    Enable maintenance mode
    echo   disable   Disable maintenance mode
    echo   status    Show current maintenance status
    echo.
    echo Options for 'enable':
    echo   --message="Your message"    Custom maintenance message
    echo   --ip=192.168.1.100         Add allowed IP address
    echo.
    echo Examples:
    echo   maintenance.bat enable
    echo   maintenance.bat enable --message="Updating database" --ip=192.168.1.100
    echo   maintenance.bat disable
    echo   maintenance.bat status
    exit /b 1
)

set COMMAND=%1
set MESSAGE=
set ALLOWED_IP=

REM Parse arguments
:parse_args
shift
if "%1"=="" goto execute
if "%1" NEQ "" (
    echo %1 | findstr /c:"--message=" >nul
    if !errorlevel! equ 0 (
        set MESSAGE=%1
        set MESSAGE=!MESSAGE:--message=!
        set MESSAGE=!MESSAGE:"=!
        set MESSAGE=!MESSAGE:~1!
    )
    
    echo %1 | findstr /c:"--ip=" >nul
    if !errorlevel! equ 0 (
        set ALLOWED_IP=%1
        set ALLOWED_IP=!ALLOWED_IP:--ip=!
        set ALLOWED_IP=!ALLOWED_IP:"=!
        set ALLOWED_IP=!ALLOWED_IP:~1!
    )
)
goto parse_args

:execute
if "%COMMAND%"=="enable" goto enable_maintenance
if "%COMMAND%"=="disable" goto disable_maintenance
if "%COMMAND%"=="status" goto show_status
echo Error: Unknown command '%COMMAND%'
exit /b 1

:enable_maintenance
if "%MESSAGE%"=="" set MESSAGE=EchoTrace is currently undergoing maintenance. Please check back shortly.
echo Enabling maintenance mode...
echo Message: %MESSAGE%
if not "%ALLOWED_IP%"=="" echo Allowed IP: %ALLOWED_IP%

php maintenance.php enable --message="%MESSAGE%" %ALLOWED_IP:~0,1%%ALLOWED_IP:~1%
if !errorlevel! equ 0 (
    echo.
    echo ✓ Maintenance mode ENABLED
    echo IMPORTANT: Save the admin key shown above to bypass maintenance mode!
) else (
    echo ✗ Failed to enable maintenance mode
    exit /b 1
)
goto end

:disable_maintenance
echo Disabling maintenance mode...
php maintenance.php disable
if !errorlevel! equ 0 (
    echo ✓ Maintenance mode DISABLED
    echo System is now accessible to all users
) else (
    echo ✗ Failed to disable maintenance mode
    exit /b 1
)
goto end

:show_status
php maintenance.php status
goto end

:end
endlocal