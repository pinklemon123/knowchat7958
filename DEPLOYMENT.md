# 个人服务器部署与状态自检

项目推荐使用 Docker Compose 部署。它会启动网页、PostgreSQL、新闻定时刷新和每日健康检查四个服务；网页进程异常退出后，Docker 会依据 `restart: unless-stopped` 自动拉起容器，健康探针则持续标记运行状态供排查。

## 首次部署

服务器需要安装 Docker Engine 与 Compose 插件。把项目上传或克隆到服务器后：

```bash
cp .env.example .env.local
```

至少修改这些值：

```dotenv
# 使用 openssl rand -hex 32 生成，不要使用示例值
CRON_SECRET=替换为随机长密钥

# 通过 HTTPS 访问时必须开启
LIBRARY_SECURE_COOKIE=true

# 按需配置
OPENAI_API_KEY=
KNOWLEDGE_AI_API_KEY=
```

启动并检查：

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

网页默认监听服务器的 `7853` 端口。首次访问 `/login` 设置资料库密码，然后进入“设置 → 部署状态与每日简报”，先执行一次手动自检。确认数据目录、数据库和安全配置正常后，再开启“自动处理”。

## HTTPS 与公网访问

建议只让 Nginx、Caddy 或 Cloudflare Tunnel 暴露到公网，并将请求反向代理至 `127.0.0.1:7853`。启用 HTTPS 后保持 `LIBRARY_SECURE_COOKIE=true`。防火墙不需要开放 PostgreSQL 端口，本项目也没有将其映射到宿主机。

## 自动处理的权限边界

开启后，每日检查只会：

- 创建缺失的 `library`、`temp`、`trash`、`ui` 数据目录；
- 验证目录读写能力；
- 清理超过 24 小时的上传临时文件。

它不会修改环境变量、自动执行数据库迁移、删除正式资料、运行任意 Shell 命令或升级依赖。数据库/密钥/磁盘空间问题会在简报中报告，仍由管理员确认处理。

## 数据与备份

`library_data` 保存上传文件、登录配置和健康简报，`postgres_data` 保存元数据。更新容器不会清空这两个卷。建议定期备份：

```bash
docker compose exec -T postgres pg_dump -U chatgreen chatgreen > chatgreen.sql
docker run --rm -v greenchat7853_library_data:/data -v "$PWD":/backup alpine tar czf /backup/library-data.tgz -C /data .
```

恢复操作具有覆盖风险，应先停止写入并核对卷名。

## 更新与故障定位

```bash
docker compose pull
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 app postgres health-monitor
```

`/api/health` 是供 Docker 使用的最小存活探针，不包含敏感信息。完整检查记录只有登录后的设置页可以读取；每日检查接口还要求 `CRON_SECRET`。
