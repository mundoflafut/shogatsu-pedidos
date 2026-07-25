@echo off
REM ===============================================================
REM  Gera o shogatsu-print-agent.exe a partir do codigo-fonte.
REM  So precisa rodar isso UMA VEZ (ou de novo se o codigo mudar).
REM  Precisa de internet e do Node.js instalado so nesta etapa.
REM ===============================================================
echo.
echo Instalando dependencias...
call npm install
if errorlevel 1 goto erro

echo.
echo Gerando o executavel (isso baixa o Node.js empacotado, pode demorar um pouco)...
call npx pkg . --targets node18-win-x64 --output dist\shogatsu-print-agent.exe
if errorlevel 1 goto erro

echo.
echo ============================================================
echo  Pronto! O arquivo esta em: dist\shogatsu-print-agent.exe
echo  Copie esse .exe + o config.json para a pasta final no
echo  computador do restaurante. Nao precisa mais do Node.js la.
echo ============================================================
pause
exit /b 0

:erro
echo.
echo Algo deu errado. Confira se o Node.js (18+) esta instalado
echo e se ha conexao com a internet.
pause
exit /b 1
