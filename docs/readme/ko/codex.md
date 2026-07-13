# Codex 설정

## 데스크톱 앱

**Settings → MCP servers → Add server**를 엽니다.

평문 설정 또는 환경 변수 설정 중 하나를 선택하세요.

### 평문 설정

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: 비워 두기

HTTP Headers
Name: Authorization
Value: Bearer replace-with-a-random-secret
```

### 환경 변수

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: SQLTUNNEL_API_KEY
HTTP Headers: 비워 두기; 헤더를 추가하지 마세요
```

## CLI

평문 설정 또는 환경 변수 설정 중 하나를 선택하세요.

### 평문 설정

`~/.codex/config.toml`에 다음을 추가합니다:

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
```

### 환경 변수

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

codex mcp add sqltunnel \
  --url "http://127.0.0.1:3000/mcp" \
  --bearer-token-env-var SQLTUNNEL_API_KEY
```

## 사용법

먼저 Codex에게 다음과 같이 알리세요:

```text
SQLTunnel을 사용하여 데이터베이스를 조회할 수 있습니다.
```

그런 다음 각 요청을 자연어로 설명하세요. 예:

```text
접근할 수 있는 데이터베이스를 나열해 주세요.
```

```text
prod-postgres의 테이블을 나열해 주세요.
```

```text
가장 최근 주문 10건을 조회해 주세요. 쿼리를 실행하기 전에 관련 테이블 스키마를 확인하세요.
```
