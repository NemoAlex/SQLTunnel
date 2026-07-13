# SQLTunnel 구성 참조

[README로 돌아가기](README.md) | [API 참조](api.md) | [Dify 설정 가이드](dify.md)

## 구성

헤드리스 서비스는 `gateway.yaml`을 사용하여 게이트웨이 구성을 합니다.

구성에는 세 가지 주요 섹션이 있습니다:

- `sshServers`: `~/.ssh/config`와 `ProxyJump`를 지원하는 재사용 가능한 SSH 터널 항목.
- `dbServers`: 데이터베이스 유형, 주소, 자격 증명, 선택적 SSH 액세스를 포함한 데이터베이스 서버.
- `clients`: API 클라이언트, API 키, 각 클라이언트가 접근할 수 있는 데이터베이스 서버.

선택적 글로벌 기본값:

- `defaults.maxRows`: 기본 최대 행 수. 기본값: `1000`.
- `defaults.queryTimeoutMs`: 기본 데이터베이스 쿼리 타임아웃. 기본값: `10000`.
- `defaults.connectTimeoutMs`: 기본 SSH 터널 및 데이터베이스 연결 타임아웃. 기본값: `10000`.
- `defaults.schemaCacheTtlMs`: 메모리 내 데이터베이스 스키마 메타데이터 캐시 TTL. 기본값: `300000`(5분). `0`으로 설정하면 캐싱을 비활성화합니다.

### 구성 파일 및 경로

권장 레이아웃:

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # 선택
    config             # SSH Host 별칭, 사용자, 포트, ProxyJump 및 관련 설정
    id_rsa             # 키 기반 인증에 사용되는 개인 키
```

기본 파일은 `config/gateway.yaml`입니다. `SQLTUNNEL_CONFIG=/path/to/gateway.yaml`을 설정하면 다른 위치에서 로드할 수 있습니다.

`sshConfigPath`와 `privateKeyPath`의 상대 값은 `gateway.yaml`이 포함된 디렉터리에서 해석됩니다. 이렇게 하면 전체 `config` 디렉터리를 Docker의 `/app/config`에 직접 마운트할 수 있습니다.

`gateway.yaml`에는 데이터베이스 비밀번호, 클라이언트 API 키, SSH 비밀번호, 개인 키 경로가 포함될 수 있습니다. 실제 구성을 버전 관리에 커밋하지 마세요. 파일 권한을 제한하고 각 클라이언트에게 필요한 데이터베이스와 `read` 또는 `write` 액세스만 부여하세요.

### SSH 서버

`sshServers`는 재사용 가능한 SSH 터널 항목을 정의합니다. db server는 `sshServerId`로 참조합니다.

```yaml
sshServers:
  - id: bastion-prod
    sshConfigPath: ssh/config
    host: db-prod
    port: 22
    username: deploy
    password: optional-password
    privateKeyPath: ssh/id_rsa
    passphrase: optional-key-passphrase
    idleTimeoutMs: 60000
```

필드:

- `id`: 필수. `dbServers[].sshServerId`에서 사용하는 SSH 서버 id.
- `host`: 필수. 실제 SSH 호스트 또는 SSH config의 Host 별칭.
- `sshConfigPath`: 선택. SSH config 경로. 상대 경로는 `gateway.yaml`이 포함된 디렉터리에서 해석됩니다. 생략하면 SQLTunnel은 런타임 사용자의 `~/.ssh/config`를 읽습니다.
- `port`: 선택. SSH 포트. 기본값: `22`.
- `username`: 선택. SSH 사용자 이름. 기본값: 현재 런타임 사용자.
- `password`: 선택. 비밀번호 인증용 SSH 비밀번호.
- `privateKeyPath`: 선택. 개인 키 경로. 상대 경로는 `gateway.yaml`이 포함된 디렉터리에서 해석됩니다. 생략하면 SQLTunnel은 SSH config의 `IdentityFile` 또는 런타임 사용자의 일반적인 기본 개인 키를 사용할 수 있습니다.
- `passphrase`: 선택. 암호화된 개인 키의 passphrase.
- `idleTimeoutMs`: 선택. 유휴 SSH 연결을 유지하는 시간. 기본값: `60000`.
- `proxyJumps`: 선택. ProxyJump 체인. 대부분의 경우 ProxyJump는 SSH config에 넣고 SQLTunnel은 거기에서 읽습니다.

지원되는 SSH config 필드:

- `Host`
- `HostName`
- `User`
- `Port`
- `IdentityFile`
- `ProxyJump`

SQLTunnel은 위에 나열된 SSH config 필드만 구현합니다. 다른 OpenSSH 옵션은 무시됩니다:

- `ProxyCommand`
- `Include`
- `HostKeyAlias`
- `LocalForward`
- `RemoteForward`
- `DynamicForward`

`host`가 Host 별칭인 경우 SQLTunnel은 SSH config에서 실제 호스트, 사용자, 포트, 개인 키, ProxyJump를 채울 수 있습니다.

Docker 친화적 SSH config 예시:

```yaml
sshServers:
  - id: db-prod
    sshConfigPath: ssh/config
    host: db-prod
```

일치하는 SSH config:

```sshconfig
Host bastion-prod
  HostName bastion.example.com
  User deploy
  Port 22
  IdentityFile ~/.ssh/id_rsa

Host db-prod
  HostName 10.0.8.12
  User deploy
  ProxyJump bastion-prod
```

SQLTunnel은 SSH 서버 id별로 SSH 연결을 재사용합니다. 각 쿼리는 새로운 전달 채널을 엽니다. 유휴 SSH 연결은 `idleTimeoutMs` 후에 닫힙니다.

로컬 실행 시 ssh-agent를 사용할 수 있으면 `SSH_AUTH_SOCK`를 사용합니다. Docker에서 ssh-agent를 사용하려면 직접 에이전트 소켓을 마운트하세요. 그렇지 않으면 컨테이너 내부에서 읽을 수 있는 개인 키를 구성하세요.

### DB 서버

`dbServers`는 SQLTunnel이 접근할 수 있는 데이터베이스를 정의합니다. 클라이언트에는 데이터베이스 서버 ID별로 접근 권한이 부여됩니다.

```yaml
dbServers:
  - id: reporting-mysql
    description: 일별 매출, 상품 성과 및 전환 퍼널 지표를 포함하는 전자상거래 분석 데이터베이스
    type: mysql
    sshServerId: bastion-prod
    maxRows: 1000
    queryTimeoutMs: 10000
    connectTimeoutMs: 10000
    database:
      host: 127.0.0.1
      port: 3306
      user: app
      password: mysql-password
      database: app
```

필드:

- `id`: 필수. `clients[].dbServers[].serverId`와 쿼리 요청 `dbServerId`에서 사용하는 데이터베이스 서버 ID.
- `description`: 선택. 데이터베이스의 목적과 주요 데이터를 설명합니다. `list_db_servers`와 `POST /schema`의 `list_databases` 작업에서 클라이언트에 반환됩니다.
- `type`: 필수. 데이터베이스 유형: `mysql` 또는 `postgres`.
- `sshServerId`: 선택. `sshServers[].id`를 참조합니다. 생략하면 SQLTunnel은 데이터베이스에 직접 연결합니다.
- `maxRows`: 선택. 이 db server의 기본 최대 행 수. 생략하면 `defaults.maxRows`가 사용됩니다.
- `queryTimeoutMs`: 선택. 이 db server의 기본 데이터베이스 쿼리 타임아웃. 생략하면 `defaults.queryTimeoutMs`가 사용됩니다.
- `connectTimeoutMs`: 선택. 이 db server의 SSH 터널 및 데이터베이스 연결 타임아웃. 생략하면 `defaults.connectTimeoutMs`가 사용됩니다. 기본값: `10000`.
- `database.host`: 필수. 데이터베이스 호스트. SSH 터널을 사용하는 경우 이 주소는 SSH 서버 측에서 해석됩니다.
- `database.port`: 필수. 데이터베이스 포트.
- `database.user`: 필수. 데이터베이스 사용자 이름.
- `database.password`: 필수. 데이터베이스 비밀번호, 구성 파일에 직접 저장됩니다.
- `database.database`: 필수. 데이터베이스 이름.

### 클라이언트

`clients`는 SQLTunnel을 호출할 수 있는 외부 애플리케이션과 액세스할 수 있는 db server를 정의합니다.

```yaml
clients:
  - id: analytics-app
    apiKey: dev-read-key
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
      - serverId: reporting-mysql
```

필드:

- `id`: 필수. 호출자를 식별하는 데 사용되는 클라이언트 id.
- `apiKey`: 필수. 호출자가 `Authorization: Bearer <SQLTUNNEL_API_KEY>` 토큰으로 전송하는 API 키.
- `dbServers`: 필수. 이 클라이언트가 접근할 수 있는 데이터베이스 서버 목록.
- `dbServers[].serverId`: 필수. `dbServers[].id`를 참조합니다.
- `dbServers[].permission`: 선택. 권한: `read` 또는 `write`. 기본값은 `read`입니다. `read`는 읽기 전용 SQL을 허용하고, `write`는 읽기 및 쓰기 SQL을 모두 허용합니다.
- `dbServers[].maxRows`: 선택. 이 클라이언트가 이 데이터베이스 서버에서 가져올 수 있는 최대 행 수. 생략하면 데이터베이스 서버 또는 글로벌 기본값이 사용됩니다.
- `dbServers[].queryTimeoutMs`: 선택. 이 클라이언트가 이 데이터베이스 서버에서 사용하는 쿼리 타임아웃. 생략하면 데이터베이스 서버 또는 글로벌 기본값이 사용됩니다.
