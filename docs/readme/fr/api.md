# Référence de l'API SQLTunnel

[Retour à la README](README.md) | [Référence de configuration](configuration.md) | [Guide de configuration Dify](dify.md)

## API

Pour la configuration spécifique à Dify, consultez [dify.md](dify.md).

### GET /health

Vérifie si le service est opérationnel.

Paramètres de requête : aucun.

Réponse en cas de succès :

```json
{
  "status": "ok"
}
```

### GET /openapi.json

Retourne le document OpenAPI.

Paramètres de requête : aucun.

Réponse en cas de succès : JSON basé sur `openapi.json`, avec `servers` ajoutés à partir de l'URL de la requête actuelle. Derrière un proxy inverse, `X-Forwarded-Proto` et `X-Forwarded-Host` sont utilisés pour déterminer l'URL externe.

### POST /schema

Fournit les métadonnées de la base de données, des tables et du schéma des tables via une `operation` explicite. L'en-tête de requête `Authorization: Bearer <SQLTUNNEL_API_KEY>` est requis.

Lister les bases de données disponibles pour le client actuel :

```json
{
  "operation": "list_databases"
}
```

La réponse inclut l'identifiant du serveur de base de données, le nom réel de la base de données, le type et l'autorisation :

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

Lister les tables et vues d'une base de données :

```json
{
  "operation": "list_tables",
  "dbServerId": "prod-postgres",
  "refresh": false
}
```

La réponse est une liste de tables compacte. Copiez `schemaName` et `tableName` dans l'opération describe :

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
      "comment": "Utilisateurs de l'application"
    }
  ],
  "cached": false,
  "cachedAt": "2026-07-10T00:00:00.000Z"
}
```

Décrire une table ou une vue :

```json
{
  "operation": "describe_table",
  "dbServerId": "prod-postgres",
  "schemaName": "public",
  "tableName": "users"
}
```

La `table` de la réponse contient `columns` avec les types, la nullabilité, les valeurs par défaut, les commentaires, l'appartenance à la clé primaire et l'appartenance à une contrainte unique. `unique` signifie que la colonne participe à une clé primaire ou une contrainte unique ; chaque membre d'une contrainte composite est marqué `true`.

Pour MySQL, `schemaName` est le nom de base de données configuré. PostgreSQL utilise le nom de schéma réel. Les métadonnées de schéma sont mises en cache pendant cinq minutes par défaut ; `list_tables` et `describe_table` acceptent tous deux `refresh: true`. Configurez ou désactivez la mise en cache avec `defaults.schemaCacheTtlMs`. Les écritures ou les instructions DDL exécutées avec succès via SQLTunnel invalident l'entrée de cache correspondante. Un schéma de base de données est limité à 20 000 colonnes en cache ; les schémas plus grands retournent `SCHEMA_TOO_LARGE`.

### POST /query

Exécute une requête SQL.

Corps de la requête :

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select * from users limit 10",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

Champs de la requête :

- En-tête `Authorization: Bearer <SQLTUNNEL_API_KEY>` : Obligatoire. Clé API du client.
- `dbServerId` : Obligatoire. Identifiant du serveur de base de données cible.
- `sql` : Obligatoire. SQL à exécuter.
- `params` : Facultatif. Tableau de paramètres SQL. Par défaut : `[]`.
- `maxRows` : Facultatif. Nombre maximum de lignes demandé pour cette requête. La valeur effective ne peut pas dépasser les limites configurées du serveur/client.
- `responseFormat` : Facultatif. `raw` ou `json`. Par défaut : `raw`.

Avec `responseFormat: "raw"` par défaut, la réponse est `text/plain` :

- Résultat à une seule colonne : une valeur brute par ligne.
- Résultat multi-colonnes : texte TSV avec les noms de colonnes sur la première ligne.

Avec `responseFormat: "json"`, la réponse est un JSON structuré :

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

Champs de la réponse :

- `columns` : Noms des colonnes du résultat.
- `rows` : Lignes du résultat.
- `rowCount` : Nombre de lignes retournées.
- `durationMs` : Durée de la requête en millisecondes.
- `dbServerId` : Serveur de base de données utilisé pour cette requête.

Autorisations et limites :

- `permission: read` autorise le SQL en lecture seule tel que `select`, `with`, `show`, `describe` et `explain`.
- `permission: write` autorise le SQL en lecture et en écriture.
- Le SQL multi-instructions est traité comme du SQL non en lecture seule.
- Les requêtes appliquent toujours `maxRows` et `queryTimeoutMs`.
- La configuration du tunnel SSH et la connexion à la base de données utilisent `connectTimeoutMs` ; l'exécution SQL utilise `queryTimeoutMs`.

Format de réponse d'erreur :

```json
{
  "code": "ERROR_CODE",
  "message": "Message lisible par un utilisateur",
  "requestId": "req-1"
}
```
