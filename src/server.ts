import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { toErrorPayload } from "./errors.js";
import { GatewayService } from "./gateway-service.js";
import { handleMcpPost, replyMcpMethodNotAllowed } from "./mcp.js";
import { normalizeResponseFormat } from "./sql.js";
import type { GatewayConfig, QueryRequest, QueryResult } from "./types.js";
import type { FastifyRequest } from "fastify";

type OpenApiDocument = Record<string, unknown> & {
  servers?: Array<{ url: string }>;
};

export interface BuildServerOptions {
  openApiPath?: string;
  onDatabaseActivity?: (dbServerId: string, active: boolean, succeeded?: boolean) => void;
  onSshConnectionStatus?: (sshServerId: string, connected: boolean) => void;
  onHttpRequest?: (entry: HttpRequestLogEntry) => void;
}

export interface HttpRequestLogEntry {
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
}

export function buildServer(config: GatewayConfig, options: BuildServerOptions = {}) {
  const app = Fastify({
    logger: true,
    genReqId: () => randomUUID()
  });
  const gateway = new GatewayService(config, {
    onDatabaseActivity: options.onDatabaseActivity,
    onSshConnectionStatus: options.onSshConnectionStatus
  });
  const openApiDocument = loadOpenApiDocument(options.openApiPath);

  app.register(sensible);

  app.addHook("onClose", async () => {
    await gateway.close();
  });

  app.addHook("onResponse", async (request, reply) => {
    options.onHttpRequest?.({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime
    });
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

  app.post("/query", async (request) => {
    const body = request.body as Partial<QueryRequest> | undefined;
    const context = gateway.authenticate(getApiKey(request));
    const responseFormat = normalizeResponseFormat(body?.responseFormat);
    const result = await gateway.query(context, body);

    if (responseFormat === "raw") {
      return replyAsRawText(result);
    }

    return result;
  });

  app.post("/schema", async (request) => {
    const context = gateway.authenticate(getApiKey(request));
    return gateway.inspectSchema(context, request.body);
  });

  app.post("/mcp", async (request, reply) => {
    const context = gateway.authenticate(getApiKey(request));
    await handleMcpPost(request, reply, gateway, context);
  });

  app.get("/mcp", async (request, reply) => {
    gateway.authenticate(getApiKey(request));
    return replyMcpMethodNotAllowed(reply);
  });

  app.delete("/mcp", async (request, reply) => {
    gateway.authenticate(getApiKey(request));
    return replyMcpMethodNotAllowed(reply);
  });

  return app;
}

function replyAsRawText(result: QueryResult) {
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

function loadOpenApiDocument(configuredPath?: string): OpenApiDocument {
  const openApiPath = configuredPath ?? path.resolve("docs/openapi.json");
  return JSON.parse(fs.readFileSync(openApiPath, "utf8")) as OpenApiDocument;
}

function getApiKey(request: FastifyRequest): unknown {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim();
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
