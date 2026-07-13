# Référence de configuration SQLTunnel

[Retour à la README](README.md) | [Référence de l'API](api.md) | [Guide de configuration Dify](dify.md)

## Configuration

Le service sans interface utilise `gateway.yaml` pour la configuration de la passerelle.

La configuration comporte trois sections principales :

- `sshServers` : entrées de tunnel SSH réutilisables, avec prise en charge de `~/.ssh/config` et `ProxyJump`.
- `dbServers` : serveurs de base de données, y compris le type de base de données, l'adresse, les identifiants et l'accès SSH optionnel.
- `clients` : clients API, leurs clés API et les serveurs de base de données auxquels chaque client peut accéder.

Valeurs par défaut globales facultatives :

- `defaults.maxRows` : Nombre maximum de lignes par défaut. Par défaut : `1000`.
- `defaults.queryTimeoutMs` : Délai d'expiration par défaut des requêtes de base de données. Par défaut : `10000`.
- `defaults.connectTimeoutMs` : Délai d'expiration par défaut du tunnel SSH et de la connexion à la base de données. Par défaut : `10000`.
- `defaults.schemaCacheTtlMs` : TTL du cache des métadonnées du schéma de base de données en mémoire. Par défaut : `300000` (5 minutes). Mettez à `0` pour désactiver la mise en cache.

### Fichier de configuration et chemins

Structure recommandée :

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # Optionnel
    config             # Alias Host, utilisateurs, ports, ProxyJump et paramètres associés de SSH
    id_rsa             # Clé privée utilisée pour l'authentification par clé
```

Le fichier par défaut est `config/gateway.yaml`. Définissez `SQLTUNNEL_CONFIG=/path/to/gateway.yaml` pour le charger depuis un autre emplacement.

Les valeurs relatives de `sshConfigPath` et `privateKeyPath` sont résolues à partir du répertoire contenant `gateway.yaml`. Cela permet de monter directement l'ensemble du répertoire `config` sous `/app/config` dans Docker.

`gateway.yaml` peut contenir des mots de passe de base de données, des clés API client, des mots de passe SSH et des chemins de clés privées. Ne validez jamais une configuration réelle dans le contrôle de version. Restreignez les permissions de fichier et accordez à chaque client uniquement les bases de données et l'accès `read` ou `write` dont il a besoin.

### Serveurs SSH

`sshServers` définissent des entrées de tunnel SSH réutilisables. Un serveur de base de données fait référence à l'un d'eux avec `sshServerId`.

```yaml
sshServers:
  - id: bastion-prod
    sshConfigPath: ssh/config
    host: db-prod
    port: 22
    username: deploy
    password: optional-password
    privateKeyPath: ssh/id_rsa
    passphrase: optional-key-passphrase
    idleTimeoutMs: 60000
```

Champs :

- `id` : Obligatoire. Identifiant du serveur SSH utilisé par `dbServers[].sshServerId`.
- `host` : Obligatoire. Hôte SSH réel ou alias Host de la config SSH.
- `sshConfigPath` : Facultatif. Chemin de la config SSH. Les chemins relatifs sont résolus à partir du répertoire contenant `gateway.yaml`. S'il est omis, SQLTunnel lit la `~/.ssh/config` de l'utilisateur d'exécution.
- `port` : Facultatif. Port SSH. Par défaut : `22`.
- `username` : Facultatif. Nom d'utilisateur SSH. Par défaut : l'utilisateur d'exécution actuel.
- `password` : Facultatif. Mot de passe SSH pour l'authentification par mot de passe.
- `privateKeyPath` : Facultatif. Chemin de la clé privée. Les chemins relatifs sont résolus à partir du répertoire contenant `gateway.yaml`. S'il est omis, SQLTunnel peut utiliser le `IdentityFile` de la config SSH ou les clés privées par défaut courantes de l'utilisateur d'exécution.
- `passphrase` : Facultatif. Passphrase pour une clé privée chiffrée.
- `idleTimeoutMs` : Facultatif. Durée de maintien d'une connexion SSH inactive. Par défaut : `60000`.
- `proxyJumps` : Facultatif. Chaîne ProxyJump. Dans la plupart des cas, placez ProxyJump dans la config SSH et SQLTunnel le lira à partir de là.

Champs de config SSH pris en charge :

- `Host`
- `HostName`
- `User`
- `Port`
- `IdentityFile`
- `ProxyJump`

SQLTunnel implémente uniquement les champs de config SSH listés ci-dessus. Les autres options OpenSSH sont ignorées, notamment :

- `ProxyCommand`
- `Include`
- `HostKeyAlias`
- `LocalForward`
- `RemoteForward`
- `DynamicForward`

Lorsque `host` est un alias Host, SQLTunnel peut compléter l'hôte réel, l'utilisateur, le port, la clé privée et ProxyJump à partir de la config SSH.

Exemple de config SSH adaptée à Docker :

```yaml
sshServers:
  - id: db-prod
    sshConfigPath: ssh/config
    host: db-prod
```

Config SSH correspondante :

```sshconfig
Host bastion-prod
  HostName bastion.example.com
  User deploy
  Port 22
  IdentityFile ~/.ssh/id_rsa

Host db-prod
  HostName 10.0.8.12
  User deploy
  ProxyJump bastion-prod
```

SQLTunnel réutilise les connexions SSH par identifiant de serveur SSH. Chaque requête ouvre un nouveau canal de transfert. Les connexions SSH inactives sont fermées après `idleTimeoutMs`.

Les exécutions locales utilisent `SSH_AUTH_SOCK` lorsqu'un ssh-agent est disponible. Dans Docker, montez vous-même le socket de l'agent si vous souhaitez utiliser ssh-agent ; sinon configurez une clé privée lisible à l'intérieur du conteneur.

### Serveurs de base de données

`dbServers` définissent les bases de données auxquelles SQLTunnel peut accéder. Les clients reçoivent l'accès par identifiant de serveur de base de données.

```yaml
dbServers:
  - id: reporting-mysql
    description: Base analytique e-commerce avec ventes quotidiennes, performances produit et indicateurs de conversion
    type: mysql
    sshServerId: bastion-prod
    maxRows: 1000
    queryTimeoutMs: 10000
    connectTimeoutMs: 10000
    database:
      host: 127.0.0.1
      port: 3306
      user: app
      password: mysql-password
      database: app
```

Champs :

- `id` : Obligatoire. Identifiant du serveur de base de données utilisé par `clients[].dbServers[].serverId` et la requête `dbServerId`.
- `description` : Facultatif. Décrit l'objectif et les données principales de la base de données. Renvoyé aux clients par `list_db_servers` et l'opération `list_databases` de `POST /schema`.
- `type` : Obligatoire. Type de base de données : `mysql` ou `postgres`.
- `sshServerId` : Facultatif. Référence `sshServers[].id`. S'il est omis, SQLTunnel se connecte directement à la base de données.
- `maxRows` : Facultatif. Nombre maximum de lignes par défaut pour ce serveur de base de données. S'il est omis, `defaults.maxRows` est utilisé.
- `queryTimeoutMs` : Facultatif. Délai d'expiration par défaut des requêtes pour ce serveur de base de données. S'il est omis, `defaults.queryTimeoutMs` est utilisé.
- `connectTimeoutMs` : Facultatif. Délai d'expiration du tunnel SSH et de la connexion à la base de données pour ce serveur. S'il est omis, `defaults.connectTimeoutMs` est utilisé. Par défaut : `10000`.
- `database.host` : Obligatoire. Hôte de la base de données. Lors de l'utilisation d'un tunnel SSH, cette adresse est résolue côté serveur SSH.
- `database.port` : Obligatoire. Port de la base de données.
- `database.user` : Obligatoire. Nom d'utilisateur de la base de données.
- `database.password` : Obligatoire. Mot de passe de la base de données, stocké directement dans le fichier de configuration.
- `database.database` : Obligatoire. Nom de la base de données.

### Clients

`clients` définissent les applications externes pouvant appeler SQLTunnel et les serveurs de base de données auxquels elles peuvent accéder.

```yaml
clients:
  - id: analytics-app
    apiKey: dev-read-key
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
      - serverId: reporting-mysql
```

Champs :

- `id` : Obligatoire. Identifiant du client utilisé pour identifier l'appelant.
- `apiKey` : Obligatoire. Clé API envoyée par l'appelant en tant que token `Authorization: Bearer <SQLTUNNEL_API_KEY>`.
- `dbServers` : Obligatoire. Liste des serveurs de base de données auxquels ce client peut accéder.
- `dbServers[].serverId` : Obligatoire. Référence `dbServers[].id`.
- `dbServers[].permission` : Facultatif. Autorisation : `read` ou `write`. Par défaut : `read`. `read` autorise le SQL en lecture seule ; `write` autorise le SQL en lecture et en écriture.
- `dbServers[].maxRows` : Facultatif. Nombre maximum de lignes pour ce client sur ce serveur de base de données. S'il est omis, les valeurs par défaut du serveur ou globales sont utilisées.
- `dbServers[].queryTimeoutMs` : Facultatif. Délai d'expiration des requêtes pour ce client sur ce serveur de base de données. S'il est omis, les valeurs par défaut du serveur ou globales sont utilisées.
