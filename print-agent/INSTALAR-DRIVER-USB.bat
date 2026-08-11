@echo off
cd /d "%~dp0print-agent"
echo ============================================
echo   Instalando o pacote "printer" (driver USB)
echo ============================================
echo.
echo Pasta atual:
cd
echo.
echo Isso pode demorar 1-2 minutos, espera terminar...
echo.
call npm install printer
echo.
echo ============================================
echo TERMINOU. Tira um print de TUDO nesta janela,
echo de cima a baixo (principalmente se tiver
echo qualquer coisa em vermelho ou escrito "error").
echo ============================================
pause
