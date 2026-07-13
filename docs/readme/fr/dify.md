# Configuration de Dify

## Serveur MCP

Ouvrez la page de gestion des outils dans l'espace de travail Dify et ajoutez un serveur MCP HTTP. Les libellés de menu peuvent légèrement varier selon la version de Dify.

```text
Nom : SQLTunnel
Identifiant du serveur : sqltunnel
URL du point de terminaison : http://sqltunnel:3000/mcp

Authentification
Enregistrement dynamique du client : Désactivé
ID client : Laisser vide
Secret client : Laisser vide

En-têtes
Nom : Authorization
Valeur : Bearer replace-with-a-random-secret
```

Utilisez une URL accessible depuis Dify. Par exemple :

- Dify et SQLTunnel sur le même réseau Docker : `http://sqltunnel:3000/mcp`
- Dify dans Docker et SQLTunnel sur l'hôte : `http://host.docker.internal:3000/mcp`
- Dify Cloud ou un déploiement distant : `https://sqltunnel.example.com/mcp`

Après la connexion, activez les quatre outils SQLTunnel dans une application Agent.

## Utilisation

Ajoutez ceci aux instructions de l'Agent :

```text
Vous pouvez utiliser SQLTunnel pour interroger des bases de données. Examinez les bases de données, les tables et les schémas de tables pertinents avant de générer du SQL. Ne devinez pas les noms de schémas ou de colonnes.
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

## Workflow et Chatflow

Utilisez un nœud Agent lorsque le modèle doit sélectionner des tables et générer du SQL. Pour du SQL fixe, appelez `query_database` depuis un nœud outil :

```json
{
  "dbServerId": "prod-postgres",
  "sql": "select id, status from orders where id = $1",
  "params": [123],
  "maxRows": 10
}
```

Les placeholders PostgreSQL utilisent `$1`, `$2` ; MySQL utilise `?`.
