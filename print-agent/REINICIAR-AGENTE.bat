@echo off
title Shogatsu - Reiniciar Agente de Impressao
echo Reiniciando o Agente Local de Impressao...
powershell -NoProfile -Command "Stop-ScheduledTask -TaskName 'ShogatsuPrintAgent' -ErrorAction SilentlyContinue; Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Start-ScheduledTask -TaskName 'ShogatsuPrintAgent'"
echo.
echo Pronto. Confira o status em Configuracoes -^> Impressao Automatica no painel.
echo.
pause
