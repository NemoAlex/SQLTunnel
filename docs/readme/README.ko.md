# SQLTunnel

[![Docker Pulls](https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls)](https://hub.docker.com/r/nemoalex/sqltunnel)
[![Docker Image Version](https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image)](https://hub.docker.com/r/nemoalex/sqltunnel/tags)

[English](../../README.md) | [中文](../../README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md)

SQLTunnel은 Codex, Claude Code, Hermes 같은 Agent와 Dify, 자동화 플랫폼, 내부 애플리케이션이 데이터베이스 포트를 직접 노출하지 않고도 권한에 따라 사설 데이터베이스를 조회할 수 있게 하는 데이터베이스 액세스 게이트웨이입니다.

주요 기능:

- MySQL과 PostgreSQL을 지원하며 직접 연결하거나 SSH 터널을 사용할 수 있습니다.
- API key로 호출자를 식별하고 client와 db server별로 읽기/쓰기 권한을 설정합니다.
- SSH config, Host alias, ProxyJump를 지원합니다.
- OpenAPI HTTP API와 Streamable HTTP MCP endpoint를 제공합니다.
- 행 수와 제한 시간을 제한하며 쓰기에는 명시적인 권한이 필요합니다.

## 동작 방식

```mermaid
flowchart LR
  ExternalApp["외부 애플리케이션<br/>Agent, AI 플랫폼, 내부 도구"]
  SQLTunnel["SQLTunnel<br/>액세스 제어와 연결 관리"]
  Database[("사설 데이터베이스<br/>MySQL 또는 PostgreSQL")]

  ExternalApp -->|"HTTP API 또는 MCP"| SQLTunnel
  SQLTunnel -->|"SSH 터널 또는 직접 연결"| Database
```

`gateway.yaml`에는 세 가지 유형의 설정이 있습니다.

- `dbServers`: 데이터베이스 연결 정보.
- `sshServers`: 재사용 가능한 SSH 연결.
- `clients`: 외부 호출자와 데이터베이스 권한.

데이터베이스 비밀번호와 SSH 개인 키는 SQLTunnel 서버에만 저장됩니다. 외부 호출자에게는 자신의 API key만 필요합니다.

## 빠른 시작

### 직접 실행

```bash
git clone https://github.com/NemoAlex/SQLTunnel.git
cd SQLTunnel
cp config/gateway.example.yaml config/gateway.yaml
npm install
npm run build
npm run start
```

기본적으로 `0.0.0.0:3000`에서 수신합니다. 환경 변수로 변경할 수 있습니다.

```bash
FASTIFY_HOST=127.0.0.1 FASTIFY_PORT=3001 npm run start
```

### Docker Compose

```yaml
services:
  sqltunnel:
    image: nemoalex/sqltunnel:1.0.1
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

저장소의 `compose.yaml`은 이미지를 로컬에서 빌드합니다.

```bash
docker compose up --build
```

## config 디렉터리

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # 선택 사항
    config             # 선택 사항: SSH Host alias, 사용자, 포트, ProxyJump 등의 로그인 정보
    id_rsa             # 선택 사항: 키 기반 SSH 로그인에 필요한 개인 키
```

`config/gateway.example.yaml`을 복사한 뒤 환경에 맞게 수정합니다. Docker에서는 전체 `config` 디렉터리를 `/app/config`에 마운트합니다. SSH 파일은 `ssh/config` 또는 `ssh/id_rsa`처럼 `gateway.yaml` 기준 상대 경로로 참조합니다.

## OpenAPI

OpenAPI 문서는 `GET /openapi.json`에서 제공됩니다. 업무 endpoint는 다음과 같습니다.

- `POST /schema`: 데이터베이스나 테이블 목록 또는 테이블 구조를 조회합니다.
- `POST /query`: 권한과 제한이 적용된 SQL 문을 실행합니다.

요청은 `Authorization: Bearer <SQLTUNNEL_API_KEY>`로 인증합니다. 전체 형식은 [API 참조](../api.md)를 확인하세요.

## MCP

Streamable HTTP MCP endpoint는 `POST /mcp`에서 제공되며 다음 도구를 포함합니다.

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

MCP는 OpenAPI와 동일한 API key, 데이터베이스 권한, 행 수 제한, 제한 시간을 사용합니다. Agent에는 읽기 전용 client와 데이터베이스 계정을 사용하고 원격 배포에서는 `/mcp`를 HTTPS로 노출하세요.

설정 가이드:

- [Dify](../dify.md)
- [Claude Code](../claude-code.md)
- [Codex](../codex.md)
- [Hermes](../hermes.md)

## 참조 문서

- [설정 참조](../configuration.md)
- [API 참조](../api.md)
