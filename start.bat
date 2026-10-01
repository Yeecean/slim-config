@echo off
chcp 65001 > nul
cd /d "%~dp0backend"
echo Slim Config v1.1.0
echo.
python main.py
if errorlevel 1 (
    echo.
    echo 启动失败，请确认已安装依赖: pip install -r requirements.txt
    pause
)
