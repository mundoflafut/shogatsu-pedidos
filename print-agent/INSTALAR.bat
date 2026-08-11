@echo off
title Shogatsu - Instalador do Agente Local de Impressao
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
