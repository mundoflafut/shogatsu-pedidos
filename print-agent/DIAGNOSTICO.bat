@echo off
cd /d "%~dp0print-agent"
echo ============================================
echo   DIAGNOSTICO - Shogatsu Print Agent
echo ============================================
echo.
echo Pasta atual:
cd
echo.
echo Arquivos nesta pasta:
dir /b
echo.
echo ============================================
echo Versao do Node.js instalada:
node -v
echo.
echo ============================================
echo Rodando o agente agora (isso NAO fecha sozinho)...
echo ============================================
echo.
node print-agent.js
echo.
echo ============================================
echo O AGENTE PAROU DE RODAR (ou nunca chegou a rodar).
echo Tira um print de TUDO nesta janela, de cima a baixo.
echo ============================================
pause
