# SQLTunnel

[![Docker Pulls](https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls)](https://hub.docker.com/r/nemoalex/sqltunnel)
[![Docker Image Version](https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image)](https://hub.docker.com/r/nemoalex/sqltunnel/tags)

[English](README.md) | [中文](README.zh-CN.md) | [日本語](docs/readme/README.ja.md) | [한국어](docs/readme/README.ko.md) | [Français](docs/readme/README.fr.md) | [Deutsch](docs/readme/README.de.md)

SQLTunnel is a database access gateway that lets agents such as Codex, Claude Code, and Hermes, as well as Dify, automation platforms, and internal applications, query private databases with controlled permissions without exposing database ports directly.

Key capabilities:

- Supports MySQL and PostgreSQL through direct connections or SSH tunnels.
- Identifies callers with API keys and configures read/write access per client and db server.
- Supports SSH config, Host aliases, and ProxyJump.
- Provides an OpenAPI HTTP API and a Streamable HTTP MCP endpoint.
- Enforces row limits and timeouts; writes require explicit permission.

## How It Works

```mermaid
flowchart LR
  ExternalApp["External applications<br/>Agents, AI platforms, internal tools"]
  SQLTunnel["SQLTunnel<br/>Access control and connection management"]
  Database[("Private database<br/>MySQL or PostgreSQL")]

  ExternalApp -->|"HTTP API or MCP"| SQLTunnel
  SQLTunnel -->|"SSH tunnel or direct connection"| Database
```

`gateway.yaml` contains three types of configuration:

- `dbServers`: database connection details.
- `sshServers`: reusable SSH connections.
- `clients`: external callers and their database permissions.

Database passwords and SSH private keys remain on the SQLTunnel server. External callers only need their own API key.

## Quick Start

### Run Directly

```bash
git clone https://github.com/NemoAlex/SQLTunnel.git
cd SQLTunnel
cp config/gateway.example.yaml config/gateway.yaml
npm install
npm run build
npm run start
```

The service listens on `0.0.0.0:3000` by default. Override it with environment variables:

```bash
FASTIFY_HOST=127.0.0.1 FASTIFY_PORT=3001 npm run start
```

### Docker Compose

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

```bash
cp config/gateway.example.yaml config/gateway.yaml
docker compose up -d
```

The repository's `compose.yaml` builds the image locally:

```bash
docker compose up --build
```

## Config Directory

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # Optional
    config             # Optional: SSH Host aliases, users, ports, ProxyJump, and other login details
    id_rsa             # Optional: private key required for key-based SSH login
```

Copy `config/gateway.example.yaml` and edit it for your environment. For Docker deployments, mount the entire `config` directory at `/app/config`. Reference SSH files with paths relative to `gateway.yaml`, such as `ssh/config` or `ssh/id_rsa`.

## OpenAPI

The OpenAPI document is available at `GET /openapi.json`. Business endpoints include:

- `POST /schema`: list databases or tables, or read a table schema.
- `POST /query`: execute an authorized and bounded SQL statement.

Requests authenticate with `Authorization: Bearer <SQLTUNNEL_API_KEY>`. See the [API reference](docs/api.md) for complete formats.

## MCP

The Streamable HTTP MCP endpoint is available at `POST /mcp` and provides these tools:

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

MCP uses the same API keys, database permissions, row limits, and timeouts as OpenAPI. Use a read-only client and database account for agents, and expose `/mcp` through HTTPS for remote deployments.

Setup guides:

- [Dify](docs/dify.md)
- [Claude Code](docs/claude-code.md)
- [Codex](docs/codex.md)
- [Hermes](docs/hermes.md)

## Reference

- [Configuration reference](docs/configuration.md)
- [API reference](docs/api.md)
