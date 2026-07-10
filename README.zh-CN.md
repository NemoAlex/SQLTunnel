# SQLTunnel

[![Docker Pulls](https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls)](https://hub.docker.com/r/nemoalex/sqltunnel)
[![Docker Image Version](https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image)](https://hub.docker.com/r/nemoalex/sqltunnel/tags)

[English](README.md)

SQLTunnel 是一个数据库访问网关，用来让外部应用安全地查询只有内网才能访问的数据库。

它的主要使用场景是：数据库位于内网或只能通过跳板机访问，但 Dify、AI Agent、自动化平台、内部工具等应用需要按权限执行查询。常见的部署方式是把 SQLTunnel 和外部应用放在一起，由 SQLTunnel 通过 SSH 隧道访问私有环境中的数据库；也可以把 SQLTunnel 部署在私有网络内并直连数据库。无论哪种方式，都不需要把数据库端口直接暴露给外部应用。

SQLTunnel 特别适合给 Dify 等 AI 工具提供数据库查询能力：

- 通过 API key 区分调用方。
- 每个调用方只能访问被授权的 db servers。
- 每个调用方对每个 db server 可以单独设置只读或写入权限。
- 支持通过 SSH 隧道访问内网数据库。
- 支持读取 SSH config，包括 Host alias 和 ProxyJump。
- 提供 OpenAPI HTTP 接口和 Streamable HTTP MCP 接口。
- 强制限制查询行数和查询超时，减少误操作影响。
- 默认适合只读查询场景，写入需要显式授权。

## 工作方式

典型链路如下：

```mermaid
flowchart LR
  ExternalApp["外部应用<br/>Dify、AI Agent、内部工具"]
  SQLTunnel["SQLTunnel<br/>保存数据库密码和 SSH 私钥"]
  Database[("私有数据库<br/>MySQL 或 PostgreSQL")]
  Padding[" "]

  ExternalApp -->|"HTTP API /query 或 MCP /mcp"| SQLTunnel
  SQLTunnel -->|"SSH tunnel 或直连"| Database
  Database ~~~ Padding

  style Padding fill:transparent,stroke:transparent
  linkStyle 2 stroke:transparent
```

SQLTunnel 的配置文件声明三类对象：

- `dbServers`：可访问的数据库。
- `sshServers`：可复用的 SSH 隧道入口，可引用 SSH config。
- `clients`：外部调用方，以及它能访问哪些 db servers。

外部应用不会看到数据库真实密码或 SSH 私钥，只会拿到自己的 API key 和允许使用的 db server id。

SQLTunnel 不负责生成 SQL，也不替代数据库审计系统。它的职责是把已经授权的查询请求转发到正确的 db server，并执行基础的权限和安全限制。

## 快速开始

### 直接运行

```bash
git clone https://github.com/NemoAlex/SQLTunnel.git
cd SQLTunnel
cp config/gateway.example.yaml config/gateway.yaml
npm install
npm run build
npm run start
```

服务默认监听 `0.0.0.0:3000`，可通过环境变量覆盖：

```bash
FASTIFY_HOST=127.0.0.1 FASTIFY_PORT=3001 npm run start
```

### Docker Compose

SQLTunnel 已发布到 Docker Hub，镜像名为 `nemoalex/sqltunnel`：

```bash
docker pull nemoalex/sqltunnel:1.0.0
```

创建一个使用 Docker Hub 镜像的 Compose 文件：

```yaml
services:
  sqltunnel:
    image: nemoalex/sqltunnel:1.0.0
    container_name: sqltunnel
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
```

然后启动：

```bash
cp config/gateway.example.yaml config/gateway.yaml
docker compose up -d
```

仓库自带的 `compose.yaml` 用于本地开发，会从本地 `Dockerfile` 构建 `sqltunnel:local`：

```bash
docker compose up --build
```

### config 目录

推荐目录结构：

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # 可选。
    config             # 可选。用于写 SSH Host alias、用户、端口、ProxyJump 等登录信息。
    id_rsa             # 可选。私钥文件，只有使用密钥登录 SSH 时才需要。
```

推荐配置方式：

- 复制 `config/gateway.example.yaml` 为 `config/gateway.yaml`，再按实际环境修改。
- 只有当你希望 SQLTunnel 从挂载的配置目录读取 SSH 文件时，才需要使用 `config/ssh/`。
- 只有 SSH 服务器要求密钥登录时，才需要把 `id_rsa` 这类私钥放在 `config/ssh/` 下。
- 如果希望集中描述 SSH 登录信息，例如 Host alias、端口、用户、IdentityFile 或 ProxyJump，可以把 SSH config 放在 `config/ssh/config`。
- 在 `gateway.yaml` 中使用相对路径引用 SSH 文件，例如 `sshConfigPath: ssh/config`、`privateKeyPath: ssh/id_rsa`。
- 将整个 `config` 目录挂载到容器内的 `/app/config`；默认配置路径会对应为 `/app/config/gateway.yaml`。
- API key、数据库密码、SSH 私钥等敏感信息放在 `config/gateway.yaml` 或 `config/ssh/` 文件中；外部调用方只需要拿到自己的 API key。

## OpenAPI 接口

SQLTunnel 的 OpenAPI 文档位于 `GET /openapi.json`，对外只暴露两个业务接口：

- `POST /schema`：通过 `operation` 列出数据库、列出表，或读取一张表的结构。
- `POST /query`：执行一条经过授权和限制的 SQL。

请求通过 `Authorization: Bearer <SQLTUNNEL_API_KEY>` 鉴权。OpenAPI 适合直接 HTTP 调用、自动化工作流，以及不支持 MCP 的应用；完整请求和响应格式见 [API 参考](docs/api.zh-CN.md)。

## MCP 接口

SQLTunnel 在 `POST /mcp` 提供无状态 Streamable HTTP MCP 接口。它沿用 `gateway.yaml` 中的 client API key、db server 权限、查询行数和超时限制。

MCP 提供四个语义明确的工具：

- `list_db_servers`：列出当前 client 可以访问的 db servers 和最终生效的权限、行数及超时限制。
- `list_database_tables`：列出指定数据库的 schema、表和视图。
- `get_table_schema`：读取指定表或视图的字段、类型、默认值、注释和键。
- `query_database`：执行一条 SQL；权限检查和查询限制与 `POST /query` 完全相同。

建议为 Agent 单独创建只读 client，并使用数据库自身的只读账号。远程部署时应通过 HTTPS 暴露 `/mcp`，不要在客户端配置中提交真实 API key。

Schema 缓存时间可通过 `defaults.schemaCacheTtlMs` 调整；设为 `0` 可关闭缓存。通过 SQLTunnel 成功执行写入或 DDL 后，对应 db server 的 Schema 缓存会自动失效。

详细接入指南：

- [Dify](docs/dify.zh-CN.md)
- [Claude Code](docs/claude-code.zh-CN.md)
- [Codex](docs/codex.zh-CN.md)
- [Hermes](docs/hermes.zh-CN.md)

## 备份功能

备份功能支持按计划或手动导出 PostgreSQL 和 MySQL 数据库，并按保留策略管理备份文件。

```bash
cp config/backup.example.yaml config/backup.yaml
npm run build
node dist/cli.js backup list
node dist/cli.js backup run --job prod-postgres-daily
```

`backup.yaml` 只写调度和保留策略；数据库和 SSH 配置仍来自 `gateway.yaml`。备份使用 PostgreSQL 的 `pg_dump` 和 MySQL 的 `mysqldump`，也可以指定工具路径：

```yaml
defaults:
  binaries:
    pgDump: /usr/local/bin/pg_dump
    mySqlDump: /usr/local/bin/mysqldump
```

Docker 镜像内置两个 dump 工具。启用备份时挂载可写目录：

```yaml
volumes:
  - ./config:/app/config:ro
  - ./backups:/app/backups
```

## 参考文档

- [备份功能](#备份功能)
- [配置参考](docs/configuration.zh-CN.md)
- [API 参考](docs/api.zh-CN.md)
- [Dify MCP 配置指南](docs/dify.zh-CN.md)
- [Claude Code MCP 配置指南](docs/claude-code.zh-CN.md)
- [Codex MCP 配置指南](docs/codex.zh-CN.md)
- [Hermes MCP 配置指南](docs/hermes.zh-CN.md)
