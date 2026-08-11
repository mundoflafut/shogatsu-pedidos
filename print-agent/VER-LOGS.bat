@echo off
cd /d "%~dp0print-agent"
if exist print-agent.log (
    notepad.exe print-agent.log
) else (
    echo Ainda nao existe nenhum log - o agente talvez nunca tenha rodado com sucesso.
    echo Rode o INSTALAR.bat primeiro, ou o REINICIAR-AGENTE.bat.
    pause
)
