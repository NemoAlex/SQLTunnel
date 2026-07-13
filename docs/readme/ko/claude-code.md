# Claude Code 설정

## CLI

평문 설정 또는 환경 변수 설정 중 하나를 선택하세요.

### 평문 설정

```bash
claude mcp add --transport http --scope user sqltunnel \
  "http://127.0.0.1:3000/mcp" \
  --header "Authorization: Bearer replace-with-a-random-secret"
```

### 환경 변수

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

claude mcp add --transport http --scope user sqltunnel "$SQLTUNNEL_MCP_URL" \
  --header "Authorization: Bearer $SQLTUNNEL_API_KEY"
```

현재 프로젝트에만 추가하려면 `--scope user` 대신 `--scope project`를 사용하세요.

## 프로젝트 설정

프로젝트 루트의 `.mcp.json`에서 평문 설정 또는 환경 변수 설정 중 하나를 선택하세요.

### 평문 설정

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer replace-with-a-random-secret"
      }
    }
  }
}
```

### 환경 변수

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "${SQLTUNNEL_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${SQLTUNNEL_API_KEY}"
      }
    }
  }
}
```

실제 API 키를 `.mcp.json`에 커밋하지 마세요.

## 사용법

먼저 Claude Code에게 다음과 같이 알리세요:

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
