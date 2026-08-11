@echo off
title Shogatsu - Remover o Agente Local de Impressao
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar.ps1"
