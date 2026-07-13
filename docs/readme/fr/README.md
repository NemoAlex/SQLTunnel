<p align="center">
  <img src="../../../assets/icon-1024-macos.png" alt="Icône de l’application SQLTunnel" width="128" />
</p>

<h1 align="center">SQLTunnel</h1>

<p align="center"><strong>Une passerelle de base de données à accès contrôlé pour les agents, les plateformes d’automatisation et les applications internes</strong></p>

<p align="center">
  <a href="https://hub.docker.com/r/nemoalex/sqltunnel"><img src="https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls" alt="Docker Pulls" /></a>
  <a href="https://hub.docker.com/r/nemoalex/sqltunnel/tags"><img src="https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image" alt="Docker Image Version" /></a>
</p>

<p align="center">
  <a href="../en/README.md">English</a> |
  <a href="../zh-CN/README.md">中文</a> |
  <a href="../ja/README.md">日本語</a> |
  <a href="../ko/README.md">한국어</a> |
  <a href="README.md">Français</a> |
  <a href="../de/README.md">Deutsch</a>
</p>

SQLTunnel permet à Codex, Claude Code, Hermes, Dify et aux applications internes d’accéder à MySQL et PostgreSQL avec des autorisations contrôlées, sans exposer directement les ports des bases de données.

## Fonctionnalités principales

- Prend en charge MySQL et PostgreSQL, en connexion directe ou via un tunnel SSH.
- Identifie les appelants avec des clés API et configure les droits de lecture/écriture par client et base de données.
- Prend en charge SSH Config, les alias Host et ProxyJump.
- Fournit une API HTTP OpenAPI et un point de terminaison MCP Streamable HTTP.
- Limite le nombre de lignes et la durée des requêtes ; les écritures nécessitent une autorisation explicite.

## Version de bureau

La version de bureau prend en charge macOS et Windows et rassemble la configuration, l’exécution et la surveillance de SQLTunnel dans une interface graphique.

<p align="center">
  <img src="sqltunnel-desktop-fr.png" alt="Version de bureau de SQLTunnel en cours d’exécution en français" width="512" />
</p>

## Service sans interface

La version sans interface utilise le même cœur de passerelle et convient à Docker, aux serveurs et aux déploiements en arrière-plan. Elle gère les bases de données, les tunnels SSH et les autorisations client via `gateway.yaml`, et expose les mêmes interfaces MCP/OpenAPI que la version de bureau.

- [Déploiement Docker](docker.md)
- [Référence de configuration](configuration.md)

## Fonctionnement

```mermaid
flowchart LR
  ExternalApp["Agents, plateformes IA, applications internes"]
  SQLTunnel["SQLTunnel<br/>Authentification, autorisations, gestion des connexions"]
  Database[("MySQL / PostgreSQL")]

  ExternalApp -->|"MCP ou OpenAPI"| SQLTunnel
  SQLTunnel -->|"Tunnel SSH ou connexion directe"| Database
```

SQLTunnel identifie les appelants avec des clés API Bearer, contrôle les droits de lecture/écriture par client et base de données, et applique des limites de lignes, de requêtes et de connexions. Les mots de passe des bases de données et les clés privées SSH ne sont jamais exposés aux appelants.

## Documentation

- [Déploiement Docker](docker.md)
- [Référence de configuration](configuration.md)
- [Référence API](api.md)
- [Dify](dify.md)
- [Claude Code](claude-code.md)
- [Codex](codex.md)
- [Hermes](hermes.md)
