# Codex Konfiguration

## Desktop-App

Öffnen Sie **Settings → MCP servers → Add server**.

Wählen Sie entweder die Klartext- oder die Umgebungsvariablen-Konfiguration.

### Klartext-Konfiguration

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: Leer lassen

HTTP Headers
Name: Authorization
Value: Bearer replace-with-a-random-secret
```

### Umgebungsvariable

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: SQLTUNNEL_API_KEY
HTTP Headers: Leer lassen; keinen Header hinzufügen
```

## CLI

Wählen Sie entweder die Klartext- oder die Umgebungsvariablen-Konfiguration.

### Klartext-Konfiguration

Fügen Sie Folgendes zu `~/.codex/config.toml` hinzu:

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
```

### Umgebungsvariable

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

codex mcp add sqltunnel \
  --url "http://127.0.0.1:3000/mcp" \
  --bearer-token-env-var SQLTUNNEL_API_KEY
```

## Verwendung

Sagen Sie Codex zuerst:

```text
Sie können SQLTunnel verwenden, um Datenbanken abzufragen.
```

Beschreiben Sie dann jede Anfrage in natürlicher Sprache. Zum Beispiel:

```text
Listen Sie die Datenbanken auf, auf die ich zugreifen kann.
```

```text
Listen Sie die Tabellen in prod-postgres auf.
```

```text
Fragen Sie die 10 neuesten Bestellungen ab. Prüfen Sie vor der Abfrage die relevanten Tabellenschemata.
```
