# 运行与开发指南

[返回项目 README](../../README.md)

本文包含首次初始化、日常运行、热加载开发、配置修改、数据库迁移和常见问题。所有文件路径均相对于项目目录，不依赖特定电脑的位置。

## 1. 环境准备

- Python 3.12.13、uv，后端版本由 `.python-version` 固定。
- Node.js 24.15.0、pnpm 10.21.0，前端版本由 `.node-version` 和 `package.json` 约束。
- Docker Desktop 或 Docker Engine，以及 Docker Compose v2 或以上。

可在终端检查安装情况：

```powershell
uv --version
node --version
pnpm --version
docker version
docker compose version
```

前后端直接在主机运行，Docker 只运行 PostgreSQL、Redis、MinIO 和本地邮件测试服务 Mailpit。完整功能需要三部分同时运行。

每个新终端都先在项目根目录打开，以下 `cd` 命令均为相对路径。

## 2. 首次初始化

### 启动基础服务

先确保 Docker 正在运行，在根目录执行：

```powershell
docker compose -f infra/docker-compose.dev.yml --profile mail up -d --wait
```

首次会下载基础镜像，并构建 MinIO 基础服务镜像，不会构建前后端应用镜像。命令结束后基础服务在后台运行；已有数据卷会继续保留。

| 服务 | 主机地址或端口 |
|---|---|
| PostgreSQL | 127.0.0.1:25432 |
| Redis | 127.0.0.1:26379 |
| MinIO API | 127.0.0.1:29000 |
| MinIO 控制台 | http://localhost:29001 |
| Mailpit SMTP | 127.0.0.1:21025 |
| Mailpit 邮件页面 | http://localhost:28025 |

### 初始化后端

```powershell
cd vibe-music-api
uv sync --locked
uv run --locked python -m app.configure_dev
uv run --locked python -m app.bootstrap
```

- `uv sync --locked` 安装锁定的 Python 依赖，无需手动激活虚拟环境。
- `app.configure_dev` 首次生成 `.env` 和私有密钥；已有连接信息和密钥会保留。
- 默认配置与本地 Compose 配套；已有 `.env` 时以实际配置为准，确认数据库指向希望使用的实例。
- `app.bootstrap` 应用 Alembic 迁移并创建私有 MinIO Bucket，不导入历史歌曲或创建默认账号。

### 创建管理员

首次使用、尚无管理员时，在后端目录执行：

```powershell
uv run --locked python -m app.manage_admin --username musicadmin
```

按提示输入并确认密码，输入不显示。已有管理员时跳过；脚本默认不会覆盖现有账号。

### 安装前端依赖

另开根目录终端：

```powershell
cd vibe-music-web
pnpm install --frozen-lockfile
```

## 3. 日常运行（构建模式）

适合查看构建后的项目效果，没有开发热更新。每次运行前，先确保第 2 节的基础服务已经启动。

后端终端：

```powershell
cd vibe-music-api
uv run --locked python -m app.serve
```

前端终端：

```powershell
cd vibe-music-web
pnpm build
pnpm start
```

已有成功构建且前端代码、依赖和构建配置未变化时，可以直接 `pnpm start`。修改前端代码后需要重新构建并启动；后端代码修改后需要重启后端。

这是 Next.js 服务模式，需要 Node.js 持续运行，不是将 `out/` 静态文件交给 Nginx。上述命令不包含公网 HTTPS、进程守护等服务器上线配置。

## 4. 日常开发（热加载）

首次初始化完成后，通常只需保持基础服务运行，再打开两个应用终端。不要同时运行构建模式和开发模式，避免端口及 `.next` 目录冲突。

### 后端自动重载

```powershell
cd vibe-music-api
uv run --locked python -m app.serve --reload
```

保存后端 `.py` 文件后，Uvicorn 会重启应用进程；等待终端显示启动完成后，新请求使用新代码。重载会中断正在进行的请求和 Agent 流式回答，之后重新发起即可。

### 前端热更新

```powershell
cd vibe-music-web
pnpm dev
```

保存页面、组件或样式后，Next.js 会重新编译并通过 Fast Refresh 更新页面。部分改动会触发整页刷新并重置组件状态；编译错误会显示在终端或页面中。

用户端和管理端共用这个前端服务，无需分别启动。

### 修改后的操作

| 修改内容 | 操作 |
|---|---|
| 后端 Python 业务代码 | 使用 `--reload` 时保存后自动重载 |
| 前端页面、组件、样式 | 使用 `pnpm dev` 时保存后自动更新 |
| 后端 `.env` | 停止后端后重新启动 |
| 前端 `.env.local` 或 Next.js 配置 | 停止前端后重新启动 |
| 更新后的 Python 锁文件 | `uv sync --locked`，再重启后端 |
| 更新后的前端锁文件 | `pnpm install --frozen-lockfile`，再重启前端 |
| 新增 Alembic 迁移文件 | 在后端执行 `uv run --locked alembic upgrade head`，再重启后端 |
| Compose 配置 | 在根目录重新执行基础服务的 `up -d --wait` 命令 |

## 5. 数据库结构修改

热加载不会自动改数据库表。开发者修改 SQLAlchemy 模型后，在后端目录生成迁移：

```powershell
uv run --locked alembic revision --autogenerate -m "describe_schema_change"
```

检查生成的 `alembic/versions/*.py`，确认其中的表、字段和删除操作后，应用到 `.env` 指向的数据库：

```powershell
uv run --locked alembic upgrade head
```

拉取他人已经生成的迁移时，只需检查并执行 `upgrade head`，不用重复生成文件。

## 6. 访问和账号配置

| 用途 | 地址 |
|---|---|
| 用户端 | http://localhost:3000 |
| 管理后台 | http://localhost:3000/admin/login |
| FastAPI 接口文档 | http://127.0.0.1:18000/docs |
| 本地验证码邮件 | http://localhost:28025 |

- 用户注册时，从 Mailpit 页面查看验证码；真实邮件发送需修改后端 SMTP 配置。
- 新环境没有历史歌曲，通过后台先创建歌手，再新增歌曲并上传自有音频、封面及歌单资料。
- 使用 Agent 前，登录用户在个人中心配置自己的模型厂商、模型名称和 API Key；不需要站主共享 Key。
- `.env`、真实模型 Key、数据库和媒体备份不提交 Git。密钥加密使用的主密钥需妥善保存。

## 7. 修改端口和代理

后端默认监听 `127.0.0.1:18000`。例如改为 18001，在后端目录执行：

```powershell
uv run --locked python -m app.serve --reload --port 18001
```

前端默认将 `/api` 和 `/media` 转发到 18000，需要在前端目录同步设置目标后再启动：

```powershell
$env:API_INTERNAL_URL = "http://127.0.0.1:18001"
pnpm dev
```

该变量仅影响当前 PowerShell 会话及其子进程。长期配置可写入前端 `.env.local`；恢复默认时同步修改该文件，并清除当前终端覆盖值后重启：

```powershell
Remove-Item Env:API_INTERNAL_URL -ErrorAction SilentlyContinue
```

前端默认使用 3000 端口，若被占用，先检查是否有旧的开发进程。如改用其他前端端口，还需同步修改后端 `.env` 的 `CORS_ORIGINS` 并重启后端，否则 Agent 来源校验可能拒绝请求。

## 8. 日志、停止和常见问题

在根目录查看基础服务状态和日志：

```powershell
docker compose -f infra/docker-compose.dev.yml --profile mail ps
docker compose -f infra/docker-compose.dev.yml --profile mail logs --tail 100
```

前后端日志在各自终端查看。前后端分别按 `Ctrl+C` 停止；基础服务用以下命令停止，镜像和数据卷保留：

```powershell
docker compose -f infra/docker-compose.dev.yml --profile mail stop
```

| 现象 | 排查方式 |
|---|---|
| 后端根地址 `/` 或 `/favicon.ico` 返回 404 | 后端不提供网站首页；访问前端 3000，接口文档使用 `/docs` |
| `/media/...` 返回 404 | 检查 MinIO 中是否有对应文件；历史缺失图片可在后台重新上传 |
| 页面能打开，但数据请求失败 | 确认后端、基础服务均运行，并检查前端代理地址 |
| 页面打开但歌曲不能播放 | 确认音频已上传且媒体请求成功，不仅是数据库里存在歌曲记录 |
| `.env` 修改后仍使用旧配置 | 重启对应应用；已有系统环境变量会覆盖文件中的同名值 |
| 数据库提示新表或字段不存在 | 确认目标库正确，再在后端执行 `alembic upgrade head` |

## 9. 实现入口

- [后端启动参数](../../vibe-music-api/app/serve.py)。
- [本地配置生成](../../vibe-music-api/app/configure_dev.py)。
- [数据库和 Bucket 初始化](../../vibe-music-api/app/bootstrap.py)。
- [前端运行命令](../../vibe-music-web/package.json)。
- [API 和媒体代理配置](../../vibe-music-web/next.config.ts)。
- [本地基础服务](../../infra/docker-compose.dev.yml)。
