# Vibe Music

基于 Next.js、FastAPI 和 LangGraph 的全栈音乐平台。

- 用户端：曲库搜索、歌手与歌单、收藏、评论、个人中心、全局播放器。
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
```

前后端使用 uv、pnpm 原生运行；Docker 仅用于基础服务，不包含项目应用镜像。数据库结构由 Alembic 管理，不依赖 MySQL。

私有配置、模型密钥、媒体文件和数据库备份不提交 Git。

## License

Based on the original work by [Alex-LiSun](https://github.com/Alex-LiSun), with modifications by zl1nq. Distributed under the MIT License. See LICENSE and NOTICE.
