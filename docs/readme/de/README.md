<p align="center">
  <img src="../../../assets/icon-1024-macos.png" alt="SQLTunnel-App-Symbol" width="128" />
</p>

<h1 align="center">SQLTunnel</h1>

<p align="center"><strong>Ein zugriffsgesteuertes Datenbank-Gateway für Agents, Automatisierungsplattformen und interne Anwendungen</strong></p>

<p align="center">
  <a href="https://hub.docker.com/r/nemoalex/sqltunnel"><img src="https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls" alt="Docker Pulls" /></a>
  <a href="https://hub.docker.com/r/nemoalex/sqltunnel/tags"><img src="https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image" alt="Docker Image Version" /></a>
</p>

<p align="center">
  <a href="../../../README.md">English</a> |
  <a href="../zh-CN/README.md">中文</a> |
  <a href="../ja/README.md">日本語</a> |
  <a href="../ko/README.md">한국어</a> |
  <a href="../fr/README.md">Français</a> |
  <a href="README.md">Deutsch</a>
</p>

SQLTunnel ermöglicht Codex, Claude Code, Hermes, Dify und internen Anwendungen den kontrollierten Zugriff auf MySQL und PostgreSQL, ohne Datenbankports direkt freizugeben.

## Wichtige Funktionen

- Unterstützt MySQL und PostgreSQL über direkte Verbindungen oder SSH-Tunnel.
- Identifiziert Aufrufer über API-Schlüssel und konfiguriert Lese-/Schreibrechte pro Client und Datenbank.
- Unterstützt SSH Config, Host-Aliase und ProxyJump.
- Stellt eine OpenAPI-HTTP-API und einen Streamable-HTTP-MCP-Endpunkt bereit.
- Begrenzt Zeilenanzahl und Zeitüberschreitungen; Schreibvorgänge erfordern eine ausdrückliche Berechtigung.

## Desktop-Version

Die Desktop-Version unterstützt macOS und Windows und bündelt Konfiguration, Betrieb und Überwachung von SQLTunnel in einer grafischen Oberfläche.

<p align="center">
  <img src="sqltunnel-desktop-de.png" alt="SQLTunnel-Desktop-Version in deutscher Sprache" width="512" />
</p>

## Headless-Dienst

Die Headless-Version verwendet denselben Gateway-Kern und eignet sich für Docker, Server und Hintergrundbereitstellungen. Sie verwaltet Datenbanken, SSH-Tunnel und Client-Berechtigungen über `gateway.yaml` und stellt dieselben MCP/OpenAPI-Schnittstellen wie die Desktop-Version bereit.

- [Docker-Bereitstellung](docker.md)
- [Konfigurationsreferenz](configuration.md)

## Funktionsweise

```mermaid
flowchart LR
  ExternalApp["Agents, KI-Plattformen, interne Anwendungen"]
  SQLTunnel["SQLTunnel<br/>Authentifizierung, Berechtigungen, Verbindungsverwaltung"]
  Database[("MySQL / PostgreSQL")]

  ExternalApp -->|"MCP oder OpenAPI"| SQLTunnel
  SQLTunnel -->|"SSH-Tunnel oder direkte Verbindung"| Database
```

SQLTunnel identifiziert Aufrufer über Bearer-API-Schlüssel, kontrolliert Lese-/Schreibrechte pro Client und Datenbank und wendet Zeilen-, Abfrage- und Verbindungslimits an. Datenbankpasswörter und private SSH-Schlüssel werden Aufrufern niemals offengelegt.

## Dokumentation

- [Docker-Bereitstellung](docker.md)
- [Konfigurationsreferenz](configuration.md)
- [API-Referenz](api.md)
- [Dify](dify.md)
- [Claude Code](claude-code.md)
- [Codex](codex.md)
- [Hermes](hermes.md)
