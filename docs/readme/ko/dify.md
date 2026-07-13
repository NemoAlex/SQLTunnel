# Dify 설정

## MCP 서버

Dify 워크스페이스의 도구 관리 페이지에서 HTTP MCP 서버를 추가합니다. Dify 버전에 따라 메뉴 레이블이 약간 다를 수 있습니다.

```text
이름: SQLTunnel
서버 식별자: sqltunnel
서버 엔드포인트 URL: http://sqltunnel:3000/mcp

인증
동적 클라이언트 등록: 비활성화
클라이언트 ID: 비워 두기
클라이언트 시크릿: 비워 두기

헤더
이름: Authorization
값: Bearer replace-with-a-random-secret
```

Dify에서 도달할 수 있는 URL을 사용하세요. 예:

- Dify와 SQLTunnel이 동일한 Docker 네트워크에 있음: `http://sqltunnel:3000/mcp`
- Dify가 Docker에 있고 SQLTunnel이 호스트에 있음: `http://host.docker.internal:3000/mcp`
- Dify Cloud 또는 원격 배포: `https://sqltunnel.example.com/mcp`

연결 후 Agent 앱에서 SQLTunnel의 4가지 도구를 모두 활성화합니다.

## 사용법

Agent 지침에 다음을 추가합니다:

```text
SQLTunnel을 사용하여 데이터베이스를 조회할 수 있습니다. SQL을 생성하기 전에 사용 가능한 데이터베이스, 테이블, 관련 테이블 스키마를 확인하세요. 스키마나 컬럼 이름을 추측하지 마세요.
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

## Workflow와 Chatflow

모델이 테이블을 선택하고 SQL을 생성해야 할 때는 Agent 노드를 사용합니다. 고정 SQL은 도구 노드에서 `query_database`를 호출합니다:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select id, status from orders where id = $1",
  "params": [123],
  "maxRows": 10
}
```

PostgreSQL 플레이스홀더는 `$1`, `$2`를 사용하고, MySQL은 `?`를 사용합니다.
