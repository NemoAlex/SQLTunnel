# SQLTunnel 配置参考

[返回 README](../README.zh-CN.md) | [API 参考](api.zh-CN.md) | [Dify 配置指南](dify.zh-CN.md)

## 配置

网关默认读取 `config/gateway.yaml`。可通过 `SQLTUNNEL_CONFIG=/path/to/gateway.yaml` 覆盖。

配置里使用三个核心概念：

- `sshServers`：可复用的 SSH 隧道配置，支持 `~/.ssh/config` 和 `ProxyJump`。
- `dbServers`：真实数据库服务器，包含数据库类型、地址、账号密码、SSH 隧道等连接信息。
- `clients`：调用网关的客户端，包含 `apiKey`，并逐个声明它能访问哪些 `dbServers`。

可选全局默认值：

- `defaults.maxRows`：默认最大返回行数。默认值：`1000`。
- `defaults.queryTimeoutMs`：默认数据库查询超时时间。默认值：`10000`。
- `defaults.connectTimeoutMs`：默认 SSH tunnel 建立和数据库连接超时时间。默认值：`10000`。
- `defaults.schemaCacheTtlMs`：数据库 Schema 元数据的内存缓存时间。默认值：`300000`（5 分钟）；设为 `0` 可关闭缓存。

### SSH Servers

`sshServers` 定义可复用的 SSH 隧道入口。db server 通过 `sshServerId` 引用它。

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

字段说明：

- `id`：必填。SSH server id，供 `dbServers[].sshServerId` 引用。
- `host`：必填。真实 SSH host，或 SSH config 中的 Host alias。
- `sshConfigPath`：可选。SSH config 文件路径。相对路径基于 `gateway.yaml` 所在目录解析；未配置时读取运行用户的 `~/.ssh/config`。
- `port`：可选。SSH 端口，默认 `22`。
- `username`：可选。SSH 用户名，默认当前运行用户。
- `password`：可选。SSH 密码。适合密码登录；也可以和私钥方式二选一。
- `privateKeyPath`：可选。私钥路径。相对路径基于 `gateway.yaml` 所在目录解析；未配置时会尝试使用 SSH config `IdentityFile` 或运行用户的常见默认私钥。
- `passphrase`：可选。加密私钥的 passphrase。
- `idleTimeoutMs`：可选。没有活跃查询后多久关闭 SSH 连接，默认 `60000`。
- `proxyJumps`：可选。ProxyJump 链。通常建议写在 SSH config 中，SQLTunnel 会从 SSH config 的 `ProxyJump` 自动解析。

支持的 SSH config 字段：

- `Host`
- `HostName`
- `User`
- `Port`
- `IdentityFile`
- `ProxyJump`

SQLTunnel 只实现上面列出的 SSH config 字段。其他 OpenSSH 选项会被忽略，包括：

- `ProxyCommand`
- `Include`
- `HostKeyAlias`
- `LocalForward`
- `RemoteForward`
- `DynamicForward`

`host` 如果是 Host alias，会从 SSH config 补齐真实地址、用户、端口、私钥和 ProxyJump。

Docker 环境推荐把 SSH config 放到 `config/ssh/config`，然后在 `gateway.yaml` 中写：

```yaml
sshServers:
  - id: db-prod
    sshConfigPath: ssh/config
    host: db-prod
```

对应 SSH config 示例：

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

运行时会按 SSH server id 复用 SSH 链路；每次查询只打开新的转发 channel。闲置超过 `idleTimeoutMs` 后关闭链路。

本地运行时会使用 `SSH_AUTH_SOCK` 连接 ssh-agent。容器运行时如果也想使用 agent，需要额外挂载 agent socket；否则请在 YAML 或 SSH config 中配置容器可读取的私钥。

### DB Servers

`dbServers` 定义可以访问的数据库服务器。client 通过 db server id 获得访问授权。

```yaml
dbServers:
  - id: reporting-mysql
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

字段说明：

- `id`：必填。db server id，供 `clients[].dbServers[].serverId` 和查询请求中的 `dbServerId` 引用。
- `type`：必填。数据库类型，支持 `mysql` 或 `postgres`。
- `sshServerId`：可选。引用 `sshServers[].id`；未配置时直接连接数据库。
- `maxRows`：可选。该 db server 的默认最大返回行数；未配置时使用 `defaults.maxRows`。
- `queryTimeoutMs`：可选。该 db server 的默认数据库查询超时时间；未配置时使用 `defaults.queryTimeoutMs`。
- `connectTimeoutMs`：可选。该 db server 的 SSH tunnel 建立和数据库连接超时时间；未配置时使用 `defaults.connectTimeoutMs`。默认值：`10000`。
- `database.host`：必填。数据库主机。通过 SSH 隧道访问时，这是从 SSH server 侧可访问的地址。
- `database.port`：必填。数据库端口。
- `database.user`：必填。数据库用户名。
- `database.password`：必填。数据库密码，直接写在配置文件中。
- `database.database`：必填。数据库名。

### Clients

`clients` 定义可以调用 SQLTunnel 的外部应用，以及它们能访问哪些 db servers。

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

字段说明：

- `id`：必填。client id，用来标识调用方。
- `apiKey`：必填。调用方请求 SQLTunnel 时使用的 API key，通过 `Authorization: Bearer <SQLTUNNEL_API_KEY>` 发送。
- `dbServers`：必填。该 client 可以访问的 db server 列表。
- `dbServers[].serverId`：必填。引用 `dbServers[].id`。
- `dbServers[].permission`：可选。权限，支持 `read` 或 `write`，默认 `read`。`read` 只允许只读 SQL；`write` 允许读写 SQL。
- `dbServers[].maxRows`：可选。该 client 访问该 db server 时的最大返回行数；未配置时使用 db server 或全局默认值。
- `dbServers[].queryTimeoutMs`：可选。该 client 访问该 db server 时的查询超时时间；未配置时使用 db server 或全局默认值。
