# Dify Konfiguration

## MCP-Server

Öffnen Sie die Tool-Verwaltungsseite im Dify-Workspace und fügen Sie einen HTTP-MCP-Server hinzu. Die Menübezeichnungen können je nach Dify-Version leicht variieren.

```text
Name: SQLTunnel
Serverkennung: sqltunnel
Server-Endpunkt-URL: http://sqltunnel:3000/mcp

Authentifizierung
Dynamische Client-Registrierung: Deaktiviert
Client-ID: Leer lassen
Client-Secret: Leer lassen

Header
Name: Authorization
Wert: Bearer replace-with-a-random-secret
```

Verwenden Sie eine URL, die von Dify aus erreichbar ist. Zum Beispiel:

- Dify und SQLTunnel im selben Docker-Netzwerk: `http://sqltunnel:3000/mcp`
- Dify in Docker und SQLTunnel auf dem Host: `http://host.docker.internal:3000/mcp`
- Dify Cloud oder eine Remote-Bereitstellung: `https://sqltunnel.example.com/mcp`

Schalten Sie nach dem Verbinden in einer Agent-App alle vier SQLTunnel-Tools ein.

## Verwendung

Fügen Sie dies den Agent-Instruktionen hinzu:

```text
Sie können SQLTunnel verwenden, um Datenbanken abzufragen. Prüfen Sie die verfügbaren Datenbanken, Tabellen und relevanten Tabellenschemata, bevor Sie SQL erzeugen. Raten Sie keine Schema- oder Spaltennamen.
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

## Workflow und Chatflow

Verwenden Sie einen Agent-Knoten, wenn das Modell Tabellen auswählen und SQL generieren soll. Für festes SQL rufen Sie `query_database` von einem Tool-Knoten auf:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select id, status from orders where id = $1",
  "params": [123],
  "maxRows": 10
}
```

PostgreSQL-Platzhalter verwenden `$1`, `$2`; MySQL verwendet `?`.
