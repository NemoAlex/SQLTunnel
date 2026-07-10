# SQLTunnel

[![Docker Pulls](https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls)](https://hub.docker.com/r/nemoalex/sqltunnel)
[![Docker Image Version](https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image)](https://hub.docker.com/r/nemoalex/sqltunnel/tags)

[English](../../README.md) | [中文](../../README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md)

SQLTunnel est une passerelle d'accès aux bases de données. Elle permet aux agents comme Codex, Claude Code et Hermes, ainsi qu'à Dify, aux plateformes d'automatisation et aux applications internes, d'interroger des bases de données privées avec des autorisations contrôlées, sans exposer directement leurs ports.

Fonctionnalités principales :

- Prend en charge MySQL et PostgreSQL, en connexion directe ou via un tunnel SSH.
- Identifie les appelants avec des clés API et configure les droits de lecture/écriture par client et db server.
- Prend en charge SSH config, les alias Host et ProxyJump.
- Fournit une API HTTP OpenAPI et un endpoint MCP Streamable HTTP.
- Limite le nombre de lignes et la durée des requêtes ; les écritures nécessitent une autorisation explicite.

## Fonctionnement

```mermaid
flowchart LR
  ExternalApp["Applications externes<br/>Agents, plateformes IA, outils internes"]
  SQLTunnel["SQLTunnel<br/>Contrôle d'accès et gestion des connexions"]
  Database[("Base de données privée<br/>MySQL ou PostgreSQL")]

  ExternalApp -->|"API HTTP ou MCP"| SQLTunnel
  SQLTunnel -->|"Tunnel SSH ou connexion directe"| Database
```

`gateway.yaml` contient trois types de configuration :

- `dbServers` : informations de connexion aux bases de données.
- `sshServers` : connexions SSH réutilisables.
- `clients` : appelants externes et leurs autorisations d'accès.

Les mots de passe des bases de données et les clés privées SSH restent sur le serveur SQLTunnel. Chaque appelant externe n'a besoin que de sa propre clé API.

## Démarrage rapide

### Exécution directe

```bash
git clone https://github.com/NemoAlex/SQLTunnel.git
cd SQLTunnel
cp config/gateway.example.yaml config/gateway.yaml
npm install
npm run build
npm run start
```

Le service écoute par défaut sur `0.0.0.0:3000`. Utilisez des variables d'environnement pour modifier cette adresse :

```bash
FASTIFY_HOST=127.0.0.1 FASTIFY_PORT=3001 npm run start
```

### Utiliser l'image Docker

Utilisez l'image SQLTunnel publiée avec Docker Compose :

```yaml
services:
  sqltunnel:
    image: nemoalex/sqltunnel:1.0.2
    container_name: sqltunnel
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
```

```bash
cp config/gateway.example.yaml config/gateway.yaml
docker compose up -d
```

### Construire l'image Docker localement

Le fichier `compose.yaml` du dépôt construit SQLTunnel à partir du code source local et démarre le service :

```bash
docker compose up --build
```

## Configuration

SQLTunnel lit `config/gateway.yaml` par défaut. Commencez par copier `config/gateway.example.yaml`, puis configurez les sections suivantes :

- `defaults` : limites globales facultatives pour le nombre de lignes renvoyées, les délais de requête et de connexion, et la durée du cache de Schema.
- `sshServers` : connexions SSH réutilisables facultatives, référencées par identifiant lorsqu'une connexion directe à la base de données n'est pas disponible.
- `dbServers` : informations de connexion MySQL ou PostgreSQL, routage SSH facultatif et limites propres au serveur.
- `clients` : clés API, autorisations d'accès aux bases de données, droits `read` ou `write` et limites facultatives propres au client.

Consultez la **[référence de configuration](../configuration.md)** pour le schema YAML complet, la description des champs, les valeurs par défaut, la prise en charge de SSH config, des exemples ProxyJump et le fonctionnement des autorisations.

La structure de répertoires recommandée est la suivante :

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # Facultatif
    config             # Facultatif : alias SSH Host, utilisateurs, ports, ProxyJump et autres informations de connexion
    id_rsa             # Facultatif : clé privée requise pour l'authentification SSH par clé
```

Définissez `SQLTUNNEL_CONFIG=/path/to/gateway.yaml` pour charger un fichier de configuration situé ailleurs. Les valeurs relatives de `sshConfigPath` et `privateKeyPath` sont résolues depuis le répertoire contenant `gateway.yaml`. La structure ci-dessus convient donc à une exécution locale comme à un déploiement Docker où le répertoire `config` complet est monté dans `/app/config`.

`gateway.yaml` contient les mots de passe des bases de données, les clés API des clients et éventuellement des identifiants SSH. Ne l'ajoutez pas au contrôle de version, limitez ses droits d'accès et n'accordez à chaque client que les bases de données et les droits `read` ou `write` nécessaires.

## OpenAPI

Le document OpenAPI est disponible sur `GET /openapi.json`. Les endpoints métier sont :

- `POST /schema` : lister les bases de données ou les tables, ou lire la structure d'une table.
- `POST /query` : exécuter une instruction SQL autorisée et limitée.

Les requêtes utilisent `Authorization: Bearer <SQLTUNNEL_API_KEY>`. Consultez la [référence API](../api.md) pour les formats complets.

## MCP

L'endpoint MCP Streamable HTTP est disponible sur `POST /mcp` et fournit les outils suivants :

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

MCP utilise les mêmes clés API, autorisations de base de données, limites de lignes et délais qu'OpenAPI. Utilisez un client et un compte de base de données en lecture seule pour les agents, et exposez `/mcp` via HTTPS pour les déploiements distants.

Guides de configuration :

- [Dify](../dify.md)
- [Claude Code](../claude-code.md)
- [Codex](../codex.md)
- [Hermes](../hermes.md)

## Références

- [Référence de configuration](../configuration.md)
- [Référence API](../api.md)
