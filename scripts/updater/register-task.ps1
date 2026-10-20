param([string]$UpdateHome = "$PSScriptRoot\..\..\.local\updater")
$ErrorActionPreference = 'Stop'
$homePath = (Resolve-Path -LiteralPath $UpdateHome).Path
$worker = Join-Path $homePath 'engine\worker.mjs'
if (-not (Test-Path -LiteralPath $worker)) { throw 'Jalankan node scripts/updater/setup.mjs terlebih dahulu.' }
if (Get-ScheduledTask -TaskName 'ASCIT Updater' -ErrorAction SilentlyContinue) { throw 'Task sudah ada; konfigurasi tidak ditimpa.' }
$node = (Get-Command node.exe).Source
$action = New-ScheduledTaskAction -Execute $node -Argument ('"{0}" "{1}"' -f $worker, $homePath) -WorkingDirectory $homePath
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
# Run from an elevated PowerShell; credentials are entered locally, never stored in the repository.
$credential = Get-Credential -Message 'Akun Windows khusus untuk menjalankan ASCIT (akses folder aplikasi, updater, dan database)'
Register-ScheduledTask -TaskName 'ASCIT Updater' -Action $action -Trigger $trigger -Settings $settings -User $credential.UserName -Password $credential.GetNetworkCredential().Password | Out-Null
Write-Output 'Task terdaftar. Hentikan launcher lama, lalu Start-ScheduledTask -TaskName "ASCIT Updater".'
