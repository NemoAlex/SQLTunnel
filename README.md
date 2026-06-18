# SQLTunnel

[![Docker Pulls](https://img.shields.io/docker/pulls/nemoalex/sqltunnel?logo=docker&label=Docker%20Pulls)](https://hub.docker.com/r/nemoalex/sqltunnel)
[![Docker Image Version](https://img.shields.io/docker/v/nemoalex/sqltunnel?logo=docker&label=Docker%20Image)](https://hub.docker.com/r/nemoalex/sqltunnel/tags)

[Chinese](README.zh-CN.md)

SQLTunnel is a database access gateway for external applications that need to query databases reachable only from private networks.

It is designed for cases where databases live behind a firewall, inside a VPC, or behind a bastion host, while tools such as Dify, AI agents, automation platforms, or internal apps need controlled query access. SQLTunnel is often deployed next to the external application and reaches the private database through an SSH tunnel. It can also be deployed inside the private network and connect to the database directly. In either setup, the database port does not need to be exposed to the external application.

SQLTunnel is especially useful for giving AI tools database query access:

- Identify callers with API keys.
- Authorize each client for specific db servers only.
- Configure read or write permission per client and per db server.
- Reach private databases through SSH tunnels.
- Read SSH config, including Host aliases and ProxyJump.
- Enforce query row limits and timeouts.
- Default to read-oriented access; writes require explicit permission.

## How It Works

Typical request path:

```mermaid
flowchart LR
  ExternalApp["External app<br/>Dify, AI Agent, internal apps"]
  SQLTunnel["SQLTunnel<br/>keeps database passwords and SSH private keys"]
  Database[("Private database<br/>MySQL or PostgreSQL")]
  Padding[" "]

  ExternalApp -->|"HTTP API /query"| SQLTunnel
  SQLTunnel -->|"SSH tunnel or direct connection"| Database
  Database ~~~ Padding

  style Padding fill:transparent,stroke:transparent
  linkStyle 2 stroke:transparent
```

The configuration file defines three main objects:

- `dbServers`: databases that SQLTunnel can access.
- `sshServers`: reusable SSH tunnel entries, optionally backed by SSH config.
- `clients`: external callers and the db servers they are allowed to use.

External applications do not see database passwords or SSH private keys. They only receive their own API key and the db server ids they are allowed to query.

SQLTunnel does not generate SQL and does not replace database auditing. Its role is to forward authorized query requests to the correct db server and enforce basic access controls.

## Quick Start

### Run Directly

```bash
git clone https://github.com/NemoAlex/SQLTunnel.git
cd SQLTunnel
cp config/gateway.example.yaml config/gateway.yaml
npm install
npm run build
npm run start
```

The service listens on `0.0.0.0:3000` by default. Override host and port with environment variables:

```bash
FASTIFY_HOST=127.0.0.1 FASTIFY_PORT=3001 npm run start
```

### Docker Compose

SQLTunnel is published on Docker Hub as `nemoalex/sqltunnel`:

```bash
docker pull nemoalex/sqltunnel:1.0.0
```

Create a Compose file that uses the Docker Hub image:

```yaml
services:
  sqltunnel:
    image: nemoalex/sqltunnel:1.0.0
    container_name: sqltunnel
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
```

Then start it:

```bash
cp config/gateway.example.yaml config/gateway.yaml
docker compose up -d
```

The repository's `compose.yaml` is intended for local development and builds `sqltunnel:local` from the local `Dockerfile`:

```bash
docker compose up --build
```

### Config Directory

Recommended structure:

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # Optional.
    config             # Optional. SSH Host aliases, users, ports, ProxyJump, and other login details.
    id_rsa             # Optional. Private key, only needed when you use key-based SSH login.
```

Recommended setup:

- Copy `config/gateway.example.yaml` to `config/gateway.yaml` and edit it for your environment.
- Use `config/ssh/` only when you want SQLTunnel to load SSH files from the mounted config directory.
- Put private keys such as `id_rsa` under `config/ssh/` only when the SSH server requires key-based login.
- Put an SSH config file under `config/ssh/config` when you want to describe SSH login details with Host aliases, ports, users, IdentityFile, or ProxyJump.
- Reference SSH files with paths relative to `gateway.yaml`, for example `sshConfigPath: ssh/config` and `privateKeyPath: ssh/id_rsa`.
- Mount the whole `config` directory into the container as `/app/config`; the default config path becomes `/app/config/gateway.yaml`.
- Keep API keys, database passwords, and SSH private keys in `config/gateway.yaml` or files under `config/ssh/`; external callers only need their own API key.

## Reference

- [Configuration reference](docs/configuration.md)
- [API reference](docs/api.md)
- [Dify setup guide](docs/dify.md)
