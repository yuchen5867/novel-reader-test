@echo off
chcp 65001 >nul
title 小说阅读器 - 启动

echo.
echo ========================================
echo    小说阅读器 - 一键启动 (Windows)
echo ========================================
echo.

cd /d "%~dp0\.."

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] 检查后端依赖...
if not exist "backend\node_modules" (
    echo 正在安装后端依赖...
    cd backend
    call npm install
    cd ..
)

echo [2/3] 检查前端依赖...
if not exist "frontend\node_modules" (
    echo 正在安装前端依赖...
    cd frontend
    call npm install
    cd ..
)

echo [3/3] 构建前端...
cd frontend
call npm run build
cd ..

echo.
echo ========================================
echo   启动服务...
echo ========================================
echo   后端 API: http://localhost:3000
echo   前端页面: http://localhost:3000
echo   后台管理: http://localhost:3000/admin
echo   默认账号: admin / admin123
echo ========================================
echo.

cd backend
call npm start
pause
