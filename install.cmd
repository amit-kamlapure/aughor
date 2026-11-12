@echo off
rem Pramanyx installer for Windows. Runs install.ps1 without changing PowerShell's execution policy.
rem   install.cmd               install everything Pramanyx needs, start it, open it in a browser
rem   install.cmd --no-start    install only
rem   install.cmd --help        every option
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
exit /b %ERRORLEVEL%
