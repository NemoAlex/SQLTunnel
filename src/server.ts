import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AuthService } from "./auth.js";
import { executeQuery } from "./db.js";
import { GatewayError, toErrorPayload } from "./errors.js";
import { normalizeParams, normalizeSql, resolveMaxRows } from "./sql.js";
import { SshTunnelPool } from "./ssh.js";
import type { GatewayConfig, QueryRequest } from "./types.js";

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
    reply.status(payload.statusCode).send(payload.body);
  });

  app.get("/health", async () => ({
    status: "ok"
  }));

  app.get("/openapi.json", async () => openApiDocument);

  app.post("/connections", async (request) => {
    const body = request.body as { apiKey?: unknown } | undefined;
    const context = auth.authenticate(body?.apiKey);
    const allowed = context.client.dbServers.map((grant) => {
      const dbServer = dbServersById.get(grant.serverId);
      if (!dbServer) {
        throw new GatewayError("INVALID_CONFIG", `Unknown dbServer in client grant: ${grant.serverId}`, 500);
      }

      const maxRows = resolveEffectiveLimit(dbServer.maxRows ?? config.defaults.maxRows, grant.maxRows);
      const timeoutMs = resolveEffectiveLimit(dbServer.timeoutMs ?? config.defaults.timeoutMs, grant.timeoutMs);

      return {
        id: dbServer.id,
        type: dbServer.type,
        permission: grant.permission,
        maxRows,
        timeoutMs,
        ssh: Boolean(dbServer.sshServerId)
      };
    });

    return { connections: allowed };
  });

  app.post("/query", async (request) => {
    const body = request.body as Partial<QueryRequest> | undefined;
    const context = auth.authenticate(body?.apiKey);
    if (!body || typeof body.connectionId !== "string") {
      throw new GatewayError("INVALID_REQUEST", "connectionId is required");
    }

    const connection = dbServersById.get(body.connectionId);
    if (!connection) {
      throw new GatewayError("CONNECTION_NOT_FOUND", `Connection not found: ${body.connectionId}`, 404);
    }

    const grant = auth.getDbServerGrant(context, connection);

    const sql = normalizeSql(body.sql);
    const params = normalizeParams(body.params);
    const configuredMaxRows = resolveEffectiveLimit(connection.maxRows ?? config.defaults.maxRows, grant.maxRows);
    const maxRows = resolveMaxRows(body.maxRows, configuredMaxRows);
    const timeoutMs = resolveEffectiveLimit(connection.timeoutMs ?? config.defaults.timeoutMs, grant.timeoutMs);

    auth.assertWriteAllowed(grant, sql);

    return executeQuery({
      connection,
      sshTunnelPool,
      sql,
      params,
      maxRows,
      timeoutMs
    });
  });

  return app;
}

function resolveEffectiveLimit(serverLimit: number, clientLimit: number | undefined): number {
  if (clientLimit === undefined) {
    return serverLimit;
  }
  return Math.min(serverLimit, clientLimit);
}

function loadOpenApiDocument(): unknown {
  const openApiPath = path.resolve("docs/openapi.json");
  return JSON.parse(fs.readFileSync(openApiPath, "utf8")) as unknown;
}
