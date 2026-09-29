# Shared paths and helpers for the launcher scripts.

$Repo      = Split-Path $PSScriptRoot -Parent
$DataDir   = Join-Path $env:LOCALAPPDATA 'AiTodo'
$AppDir    = Join-Path $DataDir 'app'              # published build the desktop icon runs
$Exe       = Join-Path $AppDir 'AiTodo.Api.exe'
$StampFile = Join-Path $AppDir '.source-stamp'     # newest source timestamp at the last build
$IconFile  = Join-Path $DataDir 'AI-To-Do.ico'
$LogFile   = Join-Path $DataDir 'server.log'
$Url       = 'http://localhost:5080'

function Test-Server {
    try { (Invoke-WebRequest "$Url/api/ping" -UseBasicParsing -TimeoutSec 2).StatusCode -lt 400 }
    catch { $false }
}

# Newest last-write time across the app's source files, used to detect code changes since the last build.
function Get-SourceStamp {
    $files = @(Get-ChildItem (Join-Path $Repo 'src\Api') -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\(bin|obj|wwwroot)\\' })
    $files += @(Get-ChildItem (Join-Path $Repo 'src\web\src') -Recurse -File)
    $files += @('index.html', 'package.json', 'vite.config.ts' | ForEach-Object { Get-Item (Join-Path $Repo "src\web\$_") })
    ($files | Sort-Object LastWriteTimeUtc | Select-Object -Last 1).LastWriteTimeUtc.Ticks.ToString()
}

function Test-BuildCurrent {
    (Test-Path $Exe) -and (Test-Path $StampFile) -and ((Get-Content $StampFile -Raw).Trim() -eq (Get-SourceStamp))
}

function Stop-AppServer {
    Get-Process AiTodo.Api -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 500
}

function Find-AppBrowser {
    @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
