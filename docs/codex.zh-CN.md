# 在 Codex 中使用 SQLTunnel MCP

[返回 README](../README.zh-CN.md) | [MCP 工具说明](../README.zh-CN.md#mcp-接口) | [配置参考](configuration.zh-CN.md)

Codex CLI、IDE 扩展和 ChatGPT 桌面应用中的本地 Codex host 支持 Streamable HTTP MCP，并共享 Codex MCP 配置。本指南通过环境变量提供 SQLTunnel Bearer Token。

## 前置条件

- SQLTunnel MCP URL 可从 Codex 所在环境访问。
- `gateway.yaml` 中已为 Codex 创建独立 client。
- 已安装并登录 Codex。

推荐使用只读 client：

```yaml
clients:
  - id: codex
    apiKey: replace-with-a-random-secret
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
```

## 配置 API key

SQLTunnel 使用 `Authorization: Bearer <SQLTUNNEL_API_KEY>` 鉴权。Codex 可以从环境变量读取 Token，无需把它写入配置文件。

先在启动 Codex 的环境中设置：

```bash
export SQLTUNNEL_API_KEY="replace-with-a-random-secret"
```

## 在 Codex 桌面端添加

1. 打开 **Settings**。
2. 在 **Integrations** 下选择 **Plugins**。
3. 打开 **MCPs** 页签，选择 **Connect a custom MCP**。
4. 名称填写 `SQLTunnel`。
5. 类型选择 **Streamable HTTP**。
6. URL 填写 `http://127.0.0.1:3000/mcp`，或者 Codex 能访问的 HTTPS 地址。
7. Bearer Token 环境变量填写 `SQLTUNNEL_API_KEY`。
8. 保存服务并重启 Codex。

这里填写的是环境变量名，不是 API key 的实际值。Codex 最终发送：

```http
Authorization: Bearer <SQLTUNNEL_API_KEY>
```

桌面端必须能从启动环境继承 `SQLTUNNEL_API_KEY`。如果无法继承，可以在 `~/.codex/config.toml` 中使用静态 Header：

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
http_headers = { Authorization = "Bearer replace-with-a-random-secret" }
```

该方式会以明文保存 API key。请限制 `~/.codex/config.toml` 的访问权限，并尽量优先使用环境变量。

## 使用 CLI 添加

```bash
codex mcp add sqltunnel \
  --url "http://127.0.0.1:3000/mcp" \
  --bearer-token-env-var SQLTUNNEL_API_KEY
```

该命令会写入用户级 MCP 配置。需要设置工具审批和超时时间时，再编辑 `~/.codex/config.toml`。

## 全局配置

编辑 `~/.codex/config.toml`：

```toml
[mcp_servers.sqltunnel]
url = "http://127.0.0.1:3000/mcp"
bearer_token_env_var = "SQLTUNNEL_API_KEY"
enabled_tools = ["list_db_servers", "list_database_tables", "get_table_schema", "query_database"]
default_tools_approval_mode = "writes"
startup_timeout_sec = 20
tool_timeout_sec = 60
enabled = true
```

`bearer_token_env_var` 的值是环境变量名称，不是 API key 本身。`writes` 会允许标记为只读的元数据工具正常运行，并在使用可能写入的 `query_database` 前请求确认。如果 Codex 由桌面图标启动，确保桌面进程能够读取 `SQLTUNNEL_API_KEY`。

## 项目级配置

也可以在可信项目中创建 `.codex/config.toml`：

```toml
[mcp_servers.sqltunnel]
url = "https://sqltunnel.example.com/mcp"
bearer_token_env_var = "SQLTUNNEL_API_KEY"
default_tools_approval_mode = "writes"
```

不要在项目配置中使用静态生产密钥。Codex 只会为受信任项目加载项目级配置。

## 验证

重新启动 Codex CLI、IDE 扩展或桌面应用，然后执行：

```bash
codex mcp list
codex mcp get sqltunnel
```

在 Codex 交互界面中输入：

```text
/mcp
```

应看到以下工具：

- `list_db_servers`
- `list_database_tables`
- `get_table_schema`
- `query_database`

## 推荐提示词

```text
使用 SQLTunnel 查看我可以访问的数据库。先获取表清单和相关表结构，再生成只读 SQL。不要猜测 schema 或字段名，最多返回 100 行。
```

预期调用顺序：

```text
list_db_servers
→ list_database_tables
→ get_table_schema
→ query_database
```

## 网络与运行环境

- 本机 Codex：`http://127.0.0.1:3000/mcp`
- 容器或远程开发环境：使用该环境能访问的服务名或 URL。
- 远程 SQLTunnel：使用 HTTPS，例如 `https://sqltunnel.example.com/mcp`。

本地 Codex 配置不会自动让远程任务访问本机 `localhost`。远程执行环境必须能访问 MCP URL，并拥有对应的环境变量。

## 常见问题

### MCP server failed to initialize

- 检查 Codex 进程是否能读取 `SQLTUNNEL_API_KEY`。
- 确认 URL 以 `/mcp` 结尾。
- 确认 SQLTunnel 使用当前包含 MCP 功能的版本。

### UNAUTHENTICATED

运行 `codex mcp get sqltunnel` 检查配置；`bearer_token_env_var` 必须是环境变量名 `SQLTUNNEL_API_KEY`。

### 工具没有出现

重新启动 Codex host，并使用 `/mcp` 查看服务器状态。CLI、IDE 扩展和桌面应用共享同一个 host 配置，但修改后需要重启对应客户端。

### 删除配置

```bash
codex mcp remove sqltunnel
```

## 安全建议

- 使用 `bearer_token_env_var`，不要把 Token 写入配置文件。
- 使用只读 SQLTunnel client 和数据库账号。
- 保留 `default_tools_approval_mode = "writes"`。
- 远程连接使用 HTTPS。

参考：[Codex MCP 官方文档](https://developers.openai.com/codex/mcp/)。
