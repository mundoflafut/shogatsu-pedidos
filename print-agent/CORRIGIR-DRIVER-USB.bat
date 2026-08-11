@echo off
cd /d "%~dp0print-agent"
echo ============================================
echo   Trocando para um driver USB mais moderno
echo ============================================
echo.
echo Removendo a versao antiga que nao funciona...
call npm uninstall printer
echo.
echo Instalando a versao moderna (ja vem pronta, sem compilar)...
call npm install printer@npm:@thiagoelg/node-printer
echo.
echo ============================================
echo TERMINOU. Tira um print de TUDO nesta janela,
echo de cima a baixo.
echo ============================================
pause
