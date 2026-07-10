# SQLTunnel Configuration Reference

[Back to README](../README.md) | [API reference](api.md) | [Dify setup guide](dify.md)

## Configuration

SQLTunnel reads `config/gateway.yaml` by default. You can override it with `SQLTUNNEL_CONFIG=/path/to/gateway.yaml`.

The configuration has three main sections:

- `sshServers`: reusable SSH tunnel entries, with support for `~/.ssh/config` and `ProxyJump`.
- `dbServers`: database servers, including database type, address, credentials, and optional SSH access.
- `clients`: API clients, their API keys, and the db servers each client may access.

Optional global defaults:

- `defaults.maxRows`: Default max rows. Default: `1000`.
- `defaults.queryTimeoutMs`: Default database query timeout. Default: `10000`.
- `defaults.connectTimeoutMs`: Default SSH tunnel and database connection timeout. Default: `10000`.
- `defaults.schemaCacheTtlMs`: In-memory database schema metadata cache TTL. Default: `300000` (5 minutes). Set to `0` to disable caching.

### SSH Servers

`sshServers` define reusable SSH tunnel entries. A db server references one with `sshServerId`.

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

Fields:

- `id`: Required. SSH server id used by `dbServers[].sshServerId`.
- `host`: Required. Real SSH host or a Host alias from SSH config.
- `sshConfigPath`: Optional. SSH config path. Relative paths are resolved from the directory containing `gateway.yaml`. If omitted, SQLTunnel reads the runtime user's `~/.ssh/config`.
- `port`: Optional. SSH port. Default: `22`.
- `username`: Optional. SSH username. Default: current runtime user.
- `password`: Optional. SSH password for password authentication.
- `privateKeyPath`: Optional. Private key path. Relative paths are resolved from the directory containing `gateway.yaml`. If omitted, SQLTunnel may use SSH config `IdentityFile` or common default private keys from the runtime user.
- `passphrase`: Optional. Passphrase for an encrypted private key.
- `idleTimeoutMs`: Optional. How long to keep an idle SSH connection open. Default: `60000`.
- `proxyJumps`: Optional. ProxyJump chain. In most cases, put ProxyJump in SSH config and SQLTunnel will read it from there.

Supported SSH config fields:

- `Host`
- `HostName`
- `User`
- `Port`
- `IdentityFile`
- `ProxyJump`

SQLTunnel only implements the SSH config fields listed above. Other OpenSSH options are ignored, including:

- `ProxyCommand`
- `Include`
- `HostKeyAlias`
- `LocalForward`
- `RemoteForward`
- `DynamicForward`

When `host` is a Host alias, SQLTunnel can fill in the real host, user, port, private key, and ProxyJump from SSH config.

Docker-friendly SSH config example:

```yaml
sshServers:
  - id: db-prod
    sshConfigPath: ssh/config
    host: db-prod
```

Matching SSH config:

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

SQLTunnel reuses SSH connections by SSH server id. Each query opens a new forwarding channel. Idle SSH connections are closed after `idleTimeoutMs`.

Local runs use `SSH_AUTH_SOCK` when an ssh-agent is available. In Docker, mount the agent socket yourself if you want to use ssh-agent; otherwise configure a private key readable inside the container.

### DB Servers

`dbServers` define databases that SQLTunnel can access. Clients receive access by db server id.

```yaml
dbServers:
  - id: reporting-mysql
    description: E-commerce analytics database containing daily sales, product performance, and conversion funnel metrics
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

Fields:

- `id`: Required. Db server id used by `clients[].dbServers[].serverId` and query request `dbServerId`.
- `description`: Optional. Describes the database's purpose and main data. It is returned to clients by `list_db_servers` and the `list_databases` operation of `POST /schema`.
- `type`: Required. Database type: `mysql` or `postgres`.
- `sshServerId`: Optional. References `sshServers[].id`. If omitted, SQLTunnel connects directly to the database.
- `maxRows`: Optional. Default max rows for this db server. If omitted, `defaults.maxRows` is used.
- `queryTimeoutMs`: Optional. Default database query timeout for this db server. If omitted, `defaults.queryTimeoutMs` is used.
- `connectTimeoutMs`: Optional. SSH tunnel and database connection timeout for this db server. If omitted, `defaults.connectTimeoutMs` is used. Default: `10000`.
- `database.host`: Required. Database host. When using an SSH tunnel, this address is resolved from the SSH server side.
- `database.port`: Required. Database port.
- `database.user`: Required. Database username.
- `database.password`: Required. Database password, stored directly in the config file.
- `database.database`: Required. Database name.

### Clients

`clients` define external applications that can call SQLTunnel and the db servers they may access.

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

Fields:

- `id`: Required. Client id used to identify the caller.
- `apiKey`: Required. API key sent by the caller as an `Authorization: Bearer <SQLTUNNEL_API_KEY>` token.
- `dbServers`: Required. List of db servers this client can access.
- `dbServers[].serverId`: Required. References `dbServers[].id`.
- `dbServers[].permission`: Optional. Permission: `read` or `write`. Defaults to `read`. `read` allows read-only SQL; `write` allows both read and write SQL.
- `dbServers[].maxRows`: Optional. Max rows for this client on this db server. If omitted, db server or global defaults are used.
- `dbServers[].queryTimeoutMs`: Optional. Query timeout for this client on this db server. If omitted, db server or global defaults are used.
