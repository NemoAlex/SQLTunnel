# Configuration de Hermes

Ajoutez SQLTunnel à `~/.hermes/config.yaml`. Choisissez soit la configuration en texte clair, soit la configuration par variables d'environnement.

## Configuration en texte clair

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

## Variables d'environnement

Ajoutez ceci à `~/.hermes/.env` :

```dotenv
SQLTUNNEL_MCP_URL=http://127.0.0.1:3000/mcp
SQLTUNNEL_API_KEY=replace-with-a-random-secret
```

Puis ajoutez ceci à `~/.hermes/config.yaml` :

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

## Utilisation

Testez le serveur et démarrez Hermes :

```bash
hermes mcp test sqltunnel
hermes chat
```

Puis décrivez chaque demande en langage naturel. Par exemple :

```text
Liste les bases de données auxquelles j'ai accès.
```

```text
Liste les tables de prod-postgres.
```

```text
Récupère les 10 commandes les plus récentes. Examine les schémas de tables pertinents avant d'exécuter la requête.
```
