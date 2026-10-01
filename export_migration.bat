@echo off
cd /d "%~dp0"
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ========================================================
echo       Slim Config ^& OpenCode 自动迁移打包工具
echo ========================================================
echo.

set "EXPORT_DIR=%~dp0migration_package"
set "PROJECT_DIR=%~dp0"
set "OPENCODE_DIR=%USERPROFILE%\.config\opencode"

if exist "%EXPORT_DIR%" (
    echo [清理] 发现旧的临时打包目录，正在清理...
    rmdir /s /q "%EXPORT_DIR%"
)

echo [1/3] 创建临时打包目录...
mkdir "%EXPORT_DIR%"
mkdir "%EXPORT_DIR%\slim-config-project"
mkdir "%EXPORT_DIR%\opencode-configs"

echo [2/3] 复制 Slim Config 项目文件 (排除 node_modules 和 dist)...
xcopy "%PROJECT_DIR%backend" "%EXPORT_DIR%\slim-config-project\backend\" /E /I /Y /Q > nul
xcopy "%PROJECT_DIR%frontend" "%EXPORT_DIR%\slim-config-project\frontend\" /E /I /Y /Q /EXCLUDE:exclude_list.txt > nul
copy "%PROJECT_DIR%start.bat" "%EXPORT_DIR%\slim-config-project\" > nul
copy "%PROJECT_DIR%start.ps1" "%EXPORT_DIR%\slim-config-project\" > nul

echo [3/3] 复制 OpenCode 用户配置...
if exist "%OPENCODE_DIR%" (
    xcopy "%OPENCODE_DIR%" "%EXPORT_DIR%\opencode-configs\" /E /I /Y /Q > nul
    echo   - 成功收集 ~/.config/opencode 目录
) else (
    echo   - [警告] 未找到 ~/.config/opencode 目录！
)

echo.
echo 正在压缩为 zip 文件 (可能需要几秒钟)...
powershell -Command "Compress-Archive -Path '%EXPORT_DIR%\*' -DestinationPath '%~dp0slim_migration.zip' -Force"

echo 清理临时文件...
rmdir /s /q "%EXPORT_DIR%"
if exist exclude_list.txt del exclude_list.txt

echo.
echo ========================================================
echo ✅ 迁移包已生成: %~dp0slim_migration.zip
echo ========================================================
echo.
echo 将 slim_migration.zip 拷贝到新电脑后，解压即可。
echo.
pause
