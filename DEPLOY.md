# 宝塔面板部署指南

## 环境要求

- CentOS 7+ / Ubuntu 18+ / Debian 10+
- 宝塔面板 7.x+
- Node.js 18+（通过 PM2 管理器安装）

## 1. 安装 Node.js

宝塔面板 → 软件商店 → PM2 管理器 → 安装 → Node.js 版本切换到 v18.x+

## 2. 上传项目

```bash
cd /www/wwwroot
git clone <repo-url> novel-reader
```

或通过宝塔文件管理器上传 ZIP 并解压到 `/www/wwwroot/novel-reader`。

## 3. 安装依赖 & 构建

```bash
cd /www/wwwroot/novel-reader/backend
npm ci --omit=dev

cd /www/wwwroot/novel-reader/frontend
npm ci
npm run build
```

## 4. 创建 Node.js 站点

宝塔 → 网站 → Node.js 项目 → 添加：

| 字段 | 值 |
|------|-----|
| 项目目录 | `/www/wwwroot/novel-reader/backend` |
| 启动文件 | `src/main.js` |
| 项目名称 | `novel-reader` |
| 运行端口 | `3000` |

## 5. 环境变量

在 PM2 管理器中设置：

```
HOST=127.0.0.1
PORT=3000
DB_PATH=/www/wwwroot/novel-reader/backend/src/data/novel-reader.db
UPLOAD_PATH=/www/wwwroot/novel-reader/backend/uploads
SERVER_SECRET=<随机字符串，运行 node -e "require('crypto').randomBytes(32).toString('hex')" 生成>
```

> `SERVER_SECRET` 必须设置，用于前台访问 Token 签名。

## 6. 集群模式

PM2 管理器 → 设置 → 实例数 `max`，或：

```bash
pm2 start src/main.js --name novel-reader -i max
```

## 7. 反向代理

宝塔 → 网站 → 添加站点 → 设置 → 反向代理 → 添加：

| 字段 | 值 |
|------|-----|
| 目标 URL | `http://127.0.0.1:3000` |
| 发送域名 | `$host` |

## 8. SSL（可选）

网站 → SSL → Let's Encrypt → 申请 → 强制 HTTPS

## 9. 目录权限

```bash
chown -R www:www /www/wwwroot/novel-reader/backend/src/data
chown -R www:www /www/wwwroot/novel-reader/backend/uploads
chmod 755 /www/wwwroot/novel-reader/backend/src/data
chmod 755 /www/wwwroot/novel-reader/backend/uploads
```

## 10. 启动

```bash
pm2 start src/main.js --name novel-reader -i max
pm2 save
pm2 startup
```

## 11. 验证

- `http://域名` → 书架首页
- `http://域名/admin` → 后台（admin / admin123）
- `http://域名/api/health` → `{"status":"ok"}`

## 12. 日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

## 13. 部署后配置

首次登录后台后：

1. **系统设置** → 修改管理员密码
2. **AI → 文字模型** → 配置 DeepSeek（一键配置或手动添加）
3. **AI → 图片模型** → 添加阿里云百炼 API Key，选择模型（推荐万相 2.7 Pro）
4. **导入小说** → 上传 TXT/ZIP

## 14. 更新

```bash
cd /www/wwwroot/novel-reader
git pull
cd frontend && npm ci && npm run build
cd ../backend && npm ci --omit=dev
pm2 restart novel-reader
```

## 常见问题

| 问题 | 解决 |
|------|------|
| 端口被占用 | `lsof -i :3000` → `kill -9 <PID>` |
| 502 | 检查 PM2 进程状态和反向代理 URL |
| 上传失败 | 检查 `uploads` 权限和系统设置中的大小限制 |
| 数据库权限 | `chmod 666 .../novel-reader.db` |
| AI 功能不可用 | 确认文字模型和图片模型分别配置 |
| 页面空白 | 确认 `frontend/dist` 存在 |
| 图片裂开 | 旧数据需重新生成插图 |
