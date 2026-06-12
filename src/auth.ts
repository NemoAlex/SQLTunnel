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
  const statements = splitSqlStatements(sql);
  if (statements.length !== 1) {
    return false;
  }

  const normalized = statements[0].trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return /^(select|with|show|describe|desc|explain)\b/.test(normalized);
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | "\"" | "`" | undefined;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (inLineComment) {
      if (char === "\n" || char === "\r") {
        inLineComment = false;
        current += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
        current += " ";
      }
      continue;
    }

    if (quote) {
      current += char;

      if (char === "\\" && quote !== "`" && next !== undefined) {
        current += next;
        index += 1;
        continue;
      }

      if (char === quote) {
        if (next === quote && quote !== "`") {
          current += next;
          index += 1;
          continue;
        }
        quote = undefined;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "#") {
      inLineComment = true;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      current += char;
      continue;
    }

    if (char === ";") {
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}
