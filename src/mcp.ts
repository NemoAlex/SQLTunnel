import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { toErrorPayload } from "./errors.js";
import type { GatewayService } from "./gateway-service.js";
import type { AuthContext } from "./types.js";
import type { FastifyReply, FastifyRequest } from "fastify";

const dbServerSchema = z.object({
  id: z.string(),
  type: z.enum(["mysql", "postgres"]),
  permission: z.enum(["read", "write"]),
  maxRows: z.number().int().positive(),
  queryTimeoutMs: z.number().int().positive(),
  connectTimeoutMs: z.number().int().positive(),
  ssh: z.boolean()
});

const queryResultSchema = {
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  rowCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  dbServerId: z.string()
};

const schemaColumnSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  ordinalPosition: z.number().int().positive(),
  primaryKey: z.boolean(),
  unique: z.boolean(),
  defaultValue: z.string().optional(),
  comment: z.string().optional()
});

const schemaTableSchema = z.object({
  name: z.string(),
  type: z.enum(["table", "partitioned_table", "view", "materialized_view", "foreign_table"]),
  comment: z.string().optional(),
  columns: z.array(schemaColumnSchema)
});

const listTablesResultSchema = {
  operation: z.literal("list_tables"),
  dbServerId: z.string(),
  databaseName: z.string(),
  databaseType: z.enum(["mysql", "postgres"]),
  tables: z.array(
    z.object({
      schemaName: z.string(),
      tableName: z.string(),
      type: z.enum(["table", "partitioned_table", "view", "materialized_view", "foreign_table"]),
      comment: z.string().optional()
    })
  ),
  cached: z.boolean(),
  cachedAt: z.string()
};

const tableSchemaResultSchema = {
  operation: z.literal("describe_table"),
  dbServerId: z.string(),
  databaseName: z.string(),
  databaseType: z.enum(["mysql", "postgres"]),
  schemaName: z.string(),
  table: schemaTableSchema,
  cached: z.boolean(),
  cachedAt: z.string()
};

export async function handleMcpPost(
  request: FastifyRequest,
  reply: FastifyReply,
  gateway: GatewayService,
  context: AuthContext
): Promise<void> {
  const server = createMcpServer(gateway, context);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  await server.connect(transport);
  reply.hijack();

  let closed = false;
  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    await transport.close();
    await server.close();
  };

  reply.raw.once("close", () => {
    void close().catch((error) => {
      request.log.error({ err: error }, "Failed to close MCP request resources");
    });
  });

  try {
    await transport.handleRequest(request.raw, reply.raw, request.body);
  } catch (error) {
    request.log.error({ err: error }, "MCP request failed");
    if (!reply.raw.headersSent) {
      reply.raw.writeHead(500, { "content-type": "application/json" });
      reply.raw.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        })
      );
    }
    await close();
  }
}

export function replyMcpMethodNotAllowed(reply: FastifyReply) {
  return reply
    .code(405)
    .header("allow", "POST")
    .send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use POST for this stateless MCP endpoint." },
      id: null
    });
}

function createMcpServer(gateway: GatewayService, context: AuthContext): McpServer {
  const server = new McpServer({
    name: "sqltunnel",
    version: "1.0.0"
  });

  server.registerTool(
    "list_db_servers",
    {
      title: "List accessible database servers",
      description: "List the database servers available to this SQLTunnel client and their effective permissions and limits.",
      inputSchema: {},
      outputSchema: {
        dbServers: z.array(dbServerSchema)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => toolResult(() => ({ dbServers: gateway.listDbServers(context) }))
  );

  server.registerTool(
    "list_database_tables",
    {
      title: "List database tables",
      description:
        "List schemas, tables, and views in an authorized MySQL or PostgreSQL database. Use the returned schemaName and tableName with get_table_schema.",
      inputSchema: {
        dbServerId: z.string().min(1).describe("Target database server id from list_db_servers"),
        refresh: z.boolean().optional().describe("Bypass the schema cache and reload metadata from the database")
      },
      outputSchema: listTablesResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ dbServerId, refresh }) =>
      toolResult(async () => ({ ...(await gateway.listDatabaseTables(context, dbServerId, refresh)) }))
  );

  server.registerTool(
    "get_table_schema",
    {
      title: "Get table schema",
      description:
        "Get columns, data types, keys, defaults, and comments for one table or view. Copy schemaName and tableName exactly from list_database_tables.",
      inputSchema: {
        dbServerId: z.string().min(1).describe("Target database server id from list_db_servers"),
        schemaName: z.string().min(1).describe("Schema name returned by list_database_tables"),
        tableName: z.string().min(1).describe("Table or view name returned by list_database_tables"),
        refresh: z.boolean().optional().describe("Bypass the schema cache and reload metadata from the database")
      },
      outputSchema: tableSchemaResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ dbServerId, schemaName, tableName, refresh }) =>
      toolResult(async () => ({
        ...(await gateway.getTableSchema(context, dbServerId, schemaName, tableName, refresh))
      }))
  );

  server.registerTool(
    "query_database",
    {
      title: "Query a database",
      description:
        "Execute one SQL statement against an authorized database server. Prefer read-only SQL. Server-side permissions, row limits, and timeouts are always enforced.",
      inputSchema: {
        dbServerId: z.string().min(1).describe("Target database server id from list_db_servers"),
        sql: z.string().min(1).describe("A single SQL statement to execute"),
        params: z.array(z.unknown()).optional().describe("Positional SQL parameters"),
        maxRows: z.number().int().positive().optional().describe("Requested maximum rows; configured limits still apply")
      },
      outputSchema: queryResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ dbServerId, sql, params, maxRows }) =>
      toolResult(async () => ({
        ...(await gateway.query(context, { dbServerId, sql, params, maxRows, responseFormat: "json" }))
      }))
  );

  return server;
}

async function toolResult<T extends Record<string, unknown>>(operation: () => T | Promise<T>) {
  try {
    const structuredContent = await operation();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
      structuredContent
    };
  } catch (error) {
    const payload = toErrorPayload(error, randomUUID()).body;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      isError: true
    };
  }
}
