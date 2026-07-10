# SQLTunnel

[![Docker Pulls](https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls)](https://hub.docker.com/r/nemoalex/sqltunnel)
[![Docker Image Version](https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image)](https://hub.docker.com/r/nemoalex/sqltunnel/tags)

[English](../../README.md) | [中文](../../README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md)

SQLTunnel ist ein Datenbankzugriffs-Gateway. Es ermöglicht Agents wie Codex, Claude Code und Hermes sowie Dify, Automatisierungsplattformen und internen Anwendungen, private Datenbanken mit kontrollierten Berechtigungen abzufragen, ohne Datenbankports direkt freizugeben.

Wichtige Funktionen:

- Unterstützt MySQL und PostgreSQL über direkte Verbindungen oder SSH-Tunnel.
- Identifiziert Aufrufer über API keys und konfiguriert Lese-/Schreibrechte pro client und db server.
- Unterstützt SSH config, Host-Aliase und ProxyJump.
- Stellt eine OpenAPI HTTP API und einen Streamable HTTP MCP endpoint bereit.
- Begrenzt Zeilenanzahl und Zeitüberschreitungen; Schreibvorgänge erfordern eine ausdrückliche Berechtigung.

## Funktionsweise

```mermaid
flowchart LR
  ExternalApp["Externe Anwendungen<br/>Agents, KI-Plattformen, interne Tools"]
  SQLTunnel["SQLTunnel<br/>Zugriffskontrolle und Verbindungsverwaltung"]
  Database[("Private Datenbank<br/>MySQL oder PostgreSQL")]

  ExternalApp -->|"HTTP API oder MCP"| SQLTunnel
  SQLTunnel -->|"SSH-Tunnel oder direkte Verbindung"| Database
```

`gateway.yaml` enthält drei Arten von Konfigurationen:

- `dbServers`: Verbindungsdaten der Datenbanken.
- `sshServers`: wiederverwendbare SSH-Verbindungen.
- `clients`: externe Aufrufer und ihre Datenbankberechtigungen.

Datenbankpasswörter und private SSH-Schlüssel verbleiben auf dem SQLTunnel-Server. Externe Aufrufer benötigen nur ihren eigenen API key.

## Schnellstart

### Direkt ausführen

```bash
git clone https://github.com/NemoAlex/SQLTunnel.git
cd SQLTunnel
cp config/gateway.example.yaml config/gateway.yaml
npm install
npm run build
npm run start
```

Der Dienst lauscht standardmäßig auf `0.0.0.0:3000`. Die Adresse kann über Umgebungsvariablen geändert werden:

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

Die `compose.yaml` im Repository baut das Image lokal:

```bash
docker compose up --build
```

## Konfigurationsverzeichnis

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # Optional
    config             # Optional: SSH Host-Aliase, Benutzer, Ports, ProxyJump und weitere Anmeldedaten
    id_rsa             # Optional: privater Schlüssel für die SSH-Anmeldung per Schlüssel
```

Kopieren Sie `config/gateway.example.yaml` und passen Sie die Datei an Ihre Umgebung an. Mounten Sie bei Docker-Bereitstellungen das gesamte Verzeichnis `config` unter `/app/config`. Verweisen Sie mit Pfaden relativ zu `gateway.yaml` auf SSH-Dateien, zum Beispiel `ssh/config` oder `ssh/id_rsa`.

## OpenAPI

Das OpenAPI-Dokument ist unter `GET /openapi.json` verfügbar. Die fachlichen endpoints sind:

- `POST /schema`: Datenbanken oder Tabellen auflisten oder ein Tabellenschema lesen.
- `POST /query`: eine autorisierte und begrenzte SQL-Anweisung ausführen.

Anfragen werden mit `Authorization: Bearer <SQLTUNNEL_API_KEY>` authentifiziert. Vollständige Formate finden Sie in der [API-Referenz](../api.md).

## MCP

Der Streamable HTTP MCP endpoint ist unter `POST /mcp` verfügbar und stellt folgende Tools bereit:

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

MCP verwendet dieselben API keys, Datenbankberechtigungen, Zeilenlimits und Zeitüberschreitungen wie OpenAPI. Verwenden Sie für Agents einen schreibgeschützten client und Datenbankbenutzer und stellen Sie `/mcp` bei entfernten Bereitstellungen über HTTPS bereit.

Einrichtungsanleitungen:

- [Dify](../dify.md)
- [Claude Code](../claude-code.md)
- [Codex](../codex.md)
- [Hermes](../hermes.md)

## Referenz

- [Konfigurationsreferenz](../configuration.md)
- [API-Referenz](../api.md)
