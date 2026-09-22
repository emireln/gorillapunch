# GorillaPunch Windows Installer Bootstrap
# Usage:
#   irm https://gorillapunch.run/install.ps1 | iex
#   irm https://gorillapunch.run/install.ps1 | & { [scriptblock]::Create($input) } -Silent

[CmdletBinding()]
param(
  [switch]$Silent
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$appName = "GorillaPunch"
$releaseApiUrl = "https://api.github.com/repos/emireln/gorillapunch/releases/latest"
$fallbackDownloadUrl = "https://github.com/emireln/gorillapunch/releases/latest/download/GorillaPunch-Setup.exe"

Write-Host ""
Write-Host "  🥊 GorillaPunch — Windows Desktop Setup" -ForegroundColor Magenta
Write-Host "  =========================================" -ForegroundColor DarkGray

try {
  $tempDir = [System.IO.Path]::GetTempPath()
  $installerPath = Join-Path $tempDir "GorillaPunch-Setup.exe"

  Write-Host "  [1/3] Resolving latest release..." -ForegroundColor Cyan
  $downloadUrl = $fallbackDownloadUrl

  try {
    $headers = @{ "User-Agent" = "GorillaPunch-Installer" }
    $release = Invoke-RestMethod -Uri $releaseApiUrl -Headers $headers -TimeoutSec 10
    $exeAsset = $release.assets | Where-Object { $_.name -like "*Setup*.exe" -or $_.name -like "*.exe" } | Select-Object -First 1
    if ($exeAsset -and $exeAsset.browser_download_url) {
      $downloadUrl = $exeAsset.browser_download_url
      Write-Host "  [+] Found release: $($release.tag_name)" -ForegroundColor DarkCyan
    }
  } catch {
    Write-Host "  [!] Direct API check skipped, using latest download endpoint." -ForegroundColor DarkGray
  }

  Write-Host "  [2/3] Downloading GorillaPunch installer..." -ForegroundColor Cyan
  if (Test-Path $installerPath) {
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
  }

  Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing

  if (-not (Test-Path $installerPath)) {
    throw "Failed to download installer to $installerPath"
  }

  $fileSizeMb = [math]::Round(((Get-Item $installerPath).Length / 1MB), 1)
  Write-Host "  [+] Downloaded ($fileSizeMb MB) successfully." -ForegroundColor Green

  if ($Silent) {
    Write-Host "  [3/3] Installing silently in background..." -ForegroundColor Cyan
    Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait
    Write-Host "  🥊 GorillaPunch installed successfully! Launch it from the Start menu." -ForegroundColor Green
  } else {
    Write-Host "  [3/3] Launching installer wizard..." -ForegroundColor Green
    Start-Process -FilePath $installerPath
    Write-Host "  🥊 Setup wizard launched. Follow on-screen instructions to finish." -ForegroundColor Magenta
  }
} catch {
  Write-Host ""
  Write-Host "  ❌ Installation failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  You can manually download the installer at:" -ForegroundColor Yellow
  Write-Host "  https://github.com/emireln/gorillapunch/releases/latest" -ForegroundColor DarkCyan
  Write-Host ""
}
