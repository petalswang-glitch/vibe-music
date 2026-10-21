# Vibe Music

基于 Next.js、FastAPI 和 LangGraph 的全栈音乐平台。

作者：[petalswang-glitch](https://github.com/petalswang-glitch)。

- 用户端：曲库搜索、歌手与歌单、收藏、评论、个人中心、全局播放器。
- 游客可浏览、搜索、播放和切换暗黑模式；登录后可管理资料、收藏、评论点赞及下载歌曲。
- 个性化推荐结合收藏偏好和最近听歌历史；有效播放才记录，同一首歌半小时内去重。
- 管理端：用户、歌手、歌曲、歌单、轮播、反馈与统计。
- 音乐 Agent：自然语言查询、推荐、流式回答、歌曲卡片；登录用户配置自己的模型平台 API Key，服务端加密保存。

## 技术栈

- 前端：React、TypeScript、Next.js、Tailwind CSS。
- 后端：Python 3.12、FastAPI、SQLAlchemy、Alembic、LangGraph。
- 基础服务：PostgreSQL、Redis、MinIO；本地邮件测试使用 Mailpit。

## 目录

```text
vibe-music-web/  用户端与管理端
vibe-music-api/  后端、PostgreSQL 版本迁移与测试
infra/          基础服务 Compose 配置
scripts/deploy/ 私有运行配置生成工具
docs/guide/     运行与开发详细说明
```

前后端使用 uv、pnpm 原生运行；Docker 仅用于基础服务，不包含项目应用镜像。项目使用 PostgreSQL 存储数据，使用 Alembic 管理表结构的版本与迁移。

私有配置、模型密钥、媒体文件和数据库备份不提交 Git。

## 运行与开发 🚀

环境要求：Python 3.12.13、uv、Node.js 24.15.0、pnpm 10.21.0，以及已启动的 Docker Desktop（含 Compose）。

> 从零下载、安装、配置、验证与排错见[运行与开发指南](docs/guide/README.md)。按下列顺序执行；命令报错时先解决再继续。

### 1. 安装工具并获取代码（首次）

| 工具 | 下载与安装 | 用途 |
|---|---|---|
| PowerShell 7 | 按[官方说明](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows)安装，打开 `pwsh` | 执行本文命令 |
| Git | 从[官网](https://git-scm.com/install/windows)下载安装 | 下载和更新源码 |
| uv | 在 PowerShell 7 执行 `winget install --id astral-sh.uv -e`；也可按[官方说明](https://docs.astral.sh/uv/getting-started/installation/)安装 | 管理 Python、虚拟环境和后端依赖 |
| Node.js | 从[24.15.0 官方下载目录](https://nodejs.org/download/release/v24.15.0/)安装对应系统架构的 `.msi`，保留 npm 和 PATH 选项 | 运行前端 |
| pnpm | 安装 Node.js 后执行 `npm.cmd install --global pnpm@10.21.0`（[安装说明](https://pnpm.io/installation)） | 安装前端依赖 |
| Docker Desktop | 按[官方说明](https://docs.docker.com/desktop/setup/install/windows-install/)安装，按提示配置 WSL 2、重启并启动 Docker Desktop | 运行数据库、缓存、媒体存储和测试邮件服务 |

安装完成后重新打开 PowerShell 7，检查 `git --version`、`uv --version`、`node --version`、`pnpm --version`、`docker version` 和 `docker compose version`。Node.js 应为 `v24.15.0`，pnpm 应为 `10.21.0`，Docker 需能连接服务端。

在准备存放源码的目录执行；已经有项目则直接进入现有目录，不必重复下载：

```powershell
git clone https://github.com/petalswang-glitch/vibe-music.git
cd vibe-music
```

uv 可以下载所需 Python，无需先单独安装 Python。后续每个新终端均从这个项目根目录打开。

### 2. 启动基础服务并初始化（首次）

运行和开发都需要前端、后端及基础服务同时工作：

```powershell
docker compose -f infra/docker-compose.dev.yml --profile mail up -d --wait
```

首次使用先安装依赖并初始化配置、数据库及存储：

```powershell
cd vibe-music-api
uv sync --locked
uv run --locked python -m app.configure_dev
uv run --locked python -m app.bootstrap
uv run --locked python -m app.manage_admin --username musicadmin
cd ../vibe-music-web
pnpm install --frozen-lockfile
```

`uv sync` 安装后端锁定依赖；`configure_dev` 生成本地配置和密钥；`bootstrap` 建表并初始化媒体存储；`manage_admin` 按提示设置管理员密码（已有管理员时跳过）；`pnpm install` 安装前端锁定依赖。初始化不会导入歌曲，也没有默认账号或密码。

### 3. 运行项目（构建模式）

后端终端：

```powershell
cd vibe-music-api
uv run --locked python -m app.serve
```

另开前端终端；首次运行或前端代码更新后先构建：

```powershell
cd vibe-music-web
pnpm build
pnpm start
```

### 4. 开发项目（热加载，可替代构建模式）

先停止上面的构建模式进程，后端终端执行：

```powershell
cd vibe-music-api
uv run --locked python -m app.serve --reload
```

另开前端终端执行：

```powershell
cd vibe-music-web
pnpm dev
```

后端保存 Python 文件后自动重载，前端保存页面、组件和样式后自动更新。修改环境配置需要重启对应服务；修改数据库模型还需通过 Alembic 迁移。构建模式与开发模式不要同时运行。

### 5. 验证功能与停止

- 用户端：http://localhost:3000。
- 管理端：http://localhost:3000/admin/login。
- 接口文档：http://127.0.0.1:18000/docs。
- 注册验证码邮件：http://localhost:28025。

先访问 [就绪检查](http://127.0.0.1:18000/health/ready)，确认 `status` 为 `ok`；该检查覆盖 PostgreSQL 和 Redis，媒体存储还需用上传和播放验证。用刚创建的管理员登录后台，创建歌手、选择歌手并新增歌曲，再上传音频及封面；回到用户端搜索并播放。用户注册时到 Mailpit 查看验证码邮件，再测试收藏等登录功能。使用音乐 Agent 时，登录用户在个人中心配置自己的模型厂商、模型名称和 API Key，产生的调用费用由对应厂商计费；普通浏览和播放无需模型 Key。

具体操作和验收标准见[首次功能验证](docs/guide/README.md#首次功能验证)。以后启动只需启动基础服务、后端及前端；代码未变化时不必重复安装和初始化。前后端分别按 `Ctrl+C` 停止；在根目录停止基础服务，镜像和数据卷保留：

```powershell
docker compose -f infra/docker-compose.dev.yml --profile mail stop
```

## License

Based on the original work by [Alex-LiSun](https://github.com/Alex-LiSun),
with modifications by petalswang-glitch.
Distributed under the MIT License. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
