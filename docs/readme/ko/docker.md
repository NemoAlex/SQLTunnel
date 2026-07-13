# Docker로 SQLTunnel 배포하기

헤드리스 SQLTunnel 서비스는 서버 및 NAS 장치에서 장기 실행 배포를 위해 [Docker Hub](https://hub.docker.com/r/nemoalex/sqltunnel)에 게시되어 있습니다.

## 구성 준비

배포 디렉터리에 `compose.yaml`을 만듭니다:

```yaml
services:
  sqltunnel:
    image: nemoalex/sqltunnel:latest
    container_name: sqltunnel
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
```

포트 매핑에서 첫 번째 `3000`은 외부에서 접근할 수 있는 호스트 포트이고, 두 번째는 컨테이너 포트입니다.

다음 구성 디렉터리 레이아웃을 사용합니다:

```text
config/
├── gateway.yaml       # SQLTunnel 메인 구성
└── ssh/               # 선택: SSH 터널 연결에 사용
    ├── config          # 선택: SSH Config, Host 별칭, ProxyJump
    └── id_rsa          # 선택: SSH 개인 키
```

`ssh/` 디렉터리는 선택 사항입니다. 직접 데이터베이스 연결에는 `gateway.yaml`만 필요합니다.

구성 템플릿을 다운로드합니다:

```bash
mkdir config
curl -fsSL https://raw.githubusercontent.com/NemoAlex/SQLTunnel/main/config/gateway.example.yaml \
  -o config/gateway.yaml
```

사용 환경에 맞게 `config/gateway.yaml`을 편집하세요. 데이터베이스 연결, SSH 터널, 클라이언트 권한에 대한 자세한 내용은 [구성 참조](configuration.md)를 참조하세요.

## 서비스 시작

```bash
docker compose up -d
```

서비스가 실행 중인지 확인합니다:

```bash
docker compose ps
docker compose logs -f sqltunnel
curl http://127.0.0.1:3000/health
```

## 컨테이너 참고 사항

- `gateway.yaml`의 `127.0.0.1`은 호스트가 아닌 SQLTunnel 컨테이너를 의미합니다.
- SSH Config와 개인 키는 `config/ssh/` 아래에 두고 `gateway.yaml`에서 상대 경로로 참조하세요. 전체 `config` 디렉터리는 `/app/config`에 읽기 전용으로 마운트됩니다.
- `gateway.yaml`에는 데이터베이스 비밀번호와 클라이언트 API 키가 포함되어 있습니다. 버전 관리에 커밋하지 말고 읽기 권한을 제한하세요.
- 서비스를 원격으로 노출할 때는 HTTPS를 지원하는 리버스 프록시를 사용하세요. 데이터베이스 포트를 공개 인터넷에 노출하지 마세요.
