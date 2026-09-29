# Builds the website and publishes the app to %LOCALAPPDATA%\AiTodo\app.
# Run by setup, and by the desktop icon whenever the code has changed.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$Host.UI.RawUI.WindowTitle = 'AI-To-Do: building'

try {
    Write-Host "Building AI-To-Do. This takes about a minute..." -ForegroundColor Cyan
    $stamp = Get-SourceStamp

    Push-Location (Join-Path $Repo 'src\web')
    try {
        if (-not (Test-Path 'node_modules')) {
            Write-Host "Installing website packages..."
            npm install --no-fund --no-audit
            if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
        }
        Write-Host "Building the website..."
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'The website build failed.' }
    }
    finally { Pop-Location }

    Stop-AppServer  # the running copy locks its files
    if (Test-Path (Join-Path $AppDir 'wwwroot')) { Remove-Item (Join-Path $AppDir 'wwwroot') -Recurse -Force }

    Write-Host "Building the server..."
    dotnet publish (Join-Path $Repo 'src\Api') -c Release -o $AppDir -p:SkipWeb=true --nologo -v quiet
    if ($LASTEXITCODE -ne 0) { throw 'The server build failed.' }

    Set-Content -Path $StampFile -Value $stamp -Encoding ascii
    Write-Host "Done." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "Build failed: $_" -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}
