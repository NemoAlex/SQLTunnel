# SQLTunnel Dify Setup Guide

[Back to README](../README.md) | [Configuration reference](configuration.md) | [API reference](api.md)

This guide focuses on the Dify-side setup for calling SQLTunnel. On the SQLTunnel side, prepare:

- A SQLTunnel URL reachable from Dify, for example `http://sqltunnel:3000`.
- A Dify-specific `apiKey`.
- The `dbServerId` values Dify may use.

SQLTunnel API keys are sent in the `X-SQLTunnel-API-Key` request header.

Official Dify references:

- [Dify Tools](https://docs.dify.ai/en/use-dify/workspace/tools): Custom Tools can import external APIs from an OpenAPI schema.
- [Tool Node](https://docs.dify.ai/en/use-dify/nodes/tools): Workflows and Chatflows can call tools with Tool nodes.
- [HTTP Request Node](https://docs.dify.ai/en/use-dify/nodes/http-request): HTTP Request nodes support URL, headers, request body, authentication, and variable interpolation.

## Recommended Setup

All Dify flows should first import SQLTunnel's OpenAPI document as a Custom Tool. Then choose the app pattern:

For model-driven database access during conversation, prefer:

```text
Agent app + SQLTunnel Custom Tool
```

For fixed flows such as "generate SQL -> review SQL -> query -> summarize", prefer:

```text
Workflow / Tool node + SQLTunnel Custom Tool
```

Use an HTTP Request node only as a fallback when Custom Tools are not convenient in the current Dify environment.

## Prerequisite: Import SQLTunnel as a Custom Tool

Dify Custom Tools can import external APIs from an OpenAPI schema and generate callable tool actions.

### 1. Prepare OpenAPI

Open SQLTunnel's OpenAPI endpoint:

```text
http://sqltunnel:3000/openapi.json
```

This endpoint automatically adds `servers` to the OpenAPI response based on the host Dify uses to reach SQLTunnel.

If Dify cannot access the endpoint directly, copy the static file from the repository:

```text
docs/openapi.json
```

The static file does not include `servers`. If you import the static file, add `servers` before importing it into Dify:

```json
{
  "servers": [
    {
      "url": "http://sqltunnel:3000"
    }
  ]
}
```

Only add `servers`; do not remove the existing `paths`.

### 2. Create the Custom Tool

In Dify, go to Tools, create a Custom Tool, and import SQLTunnel's OpenAPI schema.

The imported tool should expose two actions:

- `POST /schema`
- `POST /query`

### 3. Configure Authentication

SQLTunnel uses a custom API key header, not Bearer Token or the `Authorization` header.

Configure a custom header:

```text
Header name: X-SQLTunnel-API-Key
Header value: dify-read-key
```

## Option 1: Agent App

Agent apps are suitable when the model should decide whether a database query is needed.

### 1. Create an Agent App

In Dify Studio, create an Agent app. Depending on the Dify UI version, the Agent option may appear under a beginner-friendly app category.

### 2. Add the SQLTunnel Tool

Add the imported SQLTunnel Custom Tool to the Agent's Tools.

You can fix `dbServerId` to one business database, or let the Agent call `/schema` with `operation: list_databases` first and choose an available database.

### 3. Agent Prompt

Paste the following into the Agent Instructions / System Prompt. Replace `prod-postgres` with your default `dbServerId`. If the Agent should choose the db server dynamically, keep the instruction to call `/schema` with `operation: list_databases` when needed.

```text
You are a cautious database query assistant. You can use the SQLTunnel tool to query databases and explain the results to the user.

SQLTunnel tool rules:
- Call SQLTunnel only when the user's question requires database data.
- Available dbServerId list:
  - XX: database for XX business domain
- If you are not sure which db server is available, call /schema with operation list_databases first.
- When calling /query, always set responseFormat to json.
- When calling /query, keep maxRows at 100 or lower by default. Use a larger value only when the user explicitly asks for more data and the answer truly needs it.
- If there are no SQL parameters, pass [] or omit params.

SQL generation rules:
- Generate read-only SQL by default.
- Only allow SELECT, WITH, SHOW, DESCRIBE, DESC, and EXPLAIN.
- Do not generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, MERGE, CALL, or other write/admin statements.
- Do not concatenate multiple SQL statements with semicolons.
- Do not query unrelated tables or broaden the query scope to guess the answer.
- Filter first when possible. Aggregate first when possible. Avoid pulling large detail datasets.
- If the user question lacks required conditions, ask a follow-up question instead of querying blindly.

Result handling rules:
- Base the answer on query results. Do not invent information that was not returned.
- If the result is empty, clearly say no matching data was found.
- If there are many rows, summarize the key conclusion first, then include only necessary sample rows.
- Do not fully reveal passwords, tokens, keys, ID numbers, phone numbers, emails, or other sensitive fields. Mask them if they must be mentioned.
- Do not reveal the SQLTunnel API key, request headers, internal connection configuration, or database passwords.

Error handling rules:
- If the tool returns UNAUTHENTICATED, FORBIDDEN, DB_SERVER_NOT_FOUND, or INVALID_REQUEST, briefly explain the failure and ask the user to check configuration or permissions.
- If the tool returns QUERY_FAILED, the SQL execution failed. Modify the SQL based on the error and retry once. If it still fails, explain the failure to the user.
- Do not rewrite SQL into a dangerous form to bypass permission or read-only restrictions.

Response style:
- Answer in the user's language.
- Give the conclusion first, then the supporting query evidence.
- When an answer depends on a query, briefly mention the dbServerId and the main query condition.
```

### 4. Knowledge Base

For complex business domains, put table schemas, field descriptions, and business terminology into a Dify knowledge base and attach it to the Agent.

## Option 2: Workflow / Tool Node

Workflow and Chatflow are suitable for fixed flows such as "generate SQL -> review SQL -> query -> summarize". This option still uses the SQLTunnel Custom Tool; the workflow explicitly controls when the tool is called.

### 1. Add a Tool Node

In a Workflow or Chatflow canvas:

1. Click `Add Node`.
2. Choose `Tools`.
3. Select the imported SQLTunnel tool action, for example `/query`.
4. Fill in parameters or map them from upstream node variables.

Dify's Tool node can call tools as standalone nodes in Workflows and Chatflows.

### 2. Configure `/query` Parameters

Recommended fixed parameters:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "{{sql}}",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

The `sql` value usually comes from an upstream LLM, Code, or Parameter Extractor node.

### 3. Handle Tool Node Output

With `responseFormat: "json"`, the response is:

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

Downstream nodes typically read:

- `rows`
- `columns`
- `rowCount`
- `durationMs`

### 4. Recommended Workflow

```text
User Input
  -> LLM generates read-only SQL
  -> Code or LLM node reviews SQL
  -> Tool node calls /query
  -> LLM summarizes query results
  -> Answer
```

The SQL review node should check:

- Only allow `select` / `with` / `show` / `describe` / `explain`.
- Reject `insert` / `update` / `delete` / `drop` / `alter` / `truncate`.
- Reject semicolon-joined multi-statement SQL.
- Enforce a reasonable `maxRows`.

SQLTunnel performs server-side permission and read-only checks as well. Dify-side review reduces invalid requests and accidental tool misuse.

## Fallback: Workflow / HTTP Request Node

Dify's HTTP Request node can call external APIs directly and supports variable interpolation. Use this only when importing or using the SQLTunnel Custom Tool is not practical.

### 1. Add an HTTP Request Node

In a Workflow or Chatflow, add an HTTP Request node.

Configuration:

- Method: `POST`
- URL: `http://sqltunnel:3000/query`
- Auth: `API Key`, with a custom header. If your Dify version does not provide that option, choose `No Auth` and configure the header manually.
- Headers:
  - `content-type: application/json`
  - `X-SQLTunnel-API-Key: {{SQLTUNNEL_API_KEY}}`
- Body type: `JSON`

Body example:

```json
{
  "dbServerId": "prod-postgres",
  "sql": "{{sql}}",
  "params": [],
  "maxRows": 100,
  "responseFormat": "json"
}
```

Dify HTTP Request nodes support `{{variable_name}}` references. Put SQL generated by an upstream LLM, Code, or Parameter Extractor node into the `sql` field.

### 2. Handle HTTP Response

With `responseFormat: "json"`, the HTTP response body is:

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

Downstream nodes typically read:

- `rows`
- `columns`
- `rowCount`
- `durationMs`

With default `responseFormat: "raw"`, the HTTP response body is text:

- Single-column result: one value per line.
- Multi-column result: TSV with column names on the first line.

## Workflow Prompt

For Workflow / Tool node setups, put the following in the SQL generation or SQL review node prompt. Agent apps should use the fuller Agent prompt above.

```text
You can query databases through SQLTunnel.
Generate read-only SQL only. Prefer SELECT.
Do not generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or other write operations.
Do not concatenate multiple SQL statements with semicolons.
Keep maxRows at 100 or lower unless the user explicitly asks for more data.
If query results contain passwords, tokens, ID numbers, phone numbers, or other sensitive fields, do not reveal full values.
```

## Common Questions

### What URL should Dify use?

It depends on where Dify and SQLTunnel run:

- Same Docker Compose network: `http://sqltunnel:3000`
- Same machine for local debugging: `http://127.0.0.1:3000`
- Dify Cloud: do not use your local `localhost`; expose SQLTunnel at an address reachable from Dify Cloud.

### Which Dify authentication option should I choose?

Prefer `API Key`, with location set to a custom header and header name set to `X-SQLTunnel-API-Key`. If your Dify version does not provide that option, choose `No Auth` and add `X-SQLTunnel-API-Key` manually in Headers.
