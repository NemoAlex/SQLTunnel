<p align="center">
  <img src="../../../assets/icon-1024-macos.png" alt="SQLTunnel 앱 아이콘" width="128" />
</p>

<h1 align="center">SQLTunnel</h1>

<p align="center"><strong>Agent, 자동화 플랫폼 및 내부 애플리케이션을 위한 권한 제어 데이터베이스 게이트웨이</strong></p>

<p align="center">
  <a href="https://hub.docker.com/r/nemoalex/sqltunnel"><img src="https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls" alt="Docker Pulls" /></a>
  <a href="https://hub.docker.com/r/nemoalex/sqltunnel/tags"><img src="https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image" alt="Docker Image Version" /></a>
</p>

<p align="center">
  <a href="../../../README.md">English</a> |
  <a href="../zh-CN/README.md">中文</a> |
  <a href="../ja/README.md">日本語</a> |
  <a href="README.md">한국어</a> |
  <a href="../fr/README.md">Français</a> |
  <a href="../de/README.md">Deutsch</a>
</p>

SQLTunnel을 사용하면 Codex, Claude Code, Hermes, Dify 및 내부 애플리케이션이 데이터베이스 포트를 직접 노출하지 않고 권한에 따라 MySQL과 PostgreSQL에 접근할 수 있습니다.

## 주요 기능

- MySQL과 PostgreSQL을 지원하며 직접 연결하거나 SSH 터널을 사용할 수 있습니다.
- API 키로 호출자를 식별하고 클라이언트와 데이터베이스별로 읽기/쓰기 권한을 설정합니다.
- SSH Config, Host Alias, ProxyJump를 지원합니다.
- OpenAPI HTTP API와 Streamable HTTP MCP 엔드포인트를 제공합니다.
- 반환 행 수와 쿼리 제한 시간을 적용하며 쓰기에는 명시적인 권한이 필요합니다.

## 데스크톱 버전

데스크톱 버전은 macOS와 Windows를 지원하며 SQLTunnel의 구성, 실행 및 모니터링을 하나의 그래픽 인터페이스로 제공합니다.

<p align="center">
  <img src="sqltunnel-desktop-ko.png" alt="한국어로 실행 중인 SQLTunnel 데스크톱 버전" width="512" />
</p>

## 헤드리스 서비스

헤드리스 버전은 동일한 게이트웨이 코어를 사용하며 Docker, 서버 및 백그라운드 배포에 적합합니다. `gateway.yaml`로 데이터베이스, SSH 터널, 클라이언트 권한을 관리하고 데스크톱 버전과 동일한 MCP/OpenAPI 인터페이스를 제공합니다.

- [Docker 배포](docker.md)
- [구성 참조](configuration.md)

## 동작 방식

```mermaid
flowchart LR
  ExternalApp["Agent, AI 플랫폼, 내부 애플리케이션"]
  SQLTunnel["SQLTunnel<br/>인증, 권한 제어, 연결 관리"]
  Database[("MySQL / PostgreSQL")]

  ExternalApp -->|"MCP 또는 OpenAPI"| SQLTunnel
  SQLTunnel -->|"SSH 터널 또는 직접 연결"| Database
```

SQLTunnel은 Bearer API 키로 호출자를 식별하고 클라이언트와 데이터베이스별로 읽기/쓰기 권한을 제어하며 행 수, 쿼리 및 연결 제한을 적용합니다. 데이터베이스 비밀번호와 SSH 개인 키는 호출자에게 노출되지 않습니다.

## 문서

- [Docker 배포](docker.md)
- [구성 참조](configuration.md)
- [API 참조](api.md)
- [Dify](dify.md)
- [Claude Code](claude-code.md)
- [Codex](codex.md)
- [Hermes](hermes.md)
