# Configuration de Claude Code

## CLI

Choisissez soit la configuration en texte clair, soit la configuration par variables d'environnement.

### Configuration en texte clair

```bash
claude mcp add --transport http --scope user sqltunnel \
  "http://127.0.0.1:3000/mcp" \
  --header "Authorization: Bearer replace-with-a-random-secret"
```

### Variables d'environnement

```bash
export SQLTUNNEL_MCP_URL="http://127.0.0.1:3000/mcp"
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

claude mcp add --transport http --scope user sqltunnel "$SQLTUNNEL_MCP_URL" \
  --header "Authorization: Bearer $SQLTUNNEL_API_KEY"
```

Utilisez `--scope project` au lieu de `--scope user` pour ajouter le serveur uniquement au projet en cours.

## Configuration du projet

Choisissez soit la configuration en texte clair, soit la configuration par variables d'environnement dans `.mcp.json` à la racine du projet.

### Configuration en texte clair

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

### Variables d'environnement

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

Ne validez pas une vraie clé API dans `.mcp.json`.

## Utilisation

Dites d'abord à Claude Code :

```text
Vous pouvez utiliser SQLTunnel pour interroger des bases de données.
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
