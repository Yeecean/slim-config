$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir\backend"

Write-Host "Slim Config v1.1.0" -ForegroundColor Cyan
Write-Host ""

try {
    python main.py
} catch {
    Write-Host "启动失败，请确认已安装依赖: pip install -r requirements.txt" -ForegroundColor Red
    Read-Host "按 Enter 键退出"
}
