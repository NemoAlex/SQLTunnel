# Hermes 설정

SQLTunnel을 `~/.hermes/config.yaml`에 추가합니다. 평문 설정 또는 환경 변수 설정 중 하나를 선택하세요.

## 평문 설정

```yaml
mcp_servers:
  sqltunnel:
    url: "http://127.0.0.1:3000/mcp"
    headers:
      Authorization: "Bearer replace-with-a-random-secret"
    enabled: true
    supports_parallel_tool_calls: false
    tools:
      include:
        - list_db_servers
        - list_database_tables
        - get_table_schema
        - query_database
      resources: false
      prompts: false
```

## 환경 변수

`~/.hermes/.env`에 추가합니다:

```dotenv
SQLTUNNEL_MCP_URL=http://127.0.0.1:3000/mcp
SQLTUNNEL_API_KEY=replace-with-a-random-secret
```

그런 다음 `~/.hermes/config.yaml`에 추가합니다:

```yaml
mcp_servers:
  sqltunnel:
    url: "${SQLTUNNEL_MCP_URL}"
    headers:
      Authorization: "Bearer ${SQLTUNNEL_API_KEY}"
    enabled: true
    supports_parallel_tool_calls: false
    tools:
      include:
        - list_db_servers
        - list_database_tables
        - get_table_schema
        - query_database
      resources: false
      prompts: false
```

## 사용법

서버를 테스트하고 Hermes를 시작합니다:

```bash
hermes mcp test sqltunnel
hermes chat
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
