import { GatewayError } from "./errors.js";
import type { AuthContext, ClientConfig, ClientDbServerGrant, DbServerConfig, GatewayConfig } from "./types.js";

export class AuthService {
  private readonly clientsByApiKey: Map<string, ClientConfig>;

  constructor(config: GatewayConfig) {
    this.clientsByApiKey = new Map(config.clients.map((client) => [client.apiKey, client]));
  }

  authenticate(apiKey: unknown): AuthContext {
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new GatewayError("UNAUTHENTICATED", "X-SQLTunnel-API-Key header is required", 401);
    }

    const client = this.clientsByApiKey.get(apiKey);
    if (!client) {
      throw new GatewayError("UNAUTHENTICATED", "Invalid apiKey", 401);
    }

    return { client };
  }

  getDbServerGrant(context: AuthContext, dbServer: DbServerConfig): ClientDbServerGrant {
    const grant = context.client.dbServers.find((entry) => entry.serverId === dbServer.id);
    if (!grant) {
      throw new GatewayError("FORBIDDEN", `API key cannot access db server ${dbServer.id}`, 403);
    }
    return grant;
  }

  assertWriteAllowed(grant: ClientDbServerGrant, sql: string) {
    const isReadQuery = isReadOnlySql(sql);
    if (isReadQuery) {
      return;
    }
    if (grant.permission !== "write") {
      throw new GatewayError("WRITE_FORBIDDEN", "Client does not have write permission for this db server", 403);
    }
  }
}

export function isReadOnlySql(sql: string): boolean {
  const normalized = stripSqlComments(sql).trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes(";")) {
    return false;
  }
  return /^(select|with|show|describe|desc|explain)\b/.test(normalized);
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}
