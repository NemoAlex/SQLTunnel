# Claude Code Konfiguration

## CLI

Wählen Sie entweder die Klartext- oder die Umgebungsvariablen-Konfiguration.

### Klartext-Konfiguration

```bash
claude mcp add --transport http --scope user sqltunnel \
  "http://127.0.0.1:3000/mcp" \
  --header "Authorization: Bearer replace-with-a-random-secret"
```

### Umgebungsvariablen

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

claude mcp add --transport http --scope user sqltunnel "$SQLTUNNEL_MCP_URL" \
  --header "Authorization: Bearer $SQLTUNNEL_API_KEY"
```

Verwenden Sie `--scope project` anstelle von `--scope user`, um den Server nur dem aktuellen Projekt hinzuzufügen.

## Projekt-Konfiguration

Wählen Sie entweder die Klartext- oder die Umgebungsvariablen-Konfiguration in `.mcp.json` im Projekt-Root.

### Klartext-Konfiguration

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer replace-with-a-random-secret"
      }
    }
  }
}
```

### Umgebungsvariablen

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```json
{
  "mcpServers": {
    "sqltunnel": {
      "type": "http",
      "url": "${SQLTUNNEL_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${SQLTUNNEL_API_KEY}"
      }
    }
  }
}
```

Geben Sie keinen echten API-Schlüssel in `.mcp.json` in die Versionskontrolle ein.

## Verwendung

Sagen Sie Claude Code zuerst:

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
