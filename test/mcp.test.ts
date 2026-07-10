import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildServer } from "../src/server.js";
import type { GatewayConfig } from "../src/types.js";

const config: GatewayConfig = {
  defaults: {
    maxRows: 1000,
    queryTimeoutMs: 10000,
    connectTimeoutMs: 10000,
    schemaCacheTtlMs: 300000
  },
  sshServers: [],
  dbServers: [
    {
      id: "test-postgres",
      type: "postgres",
      database: {
        host: "127.0.0.1",
        port: 5432,
        user: "test",
        password: "test",
        database: "test"
      }
    }
  ],
  clients: [
    {
      id: "mcp-test",
      apiKey: "test-key",
      dbServers: [
        {
          serverId: "test-postgres",
          permission: "read",
          maxRows: 50,
          queryTimeoutMs: 2000
        }
      ]
    }
  ]
};

test("MCP endpoint requires a SQLTunnel Bearer token", async () => {
  const app = buildServer(config);

  const response = await app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json"
    },
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" }
      }
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "UNAUTHENTICATED");
  await app.close();
});

test("legacy SQLTunnel API key header is rejected", async () => {
  const app = buildServer(config);

  const response = await app.inject({
    method: "POST",
    url: "/schema",
    headers: { "X-SQLTunnel-API-Key": "test-key" },
    payload: { operation: "list_databases" }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "UNAUTHENTICATED");
  await app.close();
});

test("non-Bearer authorization scheme is rejected", async () => {
  const app = buildServer(config);

  const response = await app.inject({
    method: "POST",
    url: "/schema",
    headers: { Authorization: "Basic test-key" },
    payload: { operation: "list_databases" }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "UNAUTHENTICATED");
  await app.close();
});

test("MCP client can discover and call SQLTunnel tools", async () => {
  const app = buildServer(config);
  await app.listen({ host: "127.0.0.1", port: 0 });

  const address = app.server.address();
  assert.ok(address && typeof address !== "string");

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
    requestInit: {
      headers: {
        Authorization: "Bearer test-key"
      }
    }
  });
  const client = new Client({ name: "sqltunnel-test", version: "1.0.0" });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["get_table_schema", "list_database_tables", "list_db_servers", "query_database"]
    );
    assert.equal(tools.tools.find((tool) => tool.name === "list_db_servers")?.annotations?.readOnlyHint, true);
    assert.equal(tools.tools.find((tool) => tool.name === "list_database_tables")?.annotations?.readOnlyHint, true);
    assert.equal(tools.tools.find((tool) => tool.name === "get_table_schema")?.annotations?.readOnlyHint, true);
    assert.equal(tools.tools.find((tool) => tool.name === "query_database")?.annotations?.destructiveHint, true);

    const result = await client.callTool({ name: "list_db_servers", arguments: {} });
    assert.deepEqual(result.structuredContent, {
      dbServers: [
        {
          id: "test-postgres",
          type: "postgres",
          permission: "read",
          maxRows: 50,
          queryTimeoutMs: 2000,
          connectTimeoutMs: 10000,
          ssh: false
        }
      ]
    });

    const errorResult = await client.callTool({
      name: "query_database",
      arguments: { dbServerId: "missing", sql: "select 1" }
    });
    assert.equal(errorResult.isError, true);
    assert.match(JSON.stringify(errorResult.content), /DB_SERVER_NOT_FOUND/);

    const schemaErrorResult = await client.callTool({
      name: "list_database_tables",
      arguments: { dbServerId: "missing" }
    });
    assert.equal(schemaErrorResult.isError, true);
    assert.match(JSON.stringify(schemaErrorResult.content), /DB_SERVER_NOT_FOUND/);
  } finally {
    await client.close();
    await app.close();
  }
});

test("OpenAPI exposes only query and schema business tools", async () => {
  const app = buildServer(config);

  const schemaResponse = await app.inject({
    method: "POST",
    url: "/schema",
    headers: { Authorization: "Bearer test-key" },
    payload: { operation: "list_databases" }
  });
  assert.equal(schemaResponse.statusCode, 200);
  assert.deepEqual(schemaResponse.json(), {
    operation: "list_databases",
    databases: [
      {
        dbServerId: "test-postgres",
        databaseName: "test",
        databaseType: "postgres",
        permission: "read"
      }
    ]
  });

  const removedResponse = await app.inject({
    method: "POST",
    url: "/db-servers",
    headers: { Authorization: "Bearer test-key" },
    payload: {}
  });
  assert.equal(removedResponse.statusCode, 404);

  const openApiResponse = await app.inject({ method: "GET", url: "/openapi.json" });
  const openApiDocument = openApiResponse.json();
  assert.deepEqual(Object.keys(openApiDocument.paths).sort(), ["/query", "/schema"]);
  assert.deepEqual(openApiDocument.components.securitySchemes, {
    SQLTunnelBearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "API key"
    }
  });
  assert.deepEqual(openApiDocument.paths["/query"].post.security, [{ SQLTunnelBearerAuth: [] }]);
  assert.deepEqual(openApiDocument.paths["/schema"].post.security, [{ SQLTunnelBearerAuth: [] }]);
  await app.close();
});
