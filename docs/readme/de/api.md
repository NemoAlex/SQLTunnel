# SQLTunnel API-Referenz

[Zurück zur README](README.md) | [Konfigurationsreferenz](configuration.md) | [Dify-Einrichtungsanleitung](dify.md)

## API

Für die Dify-spezifische Einrichtung siehe [dify.md](dify.md).

### GET /health

Überprüft, ob der Dienst erreichbar ist.

Anfrageparameter: keine.

Erfolgreiche Antwort:

```json
{
  "status": "ok"
}
```

### GET /openapi.json

Gibt das OpenAPI-Dokument zurück.

Anfrageparameter: keine.

Erfolgreiche Antwort: JSON basierend auf `openapi.json`, wobei `servers` aus der aktuellen Anfrage-URL hinzugefügt werden. Hinter einem Reverse-Proxy werden `X-Forwarded-Proto` und `X-Forwarded-Host` verwendet, um die externe URL zu ermitteln.

### POST /schema

Stellt Metadaten zu Datenbanken, Tabellen und Tabellenschemata über eine explizite `operation` bereit. Der Anfrage-Header `Authorization: Bearer <SQLTUNNEL_API_KEY>` ist erforderlich.

Verfügbare Datenbanken des aktuellen Clients auflisten:

```json
{
  "operation": "list_databases"
}
```

Die Antwort enthält die Datenbankserver-ID, den tatsächlichen Datenbanknamen, den Typ und die Berechtigung:

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

Tabellen und Ansichten in einer Datenbank auflisten:

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "refresh": false
}
```

Die Antwort ist eine kompakte Tabellenliste. Kopieren Sie `schemaName` und `tableName` in die describe-Operation:

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
      "comment": "Anwendungsbenutzer"
    }
  ],
  "cached": false,
  "cachedAt": "2026-07-10T00:00:00.000Z"
}
```

Eine Tabelle oder Ansicht beschreiben:

```json
{
  "operation": "describe_table",
  "dbServerId": "prod-postgres",
  "schemaName": "public",
  "tableName": "users"
}
```

Das `table`-Feld der Antwort enthält `columns` mit Typen, NULL-Zulässigkeit, Standardwerten, Kommentaren, Primärschlüsselzugehörigkeit und Unique-Constraint-Zugehörigkeit. `unique` bedeutet, dass die Spalte Teil eines Primärschlüssels oder Unique-Constraints ist; jedes Mitglied eines zusammengesetzten Constraints wird mit `true` markiert.

Für MySQL ist `schemaName` der konfigurierte Datenbankname. PostgreSQL verwendet den tatsächlichen Schemanamen. Schema-Metadaten werden standardmäßig fünf Minuten lang zwischengespeichert; sowohl `list_tables` als auch `describe_table` akzeptieren `refresh: true`. Konfigurieren oder deaktivieren Sie das Caching mit `defaults.schemaCacheTtlMs`. Erfolgreiche Schreib- oder DDL-Operationen, die über SQLTunnel ausgeführt werden, invalidieren den entsprechenden Cache-Eintrag. Ein Datenbankschema ist auf 20.000 zwischengespeicherte Spalten begrenzt; bei größeren Schemas wird `SCHEMA_TOO_LARGE` zurückgegeben.

### POST /query

Führt eine SQL-Abfrage aus.

Anfrage-Body:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select * from users limit 10",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

Anfragefelder:

- Header `Authorization: Bearer <SQLTUNNEL_API_KEY>`: Erforderlich. Client-API-Schlüssel.
- `dbServerId`: Erforderlich. ID des Zieldatenbankservers.
- `sql`: Erforderlich. Auszuführendes SQL.
- `params`: Optional. SQL-Parameter-Array. Standard: `[]`.
- `maxRows`: Optional. Angeforderte maximale Zeilenanzahl für diese Abfrage. Der effektive Wert kann konfigurierte Server-/Client-Limits nicht überschreiten.
- `responseFormat`: Optional. `raw` oder `json`. Standard: `raw`.

Mit dem Standardwert `responseFormat: "raw"` ist die Antwort `text/plain`:

- Einspaltiges Ergebnis: ein roher Wert pro Zeile.
- Mehrspaltiges Ergebnis: TSV-Text mit Spaltennamen in der ersten Zeile.

Mit `responseFormat: "json"` ist die Antwort strukturiertes JSON:

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

Antwortfelder:

- `columns`: Namen der Ergebnisspalten.
- `rows`: Ergebniszeilen.
- `rowCount`: Anzahl der zurückgegebenen Zeilen.
- `durationMs`: Abfragedauer in Millisekunden.
- `dbServerId`: Für diese Abfrage verwendeter Datenbankserver.

Berechtigungen und Limits:

- `permission: read` erlaubt schreibgeschütztes SQL wie `select`, `with`, `show`, `describe` und `explain`.
- `permission: write` erlaubt sowohl Lese- als auch Schreib-SQL.
- Multi-Statement-SQL wird als nicht schreibgeschütztes SQL behandelt.
- Abfragen erzwingen immer `maxRows` und `queryTimeoutMs`.
- Für den SSH-Tunnel-Aufbau und die Datenbankverbindung wird `connectTimeoutMs` verwendet; für die SQL-Ausführung `queryTimeoutMs`.

Fehlerantwortformat:

```json
{
  "code": "ERROR_CODE",
  "message": "Für Menschen lesbare Nachricht",
  "requestId": "req-1"
}
```
