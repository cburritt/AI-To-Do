# One-time setup: builds AI-To-Do and adds an "AI-To-Do" icon to the Desktop and Start menu.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$Host.UI.RawUI.WindowTitle = 'AI-To-Do setup'

function Fail([string]$message) {
    Write-Host $message -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "Setting up AI-To-Do" -ForegroundColor Cyan
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { Fail "The .NET 10 SDK is required: https://dotnet.microsoft.com/download" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "Node.js is required: https://nodejs.org/" }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# 1. Build (also stops any copy of the server that's already running).
& (Join-Path $PSScriptRoot 'build.ps1')
if ($LASTEXITCODE -ne 0) { exit 1 }

# 2. Icon: a blue rounded square with a white checkmark, saved as a PNG-based .ico.
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 56; $w = $size - 1
$path.AddArc(0, 0, $r, $r, 180, 90); $path.AddArc($w - $r, 0, $r, $r, 270, 90)
$path.AddArc($w - $r, $w - $r, $r, $r, 0, 90); $path.AddArc(0, $w - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(59, 91, 219))), $path)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 30
$pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
$g.DrawLines($pen, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 62, 134), (New-Object System.Drawing.Point 108, 180), (New-Object System.Drawing.Point 196, 84)))
$g.Dispose()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$ico = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ico
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)          # header: icon, 1 image
$bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0) # 256x256, no palette
$bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$png.Length); $bw.Write([UInt32]22)
$bw.Write($png); $bw.Flush()
[System.IO.File]::WriteAllBytes($IconFile, $ico.ToArray())

# 3. Shortcuts that run the launcher without a console window.
$shell = New-Object -ComObject WScript.Shell
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'AI-To-Do.lnk'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AI-To-Do.lnk'
foreach ($lnkPath in @($desktop, $startMenu)) {
    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'start.ps1')`""
    $lnk.WorkingDirectory = $Repo
    $lnk.IconLocation = $IconFile
    $lnk.WindowStyle = 7  # minimized, so no console flashes up
    $lnk.Description = 'Open AI-To-Do'
    $lnk.Save()
}

Write-Host ""
Write-Host "All set. Use the AI-To-Do icon on your Desktop or in the Start menu." -ForegroundColor Green
Write-Host "Opening it now..."
& (Join-Path $PSScriptRoot 'start.ps1')
