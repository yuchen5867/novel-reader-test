# 小说阅读器 — 使用与部署文档

基于 Node.js + React + SQLite 构建的中文网络小说阅读网站。支持前台书架浏览、小说详情、沉浸式阅读，以及后台小说管理、AI 智能分析、封面生成和章节插图。

---

## 目录

- [一、前台使用指南](#一前台使用指南)
  - [1.1 访问密码验证](#11-访问密码验证)
  - [1.2 书架首页](#12-书架首页)
  - [1.3 小说详情页](#13-小说详情页)
  - [1.4 阅读器](#14-阅读器)
  - [1.5 阅读设置](#15-阅读设置)
- [二、后台管理指南](#二后台管理指南)
  - [2.1 管理员登录](#21-管理员登录)
  - [2.2 导入小说](#22-导入小说)
  - [2.3 管理小说](#23-管理小说)
  - [2.4 编辑小说详情](#24-编辑小说详情)
  - [2.5 AI 智能分析](#25-ai-智能分析)
  - [2.6 AI 封面生成](#26-ai-封面生成)
  - [2.7 系统设置](#27-系统设置)
- [三、宝塔面板部署指南](#三宝塔面板部署指南)
- [四、本地开发与测试](#四本地开发与测试)

---

## 一、前台使用指南

### 1.1 访问密码验证

如果管理员设置了前台访问密码，访问网站时需输入密码。验证通过后浏览器保存 30 天有效凭证，期间无需重复输入。

### 1.2 书架首页

- 网格/列表双视图切换
- 搜索书名、作者
- 标签分类筛选
- 封面展示（AI 生成封面或默认渐变背景）
- 阅读进度标识（蓝色顶条 = 有阅读记录）
- 白天/夜间主题切换

**点击任意小说封面进入详情页**（而非直接阅读）。

### 1.3 小说详情页

新增的二级页面，提供完整的小说信息：

**封面与信息**：封面大图（点击可放大）、书名、作者、章数、字数、连载状态、分类标签、AI 概要。

**目录列表**：每章右侧有两个 AI 功能按钮：

| 按钮 | 功能 | 说明 |
|------|------|------|
| ✨ | AI 章节摘要 | 点击生成 100-200 字中文摘要，结果永久缓存，再次点击显示/隐藏 |
| 🖼 | AI 章节插图 | 根据章节内容生成 16:9 场景插图，每章最多 3 张，自动清理旧图 |

**插图功能**：
- 点击缩略图 → 灯箱大图预览 + 提示词展示
- 悬停缩略图 → 显示"点击放大"
- 点击 🖼 按钮 → 可重新生成新插图（旧图自动替换）
- 点击"显示提示词" → 查看每张图的英文生图提示词

**点击"开始阅读"或任意章节名进入阅读器**。

### 1.4 阅读器

- 章节正文分段展示，首行缩进
- 底部固定进度条 + 章节计数（始终可见，无需滚动）
- 左侧目录侧边栏：封面缩略图 + 全部章节列表
- 右侧书签面板：添加/删除/跳转书签
- 键盘快捷键：← → 翻章、T 切换主题、F 全屏、Esc 关闭面板
- 返回按钮回到小说详情页

### 1.5 阅读设置

| 设置项 | 可选值 |
|--------|--------|
| 主题模式 | 白天 / 夜间 / 自动 |
| 背景色 | 羊皮纸 / 纯白 / 护眼绿 / 深灰 / 纯黑 |
| 字体大小 | 12px ~ 24px |
| 行高 | 1.5 ~ 2.5 |
| 字间距 | 紧凑 / 标准 / 宽松 |
| 页边距 | 窄 / 中 / 宽 |
| 字体 | 系统默认 / 思源宋体 / 霞鹜文楷 |
| 翻页模式 | 滚动 / 分页 / 左右翻页 |

---

## 二、后台管理指南

### 2.1 管理员登录

- 默认账号：`admin`，默认密码：`admin123`
- 登录后获取 24 小时有效 Session Token
- 修改密码后所有旧 Session 自动失效
- 登录接口有速率限制（15 分钟最多 20 次）

### 2.2 导入小说

支持 `.txt` 和 `.zip` 格式，拖拽或点击上传。

**自动处理**：
- 自动检测文件编码（UTF-8、GBK、GB2312、GB18030）
- 自动识别章节标题（14+ 种格式）
- 自动标记番外、楔子等特殊章节
- 自动统计字数和章节数

### 2.3 管理小说

搜索、排序、查看、编辑、批量删除。点击"查看"跳转到前台详情页。

### 2.4 编辑小说详情

四个标签页：基本信息、章节管理（拖拽排序/合并/拆分）、标签分类、AI 分析结果编辑。

### 2.5 AI 智能分析

**前置条件**：在"文字模型"页签配置 AI 服务（支持 DeepSeek 一键配置或手动添加 OpenAI 兼容服务）。

**批量分析**：勾选小说 → 开始批量分析 → 实时查看每本进度（等待/接收中/完成/失败）。AI 会从每本小说的前 20 章各取约 2000 字作为样本，自动识别书名、生成概要、推荐标签。

### 2.6 AI 封面生成

**前置条件**：
- "文字模型"已配置（用于生成封面提示词）
- "图片模型"已配置（用于文生图 API）

**图片模型支持**：

| 模型 | 说明 | 封面尺寸（3:4） |
|------|------|-----------------|
| 万相 2.7 Pro | 最新旗舰，4K 高清 | 1728×2368 |
| 万相 2.7 | 速度更快 | 1728×2368 |
| 千问 2.0 Pro | 文字渲染强，真实质感 | 1080×1440 |
| 千问 2.0 | 加速版 | 1080×1440 |
| z-image-turbo | 轻量快速 | 600×800 |

**操作步骤**：选择小说 → 选择图片模型 → 点击生成封面。提示词和封面图均实时显示。封面自动保存并显示在前台书架和详情页。

**敏感词处理**：如果提示词触发内容审核，AI 会自动优化提示词并重试（最多 3 次），在保留文风的前提下降低敏感度。

### 2.7 系统设置

| 分区 | 配置项 |
|------|--------|
| 基础设置 | 网站名称、默认主题、每页显示数量 |
| 阅读默认 | 默认字号、行高、字体 |
| 上传设置 | 最大上传大小、允许格式 |
| AI 设置 | 自动分析开关 |
| 管理员 | 修改密码 |

---

## 三、宝塔面板部署指南

### 3.1 环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | CentOS 7+ / Ubuntu 18+ / Debian 10+ |
| 面板 | 宝塔面板 7.x+ |
| 运行环境 | Node.js 18+ |
| 进程管理 | PM2 |
| 数据库 | SQLite（无需单独安装） |

### 3.2 安装 Node.js

宝塔面板 → 软件商店 → PM2 管理器 → 安装 → 切换到 Node.js 18.x+

### 3.3 上传项目

```bash
cd /www/wwwroot
git clone <仓库地址> novel-reader
```

或通过宝塔文件管理器上传 ZIP 解压。

### 3.4 构建前端

```bash
cd /www/wwwroot/novel-reader/backend
npm ci --omit=dev

cd /www/wwwroot/novel-reader/frontend
npm ci
npm run build
```

### 3.5 创建 Node.js 站点

宝塔面板 → 网站 → Node.js 项目 → 添加：

| 字段 | 值 |
|------|------|
| 项目目录 | `/www/wwwroot/novel-reader/backend` |
| 启动文件 | `src/main.js` |
| 项目名称 | `novel-reader` |
| 运行端口 | `3000` |

### 3.6 配置环境变量

PM2 管理器 → novel-reader → 设置 → 环境变量：

```
HOST=127.0.0.1
PORT=3000
DB_PATH=/www/wwwroot/novel-reader/backend/src/data/novel-reader.db
UPLOAD_PATH=/www/wwwroot/novel-reader/backend/uploads
SERVER_SECRET=<运行 node -e "require('crypto').randomBytes(32).toString('hex')" 生成>
```

> **重要**：`SERVER_SECRET` 用于前台访问 Token 签名，必须设置为随机字符串。

### 3.7 启用集群模式

PM2 管理器 → novel-reader → 设置 → 实例数设为 `max`

```bash
pm2 start src/main.js --name novel-reader -i max
pm2 save
pm2 startup
```

### 3.8 反向代理

宝塔面板 → 网站 → 添加站点 → 设置 → 反向代理：

| 字段 | 值 |
|------|------|
| 代理名称 | `novel-api` |
| 目标 URL | `http://127.0.0.1:3000` |
| 发送域名 | `$host` |

### 3.9 SSL 证书

宝塔面板 → 网站 → SSL → Let's Encrypt → 申请 → 勾选"强制 HTTPS"

### 3.10 目录权限

```bash
chown -R www:www /www/wwwroot/novel-reader/backend/src/data
chown -R www:www /www/wwwroot/novel-reader/backend/uploads
chmod 755 /www/wwwroot/novel-reader/backend/src/data
chmod 755 /www/wwwroot/novel-reader/backend/uploads
```

### 3.11 日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

### 3.12 验证部署

- 访问域名 → 书架首页
- `/admin` → 管理后台（admin / admin123）
- `/api/health` → `{"status":"ok","uptime":...}`

### 3.13 常见问题

| 问题 | 解决 |
|------|------|
| 端口被占用 | `lsof -i :3000` → `kill -9 <PID>` |
| 502 Bad Gateway | 检查 PM2 进程状态 + 反向代理目标 URL |
| 上传失败 | 检查 uploads 目录权限 |
| 数据库权限错误 | `chmod 666 .../novel-reader.db` |
| 图片生成失败 | 检查"文字模型"和"图片模型"是否分别配置 |
| 页面空白 | 确认 `frontend/dist` 存在且反向代理正确 |

### 3.14 更新部署

```bash
cd /www/wwwroot/novel-reader
git pull
cd frontend && npm ci && npm run build
cd ../backend && npm ci --omit=dev
pm2 restart novel-reader
```

---

## 四、本地开发与测试

### 4.1 前置要求

Node.js 18+、npm 9+

### 4.2 安装与启动

```bash
git clone <仓库地址>
cd novel-reader

# 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 终端 1：启动后端（文件监听自动重启）
cd backend && npm run dev       # http://localhost:3000

# 终端 2：启动前端（热模块替换）
cd frontend && npm run dev      # http://localhost:5173
```

开发时前端自动代理 API 到后端，访问 `http://localhost:5173` 即可。

### 4.3 一键启动

```bash
# Windows
scripts/start.bat

# Linux / macOS
scripts/start.sh
```

### 4.4 生产模式本地测试

```bash
cd frontend && npm run build
cd ../backend && npm start
# 访问 http://localhost:3000
```

### 4.5 测试 API

```bash
# 健康检查
curl http://localhost:3000/api/health

# 管理员登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 使用 Token 请求受保护接口
curl http://localhost:3000/api/settings \
  -H "Authorization: Bearer <token>"
```

### 4.6 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 后端端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DB_PATH` | `backend/src/data/novel-reader.db` | 数据库路径 |
| `UPLOAD_PATH` | `backend/uploads` | 上传目录 |
| `SERVER_SECRET` | `novel-reader-secret-change-me` | 访问 Token 密钥 |

### 4.7 项目结构

```
novel-reader/
├── backend/
│   └── src/
│       ├── main.js                     # Express 主入口
│       ├── middleware/
│       │   ├── auth.js                 # Session 认证（24h 过期）
│       │   └── access.js              # 前台访问密码控制
│       ├── routes/
│       │   ├── auth.js                 # 登录 / 改密 / 登出
│       │   ├── novels.js              # 小说 CRUD + 导入
│       │   ├── chapters.js            # 章节 + 进度 + 书签 + 摘要 + 插图
│       │   ├── ai.js                  # AI 分析 + 封面 + 图片配置
│       │   └── settings.js            # 设置 + 备份 + 标签 + 健康检查
│       ├── services/
│       │   ├── novelService.js         # 小说处理逻辑
│       │   ├── aiService.js           # AI 文字分析封装
│       │   └── imageService.js        # 文生图统一模块（模型/尺寸/清洗/重试）
│       ├── common/
│       │   ├── database.js            # SQLite 表结构 + 初始化
│       │   └── chapterRecognition.js  # 章节识别引擎
│       ├── data/                       # 数据库文件
│       └── uploads/                    # 小说文件 + 封面 + 章节插图
├── frontend/
│   └── src/
│       ├── App.tsx                     # 路由（React.lazy 代码分割）
│       ├── components/AccessGate.tsx
│       ├── pages/
│       │   ├── bookshelf/
│       │   │   ├── Bookshelf.tsx       # 书架首页
│       │   │   └── NovelDetail.tsx    # 小说详情（摘要+插图）
│       │   ├── reader/
│       │   │   ├── Reader.tsx          # 阅读器
│       │   │   └── ReaderSettings.tsx
│       │   └── admin/
│       │       ├── AdminAI.tsx         # AI 配置（文字/图片分离）
│       │       └── ...
│       ├── stores/                     # Zustand 状态
│       └── utils/api.ts               # API 封装
├── scripts/                           # 一键启动脚本
├── docker/                            # Docker 配置
├── DEPLOY.md                          # 部署文档
└── README.md
```

### 4.8 重置开发环境

```bash
cd backend/src/data
rm -f novel-reader.db novel-reader.db-wal novel-reader.db-shm
cd ../uploads && rm -rf novels/*
cd ../.. && npm start
```
