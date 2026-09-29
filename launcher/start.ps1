# What the AI-To-Do desktop icon runs: makes sure the server is up to date and running,
# then opens the app in its own browser window.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Show-Error([string]$message) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($message, 'AI-To-Do', 'OK', 'Error') | Out-Null
    exit 1
}

# Rebuild first if this is the first run or the code changed (shows a progress window).
if (-not (Test-BuildCurrent)) {
    $p = Start-Process powershell -Wait -PassThru -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $PSScriptRoot 'build.ps1')`"")
    if ($p.ExitCode -ne 0) { exit 1 }
}

if (-not (Test-Server)) {
    # --ExitWhenIdleMinutes: the server stops itself a few minutes after the app window is closed.
    Start-Process -FilePath $Exe -WorkingDirectory $AppDir -WindowStyle Hidden `
        -ArgumentList '--urls', $Url, '--ExitWhenIdleMinutes', '5' `
        -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err"

    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Server)) {
        if ((Get-Date) -gt $deadline) { Show-Error "AI-To-Do didn't start. Details are in:`n$LogFile.err" }
        Start-Sleep -Milliseconds 300
    }
}

$browser = Find-AppBrowser
if ($browser) {
    Start-Process $browser -ArgumentList "--app=$Url", '--window-size=1200,860'
} else {
    Start-Process $Url
}
