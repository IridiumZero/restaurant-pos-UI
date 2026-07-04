@echo off
setlocal
title Restaurant POS Server

:: ============================================================
::  生产环境配置 (Production Configuration)
::  按需修改以下设置，保存后双击运行即可
:: ============================================================

:: 服务器端口
set PORT=3000

:: JWT 签名密钥（生产环境务必改成你自己的随机字符串！）
set JWT_SECRET=restaurant-pos-production-2026

:: 小票打印机名（80mm，连接钱箱，在收银台）
set PRINTER_NAME=XP-80C(xiaopiao)

:: 厨房打印机名（80mm，后厨用）
set KITCHEN_PRINTER_NAME=XP-80C (chufang)

:: ============================================================
::  打印机静态 IP 设置指引
::  ⚠️ 非常重要！打印机必须设静态 IP，否则停电/重启后
::     IP 会变，导致打印失败。设置了静态 IP 后一劳永逸。
:: ============================================================
::  方法一（推荐）：在打印机机身上设置
::    1. 按住打印机菜单键 → 网络设置
::    2. 关闭 DHCP，改为手动/静态 IP
::    3. 设固定 IP，例如：
::       小票/钱箱: 192.168.5.23
::       厨打:      192.168.5.25
::    4. 子网掩码 255.255.255.0，网关 192.168.5.1
::
::  方法二：在路由器上设置 DHCP 保留
::    1. 登录路由器管理页
::    2. DHCP 服务器 → 静态地址分配
::    3. 绑定打印机 MAC 地址 → 固定 IP
::
::  当前参考 IP：
::    小票/钱箱: 192.168.5.23:9100 (XP-80C xiaopiao，收银台)
::    厨打:      192.168.5.25:9100 (XP-80C chufang，后厨)
:: ============================================================

echo.
echo   ========================================
echo     Restaurant POS - Production Server
echo   ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js not found!
    echo   Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo   Node.js:
node --version
echo.

:: Change to script directory
cd /d "%~dp0"

:: Show config
echo   Configuration:
echo     PORT           = %PORT%
if "%JWT_SECRET%"=="" (echo     JWT_SECRET     = (will auto-generate - NOT recommended for production^)) else (echo     JWT_SECRET     = (custom^))
if "%PRINTER_NAME%"=="" (echo     Receipt Printer= auto-detect "xiaopiao"^) else (echo     Receipt Printer= %PRINTER_NAME%)
if "%KITCHEN_PRINTER_NAME%"=="" (echo     Kitchen Printer= auto-detect "chufang"^) else (echo     Kitchen Printer= %KITCHEN_PRINTER_NAME%)
echo.

:: Kill any stale server on configured port
echo   Cleaning up stale server instances...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT%.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo   Starting server...
echo   (Close this window to stop the server^)
echo.

:: Start server in the same window (env vars are automatically inherited)
node server\index.js

echo.
echo   Server stopped.
pause
