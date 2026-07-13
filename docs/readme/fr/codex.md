# Configuration de Codex

## Application de bureau

Ouvrez **Settings → MCP servers → Add server**.

Choisissez soit la configuration en texte clair, soit la configuration par variables d'environnement.

### Configuration en texte clair

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: Laisser vide

HTTP Headers
Name: Authorization
Value: Bearer replace-with-a-random-secret
```

### Variable d'environnement

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

```text
Name: SQLTunnel
Type: Streamable HTTP
URL: http://127.0.0.1:3000/mcp
Bearer Token Environment Variable: SQLTUNNEL_API_KEY
HTTP Headers: Laisser vide ; n'ajoutez pas d'en-tête
```

## CLI

Choisissez soit la configuration en texte clair, soit la configuration par variables d'environnement.

### Configuration en texte clair

Ajoutez ceci à `~/.codex/config.toml` :

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
```

### Variable d'environnement

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"

codex mcp add sqltunnel \
  --url "http://127.0.0.1:3000/mcp" \
  --bearer-token-env-var SQLTUNNEL_API_KEY
```

## Utilisation

Dites d'abord à Codex :

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
