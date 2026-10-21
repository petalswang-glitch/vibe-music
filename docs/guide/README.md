# 运行指南

[返回 README](../../README.md)。以下命令使用 PowerShell 7（`pwsh`），按顺序执行，报错时先解决再继续。

## 1. 安装工具

已有工具直接跳过。

- [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows)：执行命令。
- [Git](https://git-scm.com/install/windows)：下载源码。
- [uv](https://docs.astral.sh/uv/getting-started/installation/)：可执行 `winget install --id astral-sh.uv -e` 安装。
- [Node.js 24.15.0](https://nodejs.org/download/release/v24.15.0/)：下载对应电脑架构的 `.msi` 安装包，保留默认 npm 和 PATH 选项。
- [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)：按提示安装并启动，使用 Linux 容器。

安装后重新打开 PowerShell 7，安装前端包管理工具：

```powershell
npm.cmd install --global pnpm@10.21.0
```

Python、虚拟环境和数据库等由项目命令自动准备，不用单独下载。

## 2. 下载项目

在准备存放项目的目录执行；已有源码则直接进入项目目录：

```powershell
git clone https://github.com/petalswang-glitch/vibe-music.git
cd vibe-music
```

这里就是“项目根目录”，每个新终端都从这里开始。

## 3. 首次初始化

打开 Docker Desktop，在根目录启动数据库等服务：

```powershell
docker compose -f infra/docker-compose.dev.yml --profile mail up -d --wait
```

准备后端，生成配置并初始化数据库和存储：

```powershell
cd vibe-music-api
uv sync --locked
uv run --locked python -m app.configure_dev
uv run --locked python -m app.bootstrap
```

`uv sync` 会自动准备 Python 3.12.13、虚拟环境和依赖；后两条命令生成本地配置并建表。

创建管理员，按提示设置密码（已有管理员则跳过）：

```powershell
uv run --locked python -m app.manage_admin --username musicadmin
```

密码用 8～18 位字母和数字组合，不含下划线。接着安装前端依赖：

```powershell
cd ../vibe-music-web
pnpm install --frozen-lockfile
```

## 4. 启动项目

从项目根目录打开两个终端，保持运行。

终端一，启动后端：

```powershell
cd vibe-music-api
uv run --locked python -m app.serve --reload
```

终端二，启动前端：

```powershell
cd vibe-music-web
pnpm dev
```

保存代码后自动更新。以后运行只需打开 Docker Desktop，执行第 3 节的基础服务启动命令，再启动这两个终端，不必重复初始化。

## 5. 打开并使用

1. 打开[管理后台](http://localhost:3000/admin/login)，用 `musicadmin` 和自己设置的密码登录。
2. 新增歌手，在歌曲管理中选择歌手、新增歌曲并上传音频和封面。
3. 打开[用户端](http://localhost:3000)，搜索刚添加的歌曲并播放。
4. 注册普通用户时，到[本地邮件页面](http://localhost:28025)查看验证码。
5. 如需音乐 Agent，登录后在个人中心配置模型和 API Key。

新数据库没有歌曲。接口文档在 [18000/docs](http://127.0.0.1:18000/docs)。

## 6. 停止

前后端分别按 `Ctrl+C`。在根目录停止基础服务，保留数据：

```powershell
docker compose -f infra/docker-compose.dev.yml --profile mail stop
```

## 常见问题

- 找不到命令：安装后重新打开 PowerShell 7。
- `pnpm.ps1` 被拦截：把命令中的 `pnpm` 换成 `pnpm.cmd`。
- Docker 连接失败：确认 Docker Desktop 已启动。
- 页面没有数据：确认后端正在运行；新环境需先在后台添加歌曲。
- 歌曲不能播放：确认已上传音频，只有歌曲记录还不能播放。
- 管理员已存在：使用已有账号，跳过创建命令。

修改 `.env` 后重启后端；配置和密钥不要提交到 Git。
