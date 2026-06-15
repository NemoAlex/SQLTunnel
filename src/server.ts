import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AuthService } from "./auth.js";
import { executeQuery } from "./db.js";
import { GatewayError, toErrorPayload } from "./errors.js";
import { normalizeParams, normalizeResponseFormat, normalizeSql, resolveMaxRows } from "./sql.js";
import { SshTunnelPool } from "./ssh.js";
import type { GatewayConfig, QueryRequest } from "./types.js";
import type { FastifyRequest } from "fastify";

type OpenApiDocument = Record<string, unknown> & {
  servers?: Array<{ url: string }>;
};

export function buildServer(config: GatewayConfig) {
  const app = Fastify({
    logger: true,
    genReqId: () => randomUUID()
  });
  const auth = new AuthService(config);
  const sshTunnelPool = new SshTunnelPool(config.sshServers);
  const dbServersById = new Map(config.dbServers.map((dbServer) => [dbServer.id, dbServer]));
  const openApiDocument = loadOpenApiDocument();

  app.register(sensible);

  app.addHook("onClose", async () => {
    await sshTunnelPool.closeAll();
  });

  app.setErrorHandler((error, request, reply) => {
    const payload = toErrorPayload(error, request.id);
    if (payload.statusCode >= 500) {
      request.log.error({ err: error, code: payload.body.code }, "request failed");
    }
    reply.status(payload.statusCode).send(payload.body);
  });

  app.get("/health", async () => ({
    status: "ok"
  }));

  app.get("/openapi.json", async (request) => withRequestServer(openApiDocument, request));

  app.post("/db-servers", async (request) => {
    const context = auth.authenticate(getApiKey(request));
    const allowed = context.client.dbServers.map((grant) => {
      const dbServer = dbServersById.get(grant.serverId);
      if (!dbServer) {
        throw new GatewayError("INVALID_CONFIG", `Unknown dbServer in client grant: ${grant.serverId}`, 500);
      }

      const maxRows = resolveEffectiveLimit(dbServer.maxRows ?? config.defaults.maxRows, grant.maxRows);
      const queryTimeoutMs = resolveEffectiveLimit(dbServer.queryTimeoutMs ?? config.defaults.queryTimeoutMs, grant.queryTimeoutMs);
      const connectTimeoutMs = dbServer.connectTimeoutMs ?? config.defaults.connectTimeoutMs;

      return {
        id: dbServer.id,
        type: dbServer.type,
        permission: grant.permission,
        maxRows,
        queryTimeoutMs,
        connectTimeoutMs,
        ssh: Boolean(dbServer.sshServerId)
      };
    });

    return { dbServers: allowed };
  });

  app.post("/query", async (request) => {
    const body = request.body as Partial<QueryRequest> | undefined;
    const context = auth.authenticate(getApiKey(request));
    if (!body || typeof body.dbServerId !== "string") {
      throw new GatewayError("INVALID_REQUEST", "dbServerId is required");
    }

    const dbServer = dbServersById.get(body.dbServerId);
    if (!dbServer) {
      throw new GatewayError("DB_SERVER_NOT_FOUND", `Db server not found: ${body.dbServerId}`, 404);
    }

    const grant = auth.getDbServerGrant(context, dbServer);

    const sql = normalizeSql(body.sql);
    const params = normalizeParams(body.params);
    const responseFormat = normalizeResponseFormat(body.responseFormat);
    const configuredMaxRows = resolveEffectiveLimit(dbServer.maxRows ?? config.defaults.maxRows, grant.maxRows);
    const maxRows = resolveMaxRows(body.maxRows, configuredMaxRows);
    const queryTimeoutMs = resolveEffectiveLimit(dbServer.queryTimeoutMs ?? config.defaults.queryTimeoutMs, grant.queryTimeoutMs);
    const connectTimeoutMs = dbServer.connectTimeoutMs ?? config.defaults.connectTimeoutMs;

    auth.assertWriteAllowed(grant, sql);

    const result = await executeQuery({
      dbServer,
      sshTunnelPool,
      sql,
      params,
      maxRows,
      queryTimeoutMs,
      connectTimeoutMs
    });

    if (responseFormat === "raw") {
      return replyAsRawText(result);
    }

    return result;
  });

  return app;
}

function replyAsRawText(result: Awaited<ReturnType<typeof executeQuery>>) {
  return result.columns.length === 1
    ? result.rows.map((row) => formatRawValue(row[result.columns[0]])).join("\n")
    : [
        result.columns.join("\t"),
        ...result.rows.map((row) => result.columns.map((column) => formatRawValue(row[column])).join("\t"))
      ].join("\n");
}

function formatRawValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function resolveEffectiveLimit(serverLimit: number, clientLimit: number | undefined): number {
  if (clientLimit === undefined) {
    return serverLimit;
  }
  return Math.min(serverLimit, clientLimit);
}

function loadOpenApiDocument(): OpenApiDocument {
  const openApiPath = path.resolve("docs/openapi.json");
  return JSON.parse(fs.readFileSync(openApiPath, "utf8")) as OpenApiDocument;
}

function getApiKey(request: FastifyRequest): unknown {
  return request.headers["x-sqltunnel-api-key"];
}

function withRequestServer(document: OpenApiDocument, request: FastifyRequest): OpenApiDocument {
  return {
    ...document,
    servers: [{ url: getRequestBaseUrl(request) }]
  };
}

function getRequestBaseUrl(request: FastifyRequest): string {
  const proto = firstHeaderValue(request.headers["x-forwarded-proto"]) ?? "http";
  const host = firstHeaderValue(request.headers["x-forwarded-host"]) ?? request.headers.host;

  if (!host) {
    return `${proto}://localhost`;
  }

  return `${proto}://${host}`;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const firstValue = Array.isArray(value) ? value[0] : value;
  const normalized = firstValue?.split(",")[0]?.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized;
}
