# SQLTunnel Dify 配置指南

[返回 README](../README.zh-CN.md) | [配置参考](configuration.zh-CN.md) | [API 参考](api.zh-CN.md)

本文只说明 Dify 端如何配置和调用 SQLTunnel。SQLTunnel 侧只需要提前准备好：

- Dify 可访问的 SQLTunnel 地址，例如 `http://sqltunnel:3000`
- Dify 专用的 `apiKey`
- Dify 可访问的 `dbServerId`

SQLTunnel 的 API key 放在请求 header：`X-SQLTunnel-API-Key`。

参考 Dify 官方文档：

- [Dify Tools](https://docs.dify.ai/en/use-dify/workspace/tools)：Custom Tool 可通过 OpenAPI schema 导入外部 API。
- [Tool Node](https://docs.dify.ai/en/use-dify/nodes/tools)：Workflow / Chatflow 可以添加 Tool node 调用工具。
- [HTTP Request Node](https://docs.dify.ai/en/use-dify/nodes/http-request)：HTTP Request node 可配置 URL、headers、request body、认证和变量替换。

## 推荐接入方式

所有 Dify 流程都先把 SQLTunnel 的 OpenAPI 导入为 Custom Tool。导入后再根据应用形态选择：

如果希望模型在对话中按需查询数据库，优先使用：

```text
Agent 应用 + SQLTunnel Custom Tool
```

如果查询流程固定，例如“生成 SQL -> 审核 SQL -> 查询 -> 总结”，优先使用：

```text
Workflow / Tool node + SQLTunnel Custom Tool
```

HTTP Request node 只作为不方便使用 Custom Tool 时的备选方案。

## 前置步骤：导入 SQLTunnel Custom Tool

Dify 的 Custom Tool 支持通过 OpenAPI schema 导入外部 API，并自动生成工具接口。

### 1. 准备 OpenAPI

打开 SQLTunnel 的 OpenAPI：

```text
http://sqltunnel:3000/openapi.json
```

这个接口会自动在 OpenAPI 中加入 `servers`，地址来自 Dify 访问 SQLTunnel 时使用的 host。

如果 Dify 不能直接访问这个地址，也可以复制仓库里的：

```text
docs/openapi.json
```

仓库里的静态文件不会自动带 `servers`。如果复制静态文件导入 Dify，建议在导入前手动增加 `servers`，指向 Dify 能访问到的 SQLTunnel 地址：

```json
{
  "servers": [
    {
      "url": "http://sqltunnel:3000"
    }
  ]
}
```

注意：只新增 `servers`，不要删除原有 `paths`。

### 2. 创建 Custom Tool

在 Dify 中进入 Tools 页面，创建 Custom Tool，并导入 SQLTunnel 的 OpenAPI schema。

导入后建议有两个接口：

- `POST /db-servers`
- `POST /query`

### 3. 设置认证

SQLTunnel 使用自定义 API Key header，不使用 Bearer Token / Authorization header。

配置自定义 header：

```text
Header name: X-SQLTunnel-API-Key
Header value: dify-read-key
```

## 方式一：Agent 应用

Agent 应用适合让模型根据用户问题自主决定是否查询数据库。

### 1. 创建 Agent 应用

在 Dify Studio 中创建应用时选择 Agent 类型（选项可能会在“新手适用”里）。

### 2. 添加 SQLTunnel 工具

在 Agent 的 Tools 配置中添加刚导入的 SQLTunnel Custom Tool。

`dbServerId` 可以固定为某个业务库，也可以让 Agent 先调用 `/db-servers` 查看可用 db servers 后再选择。

### 3. Agent 提示词

下面这份可以直接放到 Agent 的 Instructions / System Prompt 中。把 `prod-postgres` 换成你的默认 `dbServerId`；如果希望 Agent 自己选择 db server，保留“需要时先调用 /db-servers”这一条。

```text
你是一个谨慎的数据库查询助手。你可以使用 SQLTunnel 工具查询数据库，并把查询结果解释给用户。

SQLTunnel 工具使用规则：
- 只有当用户的问题需要数据库数据时，才调用 SQLTunnel 工具。
- dbServerId 列表如下
  - XX: XX业务的数据库
- 如果不确定可用 db server，先调用 /db-servers 查看可访问的 db servers。
- 调用 /query 时 responseFormat 必须使用 json。
- 调用 /query 时 maxRows 默认不超过 100；除非用户明确要求更多，并且结果确实需要更多行。
- params 没有参数时传 [] 或省略。

SQL 生成规则：
- 默认只生成只读 SQL。
- 只允许 SELECT、WITH、SHOW、DESCRIBE、DESC、EXPLAIN。
- 不要生成 INSERT、UPDATE、DELETE、DROP、ALTER、TRUNCATE、CREATE、GRANT、REVOKE、MERGE、CALL 等写入或管理语句。
- 不要使用分号拼接多条 SQL。
- 不要查询无关表，不要扩大查询范围来“猜测”答案。
- 能过滤时先过滤，能聚合时先聚合，避免直接拉取大量明细。
- 如果用户问题缺少必要条件，先追问，不要盲目查询。

结果处理规则：
- 回答用户时基于查询结果，不要编造数据库中没有返回的信息。
- 如果查询结果为空，明确说明没有查到匹配数据。
- 如果结果很多，先总结关键结论，再给必要的样例行。
- 不要完整展示密码、token、密钥、身份证号、手机号、邮箱等敏感字段；如必须提及，只展示脱敏后的值。
- 不要向用户透露 SQLTunnel API key、请求 header、内部连接配置或数据库密码。

错误处理规则：
- 如果工具返回 UNAUTHENTICATED、FORBIDDEN、DB_SERVER_NOT_FOUND 或 INVALID_REQUEST，简要说明查询失败原因，并提示用户检查配置或权限。
- 如果工具返回 QUERY_FAILED，说明 SQL 执行失败；先根据错误修改 SQL 重试一次，如果仍失败，再把失败原因解释给用户。
- 不要为了绕过权限或只读限制而改写成危险 SQL。

输出风格：
- 用用户的语言回答。
- 优先给结论，再补充查询依据。
- 当答案依赖某次查询时，简短说明使用了哪个 dbServerId 和大致查询条件。
```
### 4. 知识库

复杂业务建议把表结构等内容写入知识库中，在Agent中引用。

## 方式二：Workflow / Tool node

Workflow / Chatflow 适合固定流程，例如“生成 SQL -> 审核 SQL -> 查询 -> 总结”。这种方式仍然使用前面导入的 SQLTunnel Custom Tool，只是由流程节点明确控制调用时机。

### 1. 添加 Tool node

在 Workflow / Chatflow 中添加 Tool node：

1. 点击 `Add Node`。
2. 选择 `Tools`。
3. 选择刚导入的 SQLTunnel 工具动作，例如 `/query`。
4. 填入参数，或把上游节点变量映射到参数。

Dify 官方文档说明 Tool node 可在 Workflow / Chatflow 中作为独立节点调用工具。

### 2. 配置 `/query` 参数

建议固定：

```json
{
  "dbServerId": "prod-postgres",
  "sql": "{{sql}}",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

其中 `sql` 通常来自上游 LLM / Code / Parameter Extractor 节点。

### 3. 处理 Tool node 返回

`responseFormat: "json"` 时，返回内容是：

```json
{
  "columns": ["id", "name"],
  "rows": [
    {
      "id": 1,
      "name": "Alice"
    }
  ],
  "rowCount": 1,
  "durationMs": 24,
  "dbServerId": "prod-postgres"
}
```

后续节点通常读取：

- `rows`
- `columns`
- `rowCount`
- `durationMs`

### 4. 推荐工作流结构

```text
User Input
  -> LLM 生成只读 SQL
  -> Code 或 LLM 节点审核 SQL
  -> Tool node 调用 /query
  -> LLM 总结查询结果
  -> Answer
```

SQL 审核节点建议检查：

- 只允许 `select` / `with` / `show` / `describe` / `explain`。
- 不允许 `insert` / `update` / `delete` / `drop` / `alter` / `truncate`。
- 不允许分号拼接多语句。
- 必须设置合理的 `maxRows`。

SQLTunnel 会在服务端再次做权限和只读检查；Dify 端审核用于减少无效请求和降低误调用风险。

## 备选：Workflow / HTTP Request node

Dify 的 HTTP Request node 可以直接请求外部 API，并支持变量替换。只有在当前 Dify 环境不方便导入或使用 Custom Tool 时，才建议用这个备选方式。

### 1. 添加 HTTP Request node

在 Workflow / Chatflow 中添加 HTTP Request node。

配置：

- Method: `POST`
- URL: `http://sqltunnel:3000/query`
- Auth: `API Key`，选择 Custom header；如果你的 Dify 版本没有这个选项，则选择 `No Auth` 并在 Headers 中手动配置。
- Headers:
  - `content-type: application/json`
  - `X-SQLTunnel-API-Key: {{SQLTUNNEL_API_KEY}}`
- Body type: `JSON`

Body 示例：

```json
{
  "dbServerId": "prod-postgres",
  "sql": "{{sql}}",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

Dify HTTP Request node 支持用 `{{variable_name}}` 引用上游变量。可以把上游 LLM / Code / Parameter Extractor 节点生成的 SQL 放到 `sql` 字段。

### 2. 处理 HTTP Request 返回

`responseFormat: "json"` 时，HTTP Request 的 response body 是：

```json
{
  "columns": ["id", "name"],
  "rows": [
    {
      "id": 1,
      "name": "Alice"
    }
  ],
  "rowCount": 1,
  "durationMs": 24,
  "dbServerId": "prod-postgres"
}
```

后续节点通常读取：

- `rows`
- `columns`
- `rowCount`
- `durationMs`

如果使用默认 `responseFormat: "raw"`，HTTP response body 是文本：

- 单列结果：每行一个值。
- 多列结果：TSV，第一行为列名。

## Workflow Prompt 建议

如果使用 Workflow / Tool node，可以把下面内容放到 SQL 生成节点或 SQL 审核节点的提示词中。Agent 应用优先使用上面更完整的 Agent 提示词。

```text
你可以通过 SQLTunnel 查询数据库。
只能生成只读 SQL，优先使用 SELECT。
不要生成 INSERT、UPDATE、DELETE、DROP、ALTER、TRUNCATE 等写操作。
不要使用分号拼接多条 SQL。
除非用户明确要求更多数据，否则 maxRows 不超过 100。
如果查询结果包含密码、token、身份证号、手机号等敏感字段，不要直接展示完整值。
```

## 常见配置问题

### Dify 中 URL 应该写什么

取决于 Dify 和 SQLTunnel 的网络位置：

- 同一个 Docker Compose 网络：`http://sqltunnel:3000`
- 同一台机器本地调试：`http://127.0.0.1:3000`
- Dify Cloud：不能使用你本机的 `localhost`，需要一个 Dify Cloud 可访问的地址。

### Dify 认证应该怎么选

优先选择 `API Key`，位置选择 Custom header，header 名称填写 `X-SQLTunnel-API-Key`。如果当前 Dify 版本没有这个入口，选择 `No Auth`，然后在 Headers 中手动增加 `X-SQLTunnel-API-Key`。
