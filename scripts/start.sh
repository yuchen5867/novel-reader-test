#!/bin/bash

echo ""
echo "========================================"
echo "   小说阅读器 - 一键启动 (Linux/macOS)"
echo "========================================"
echo ""

cd "$(dirname "$0")/.."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js 18+"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

echo "[1/3] 检查后端依赖..."
if [ ! -d "backend/node_modules" ]; then
    echo "正在安装后端依赖..."
    cd backend
    npm install
    cd ..
fi

echo "[2/3] 检查前端依赖..."
if [ ! -d "frontend/node_modules" ]; then
    echo "正在安装前端依赖..."
    cd frontend
    npm install
    cd ..
fi

echo "[3/3] 构建前端..."
cd frontend
npm run build
cd ..

echo ""
echo "========================================"
echo "  启动服务..."
echo "========================================"
echo "  后端 API: http://localhost:3000"
echo "  前端页面: http://localhost:3000"
echo "  后台管理: http://localhost:3000/admin"
echo "  默认账号: admin / admin123"
echo "========================================"
echo ""

cd backend
npm start
