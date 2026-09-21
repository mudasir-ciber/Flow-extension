@echo off
cd /d "%~dp0"
echo ======================================================
echo   AMJAD'S FLOW EXTENSION - Pushing to GitHub
echo   Repo: https://github.com/mudasir-ciber/Flow-extension.git
echo ======================================================
echo.
d:\tools\git\cmd\git.exe push -u origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Code successfully pushed to GitHub!
) else (
    echo [NOTICE] If GitHub asked to sign in, complete the login in your browser window.
)
echo.
pause
