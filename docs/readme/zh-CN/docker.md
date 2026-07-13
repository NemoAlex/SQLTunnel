# 使用 Docker 部署 SQLTunnel

SQLTunnel 的无界面服务版发布在 [Docker Hub](https://hub.docker.com/r/nemoalex/sqltunnel)，适合在服务器或 NAS 上长期运行。

## 准备配置

在部署目录中新建 `compose.yaml`：

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

端口映射中，前一个 `3000` 是对外访问的宿主机端口，后一个 `3000` 是容器内部端口。

配置目录结构如下：

```text
config/
├── gateway.yaml       # SQLTunnel 主配置文件
└── ssh/               # 可选：通过 SSH 隧道连接数据库时使用
    ├── config          # 可选：SSH Config、Host Alias 和 ProxyJump 配置
    └── id_rsa          # 可选：SSH 私钥
```

`ssh/` 目录及其中的文件不是必需的。直接连接数据库，或者不需要自定义 SSH Config 和私钥时，可以只保留 `gateway.yaml`。

下载配置模板：

```bash
mkdir config
curl -fsSL https://raw.githubusercontent.com/NemoAlex/SQLTunnel/main/config/gateway.example.yaml \
  -o config/gateway.yaml
```

按照实际环境修改 `config/gateway.yaml`。数据库连接、SSH 隧道和客户端权限的完整字段说明见[配置参考](configuration.md)。

## 启动服务

拉取镜像并启动：

```bash
docker compose up -d
```

确认服务已经正常运行：

```bash
docker compose ps
docker compose logs -f sqltunnel
curl http://127.0.0.1:3000/health
```

## 容器环境注意事项

- `gateway.yaml` 中的 `127.0.0.1` 指向 SQLTunnel 容器自身，不是宿主机。
- SSH Config 和私钥可以放在 `config/ssh/` 下，并在 `gateway.yaml` 中使用相对路径。整个 `config` 目录会以只读方式挂载到容器的 `/app/config`。
- `gateway.yaml` 包含数据库密码和客户端 API Key，请勿提交到版本控制，并限制文件的读取权限。
- 对外提供服务时，建议通过反向代理配置 HTTPS，不要直接将数据库端口暴露到公网。
