# SQLTunnel API 참조

[README로 돌아가기](README.md) | [구성 참조](configuration.md) | [Dify 설정 가이드](dify.md)

## API

Dify 전용 설정은 [dify.md](dify.md)를 참조하세요.

### GET /health

서비스가 살아 있는지 확인합니다.

요청 매개변수: 없음.

성공 응답:

```json
{
  "status": "ok"
}
```

### GET /openapi.json

OpenAPI 문서를 반환합니다.

요청 매개변수: 없음.

성공 응답: 현재 요청 URL에서 `servers`를 추가한 `openapi.json` 기반 JSON입니다. 리버스 프록시 뒤에서는 `X-Forwarded-Proto`와 `X-Forwarded-Host`를 사용해 외부 URL을 유추합니다.

### POST /schema

명시적인 `operation`을 통해 데이터베이스, 테이블, 테이블 스키마 메타데이터를 제공합니다. `Authorization: Bearer <SQLTUNNEL_API_KEY>` 요청 헤더가 필요합니다.

현재 클라이언트가 사용할 수 있는 데이터베이스 나열:

```json
{
  "operation": "list_databases"
}
```

응답에는 데이터베이스 서버 ID, 실제 데이터베이스 이름, 유형, 권한이 포함됩니다:

```json
{
  "operation": "list_databases",
  "databases": [
    {
      "dbServerId": "prod-postgres",
      "databaseName": "app",
      "databaseType": "postgres",
      "permission": "read"
    }
  ]
}
```

하나의 데이터베이스 내 테이블 및 뷰 나열:

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "refresh": false
}
```

응답은 간결한 테이블 목록입니다. `schemaName`과 `tableName`을 describe 작업에 복사합니다:

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "databaseName": "app",
  "databaseType": "postgres",
  "tables": [
    {
      "schemaName": "public",
      "tableName": "users",
      "type": "table",
      "comment": "애플리케이션 사용자"
    }
  ],
  "cached": false,
  "cachedAt": "2026-07-10T00:00:00.000Z"
}
```

하나의 테이블 또는 뷰 설명:

```json
{
  "operation": "describe_table",
  "dbServerId": "prod-postgres",
  "schemaName": "public",
  "tableName": "users"
}
```

응답의 `table`에는 `columns`가 포함되며, 유형, NULL 허용 여부, 기본값, 주석, 기본 키 멤버십, 고유 제약 조건 멤버십이 포함됩니다. `unique`는 해당 열이 기본 키 또는 고유 제약 조건에 참여함을 의미하며, 복합 제약 조건의 모든 멤버는 `true`로 표시됩니다.

MySQL의 경우 `schemaName`은 구성된 데이터베이스 이름입니다. PostgreSQL은 실제 스키마 이름을 사용합니다. 스키마 메타데이터는 기본적으로 5분 동안 캐시되며, `list_tables`와 `describe_table` 모두 `refresh: true`를 허용합니다. `defaults.schemaCacheTtlMs`로 캐싱을 구성하거나 비활성화할 수 있습니다. SQLTunnel을 통해 실행된 성공적인 쓰기 또는 DDL 문은 해당 캐시 항목을 무효화합니다. 데이터베이스 스키마는 캐시된 열 수가 20,000개로 제한되며, 더 큰 스키마는 `SCHEMA_TOO_LARGE`를 반환합니다.

### POST /query

SQL 쿼리를 실행합니다.

요청 본문:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select * from users limit 10",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

요청 필드:

- 헤더 `Authorization: Bearer <SQLTUNNEL_API_KEY>`: 필수. 클라이언트 API 키.
- `dbServerId`: 필수. 대상 데이터베이스 서버 ID.
- `sql`: 필수. 실행할 SQL.
- `params`: 선택. SQL 매개변수 배열. 기본값: `[]`.
- `maxRows`: 선택. 이 쿼리에 요청된 최대 행 수. 실제 값은 구성된 서버/클라이언트 제한을 초과할 수 없습니다.
- `responseFormat`: 선택. `raw` 또는 `json`. 기본값: `raw`.

기본 `responseFormat: "raw"`인 경우 응답은 `text/plain`입니다:

- 단일 열 결과: 한 줄에 하나의 원시 값.
- 다중 열 결과: 첫 번째 줄에 열 이름이 포함된 TSV 텍스트.

`responseFormat: "json"`인 경우 응답은 구조화된 JSON입니다:

```json
{
  "columns": ["id", "name"],
  "rows": [
    { "id": 1, "name": "Alice" }
  ],
  "rowCount": 1,
  "durationMs": 24,
  "dbServerId": "prod-postgres"
}
```

응답 필드:

- `columns`: 결과 열 이름.
- `rows`: 결과 행.
- `rowCount`: 반환된 행 수.
- `durationMs`: 쿼리 실행 시간(밀리초).
- `dbServerId`: 이 쿼리에 사용된 데이터베이스 서버.

권한 및 제한:

- `permission: read`는 `select`, `with`, `show`, `describe`, `explain` 등의 읽기 전용 SQL을 허용합니다.
- `permission: write`는 읽기와 쓰기 SQL을 모두 허용합니다.
- 다중 문 SQL은 읽기 전용 SQL로 처리되지 않습니다.
- 쿼리는 항상 `maxRows`와 `queryTimeoutMs`를 강제합니다.
- SSH 터널 설정 및 데이터베이스 연결에는 `connectTimeoutMs`를, SQL 실행에는 `queryTimeoutMs`를 사용합니다.

오류 응답 형식:

```json
{
  "code": "ERROR_CODE",
  "message": "사람이 읽을 수 있는 메시지",
  "requestId": "req-1"
}
```
