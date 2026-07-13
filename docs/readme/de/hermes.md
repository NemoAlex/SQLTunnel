# Hermes Konfiguration

Fügen Sie SQLTunnel zu `~/.hermes/config.yaml` hinzu. Wählen Sie entweder die Klartext- oder die Umgebungsvariablen-Konfiguration.

## Klartext-Konfiguration

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

## Umgebungsvariablen

Fügen Sie dies zu `~/.hermes/.env` hinzu:

```dotenv
SQLTUNNEL_MCP_URL=http://127.0.0.1:3000/mcp
SQLTUNNEL_API_KEY=replace-with-a-random-secret
```

Fügen Sie dann Folgendes zu `~/.hermes/config.yaml` hinzu:

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

## Verwendung

Testen Sie den Server und starten Sie Hermes:

```bash
hermes mcp test sqltunnel
hermes chat
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
