# ============================================================
#  Instalador do Agente Local de Impressao - Shogatsu
#  Deixa a impressao automatica funcionando neste computador,
#  sem depender de extensao de navegador nem de pop-up.
# ============================================================

$ErrorActionPreference = 'Stop'
# v89 — BUG CRÍTICO CORRIGIDO ("Não encontrei a pasta 'print-agent' do lado deste instalador"):
# esse instalador SEMPRE viveu DENTRO da própria pasta print-agent (junto de print-agent.js,
# config.json etc.) — nunca ao lado dela. Antes, $agentDir procurava por uma sub-pasta
# "print-agent" DENTRO da pasta onde o instalador está (ou seja, print-agent\print-agent\, que
# nunca existiu) — o instalador nunca funcionou, em nenhuma versão anterior, pra ninguém que
# tenha rodado ele exatamente como as instruções sempre disseram (extrair o zip e rodar
# INSTALAR.bat de dentro de print-agent/). Peço desculpa — isso deveria ter sido pego antes.
$here        = $PSScriptRoot
$agentDir    = $here
$configPath  = Join-Path $agentDir 'config.json'
$examplePath = Join-Path $agentDir 'config.example.json'
$taskName    = 'ShogatsuPrintAgent'

function Show-Titulo($texto) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor DarkYellow
    Write-Host " $texto" -ForegroundColor Yellow
    Write-Host '============================================================' -ForegroundColor DarkYellow
}

function Pausar-E-Sair($mensagem) {
    Write-Host ''
    Write-Host $mensagem -ForegroundColor Red
    Write-Host ''
    Read-Host 'Pressione ENTER para fechar'
    exit 1
}

# ------------------------------------------------------------
Show-Titulo 'Shogatsu - Instalador do Agente Local de Impressao'
Write-Host 'Isso vai deixar a impressao automatica funcionando de verdade'
Write-Host 'neste computador (sem extensao, sem pop-up bloqueado).'
Write-Host ''

$printAgentJsPath = Join-Path $agentDir 'print-agent.js'
if (-not (Test-Path $printAgentJsPath)) {
    Pausar-E-Sair "Nao encontrei o arquivo 'print-agent.js' do lado deste instalador ($agentDir). Extraia o ZIP inteiro (pasta print-agent completa) antes de rodar, e rode o INSTALAR.bat de dentro dela."
}

# ------------------------------------------------------------
Show-Titulo '1/5 - Verificando o Node.js'

function Get-NodeVersion {
    try {
        $v = (& node -v) 2>$null
        return $v
    } catch {
        return $null
    }
}

$nodeVersion = Get-NodeVersion

if (-not $nodeVersion) {
    Write-Host 'Node.js nao encontrado. Vou tentar instalar automaticamente...' -ForegroundColor Yellow

    $wingetOk = $false
    try {
        winget --version | Out-Null
        $wingetOk = $true
    } catch { $wingetOk = $false }

    if ($wingetOk) {
        Write-Host 'Instalando Node.js LTS via winget (isso pode levar alguns minutos)...'
        try {
            winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        } catch {
            Write-Host 'winget nao conseguiu instalar sozinho.' -ForegroundColor Yellow
        }
    }

    # Atualiza o PATH da sessao atual sem precisar reabrir o PowerShell
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"

    $nodeVersion = Get-NodeVersion

    if (-not $nodeVersion) {
        Write-Host ''
        Write-Host 'Nao consegui instalar o Node.js sozinho neste computador.' -ForegroundColor Red
        Write-Host 'Abrindo a pagina de download oficial - instale a versao "LTS" normalmente' -ForegroundColor Red
        Write-Host '(proximo, proximo, concluir) e depois rode este instalador de novo.' -ForegroundColor Red
        Start-Process 'https://nodejs.org/en/download'
        Pausar-E-Sair 'Instale o Node.js e rode INSTALAR.bat novamente.'
    }
}

Write-Host "Node.js OK ($nodeVersion)" -ForegroundColor Green

# ------------------------------------------------------------
Show-Titulo '2/5 - Instalando dependencias do agente'

Push-Location $agentDir
try {
    Write-Host 'Rodando npm install (baixa o que falta para falar com a impressora)...'
    & npm install --no-fund --no-audit 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) {
        throw 'npm install terminou com erro.'
    }
} catch {
    Pop-Location
    Pausar-E-Sair "O 'npm install' falhou. Confira sua internet e rode o instalador de novo. Detalhe: $_"
}
Pop-Location

Write-Host 'Dependencias instaladas.' -ForegroundColor Green

# ------------------------------------------------------------
Show-Titulo '3/5 - Configuracao (config.json)'

if (Test-Path $configPath) {
    Write-Host 'Ja existe um config.json nesta pasta.'
    $resp = Read-Host 'Quer manter o que ja esta configurado? (S = manter / N = refazer do zero)'
    $refazer = ($resp -match '^[Nn]')
} else {
    $refazer = $true
}

if ($refazer) {
    Write-Host ''
    Write-Host 'Responda as perguntas abaixo (ENTER para aceitar o valor sugerido entre colchetes).'
    Write-Host ''

    $serverUrl = Read-Host 'Endereco do site do painel [https://shogatsu-pedidos.onrender.com]'
    if ([string]::IsNullOrWhiteSpace($serverUrl)) { $serverUrl = 'https://shogatsu-pedidos.onrender.com' }

    $username = Read-Host 'Usuario de login do painel [admin]'
    if ([string]::IsNullOrWhiteSpace($username)) { $username = 'admin' }

    $securePwd = Read-Host 'Senha desse usuario do painel' -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
    $password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    $config = Get-Content $examplePath -Raw | ConvertFrom-Json
    $config.serverUrl = $serverUrl
    $config.username  = $username
    $config.password  = $password

    $config | ConvertTo-Json -Depth 6 | Set-Content -Path $configPath -Encoding UTF8

    Write-Host ''
    Write-Host 'Criei o config.json com o basico preenchido.' -ForegroundColor Green
    Write-Host 'FALTA UMA COISA que so voce sabe: os dados de CADA impressora' -ForegroundColor Yellow
    Write-Host '(nome da impressora USB ou o IP de rede de cada uma, e quais' -ForegroundColor Yellow
    Write-Host 'estacoes - caixa, cozinha, sushibar - cada impressora cobre).' -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Vou abrir o arquivo no Bloco de Notas. Ajuste a lista "printers"' -ForegroundColor Yellow
    Write-Host 'e SALVE (Ctrl+S) antes de fechar. Se usar so uma impressora para' -ForegroundColor Yellow
    Write-Host 'tudo, deixe so um item na lista e coloque as 3 estacoes em "stations".' -ForegroundColor Yellow
    Write-Host ''
    Read-Host 'Pressione ENTER para abrir o config.json'
    Start-Process notepad.exe $configPath -Wait
}

Write-Host 'Configuracao definida.' -ForegroundColor Green

# ------------------------------------------------------------
Show-Titulo '4/5 - Deixando o agente ligado sozinho no Windows'

$nodeExe = (Get-Command node).Source

try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

# v86 — CORRIGIDO: antes, a tarefa agendada chamava node.exe diretamente. O node.exe É um
# programa de console — mesmo numa tarefa "Hidden" (essa opção só esconde a tarefa da LISTA do
# Agendador de Tarefas, não a janela!), o Windows ainda abre uma janela preta de terminal com o
# agente rodando. Qualquer pessoa da loja podia fechar essa janela sem saber o que era ("parece
# um erro"), o que MATA o processo inteiro — parando a impressão automática de TODAS as vias de
# uma vez (Sushibar, Delivery, Expedição, todas), não só uma. Agora a tarefa chama um pequeno
# lançador VBScript (run-hidden.vbs, gerado aqui do lado do print-agent.js) que inicia o node.exe
# com a janela criada já oculta (WshShell.Run com estilo 0) — o processo continua rodando
# normalmente em segundo plano, só não aparece mais nenhuma janela pra ninguém fechar por engano.
$hiddenLauncherPath = Join-Path $agentDir 'run-hidden.vbs'
$vbsContent = "Set WshShell = CreateObject(`"WScript.Shell`")`r`n" +
    "WshShell.CurrentDirectory = `"$agentDir`"`r`n" +
    "WshShell.Run `"`"`"$nodeExe`"`" `"`"print-agent.js`"`"`", 0, False`r`n"
Set-Content -Path $hiddenLauncherPath -Value $vbsContent -Encoding Unicode

$wscriptExe = Join-Path $env:WINDIR 'System32\wscript.exe'
$action  = New-ScheduledTaskAction -Execute $wscriptExe -Argument ('"' + $hiddenLauncherPath + '"') -WorkingDirectory $agentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) -Hidden

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Agente local de impressao automatica do Shogatsu' | Out-Null

Write-Host 'Tarefa agendada criada - o agente liga sozinho toda vez que o Windows abrir, sem nenhuma janela visivel.' -ForegroundColor Green

# ------------------------------------------------------------
Show-Titulo '5/5 - Ligando o agente agora'

try { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

$rodando = Get-Process -Name node -ErrorAction SilentlyContinue
if ($rodando) {
    Write-Host 'Agente rodando agora mesmo.' -ForegroundColor Green
} else {
    Write-Host 'Nao consegui confirmar se o processo subiu - confira o arquivo print-agent.log' -ForegroundColor Yellow
    Write-Host 'nesta pasta, ou clique duas vezes em VER-LOGS.bat.' -ForegroundColor Yellow
}

Show-Titulo 'Pronto!'
Write-Host 'Agora abra o painel Shogatsu no navegador, va em'
Write-Host '  Configuracoes -> card "Impressao Automatica"'
Write-Host 'e confira se a caixinha de status mostra um V verde (Agente Local conectado)'
Write-Host 'cobrindo todas as vias que voce configurou nesse computador.'
Write-Host ''
Write-Host 'Nao vai aparecer nenhuma janela preta quando o Windows ligar de agora em diante -' -ForegroundColor Green
Write-Host 'o agente roda escondido, entao ninguem consegue fechar ele sem querer.' -ForegroundColor Green
Write-Host ''
Write-Host 'Dica: agora que o Agente Local esta ativo, pode desligar/remover a'
Write-Host 'extensao "Shogatsu - Impressao Automatica" do Chrome - ela nao e mais necessaria.'
Write-Host ''
Read-Host 'Pressione ENTER para fechar'
