# SQLTunnel mit Docker bereitstellen

Der SQLTunnel-Dienst ohne Benutzeroberfläche wird auf [Docker Hub](https://hub.docker.com/r/nemoalex/sqltunnel) für dauerhafte Bereitstellungen auf Servern und NAS-Geräten veröffentlicht.

## Konfiguration vorbereiten

Erstellen Sie eine `compose.yaml` im Bereitstellungsverzeichnis:

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

Bei der Portzuordnung ist das erste `3000` der extern erreichbare Host-Port und das zweite der Container-Port.

Verwenden Sie dieses Konfigurationsverzeichnis-Layout:

```text
config/
├── gateway.yaml       # Hauptkonfiguration von SQLTunnel
└── ssh/               # Optional: für SSH-Tunnel-Verbindungen
    ├── config          # Optional: SSH Config, Host-Aliase und ProxyJump
    └── id_rsa          # Optional: SSH-Privatschlüssel
```

Das `ssh/`-Verzeichnis ist optional. Für direkte Datenbankverbindungen wird nur `gateway.yaml` benötigt.

Laden Sie die Konfigurationsvorlage herunter:

```bash
mkdir config
curl -fsSL https://raw.githubusercontent.com/NemoAlex/SQLTunnel/main/config/gateway.example.yaml \
  -o config/gateway.yaml
```

Bearbeiten Sie `config/gateway.yaml` für Ihre Umgebung. Details zu Datenbankverbindungen, SSH-Tunneln und Client-Berechtigungen finden Sie in der [Konfigurationsreferenz](configuration.md).

## Dienst starten

```bash
docker compose up -d
```

Überprüfen Sie, ob der Dienst läuft:

```bash
docker compose ps
docker compose logs -f sqltunnel
curl http://127.0.0.1:3000/health
```

## Hinweise zum Container

- `127.0.0.1` in `gateway.yaml` bezieht sich auf den SQLTunnel-Container, nicht auf den Host.
- Legen Sie SSH Config und Privatschlüssel unter `config/ssh/` ab und referenzieren Sie sie in `gateway.yaml` mit relativen Pfaden. Das gesamte `config`-Verzeichnis wird schreibgeschützt unter `/app/config` gemountet.
- `gateway.yaml` enthält Datenbankpasswörter und Client-API-Schlüssel. Übernehmen Sie diese Datei nicht in die Versionskontrolle und schränken Sie die Leserechte ein.
- Bei externer Veröffentlichung des Dienstes verwenden Sie einen Reverse-Proxy mit HTTPS. Geben Sie keine Datenbankports öffentlich im Internet frei.
