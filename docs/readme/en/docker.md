# Deploy SQLTunnel with Docker

The headless SQLTunnel service is published on [Docker Hub](https://hub.docker.com/r/nemoalex/sqltunnel) for long-running deployments on servers and NAS devices.

## Prepare the configuration

Create a `compose.yaml` file in the deployment directory:

```yaml
services:
  sqltunnel:
    image: nemoalex/sqltunnel:latest
    container_name: sqltunnel
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
```

In the port mapping, the first `3000` is the externally accessible host port and the second is the container port.

Use this configuration directory layout:

```text
config/
├── gateway.yaml       # Main SQLTunnel configuration
└── ssh/               # Optional: used for SSH tunnel connections
    ├── config          # Optional: SSH Config, Host aliases, and ProxyJump
    └── id_rsa          # Optional: SSH private key
```

The `ssh/` directory is optional. Direct database connections only require `gateway.yaml`.

Download the configuration template:

```bash
mkdir config
curl -fsSL https://raw.githubusercontent.com/NemoAlex/SQLTunnel/main/config/gateway.example.yaml \
  -o config/gateway.yaml
```

Edit `config/gateway.yaml` for your environment. See the [configuration reference](configuration.md) for database connections, SSH tunnels, and client permissions.

## Start the service

```bash
docker compose up -d
```

Verify that the service is running:

```bash
docker compose ps
docker compose logs -f sqltunnel
curl http://127.0.0.1:3000/health
```

## Container notes

- `127.0.0.1` in `gateway.yaml` refers to the SQLTunnel container, not the host.
- Put SSH Config and private keys under `config/ssh/`, then reference them with relative paths in `gateway.yaml`. The complete `config` directory is mounted read-only at `/app/config`.
- `gateway.yaml` contains database passwords and client API keys. Do not commit it to version control, and restrict its read permissions.
- When exposing the service remotely, use a reverse proxy with HTTPS. Do not expose database ports to the public internet.
