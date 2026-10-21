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

前后端使用 uv、pnpm 原生运行；Docker 仅用于基础服务，不包含项目应用镜像。数据库结构由 Alembic 管理。

私有配置、模型密钥、媒体文件和数据库备份不提交 Git。

## 运行与开发 🚀

环境要求：Python 3.12.13、uv、Node.js 24.15.0、pnpm 10.21.0，以及已启动的 Docker 和 Docker Compose。

> 详细说明：[运行与开发指南](docs/guide/README.md)。以下每个新终端均从项目根目录打开。

### 启动基础服务

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
cd ../vibe-music-web
pnpm install --frozen-lockfile
```

### 运行项目（构建模式）

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

### 开发项目（热加载）

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

### 访问与停止

- 用户端：http://localhost:3000。
- 管理端：http://localhost:3000/admin/login。
- 接口文档：http://127.0.0.1:18000/docs。
- 注册验证码邮件：http://localhost:28025。

首次创建管理员、配置个人模型 Key 等操作见[详细指南](docs/guide/README.md)。前后端分别按 `Ctrl+C` 停止；在根目录停止基础服务，镜像和数据卷保留：

```powershell
docker compose -f infra/docker-compose.dev.yml --profile mail stop
```

## License

Based on the original work by [Alex-LiSun](https://github.com/Alex-LiSun),
with modifications by petalswang-glitch.
Distributed under the MIT License. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
