$taskName = 'ShogatsuPrintAgent'

Write-Host ''
Write-Host 'Removendo o Agente Local de Impressao do Shogatsu deste computador...' -ForegroundColor Yellow

try {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'Tarefa agendada removida.' -ForegroundColor Green
} catch {
    Write-Host 'Nenhuma tarefa agendada encontrada (ja estava removida).' -ForegroundColor Yellow
}

Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'O agente nao vai mais ligar sozinho. Os arquivos desta pasta (incluindo o'
Write-Host 'config.json com a senha) continuam no disco - apague a pasta manualmente'
Write-Host 'se quiser remover tudo por completo.'
Write-Host ''
Read-Host 'Pressione ENTER para fechar'
