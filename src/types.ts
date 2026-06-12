export type DatabaseType = "mysql" | "postgres";

export interface DefaultsConfig {
  maxRows: number;
  timeoutMs: number;
}

export type ClientDbServerPermission = "read" | "write";

export interface ClientDbServerGrant {
  serverId: string;
  permission: ClientDbServerPermission;
  maxRows?: number;
  timeoutMs?: number;
}

export interface ClientConfig {
  id: string;
  apiKey: string;
  dbServers: ClientDbServerGrant[];
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

export interface SshConfig {
  host: string;
  hostAlias?: string;
  port?: number;
  username?: string;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  proxyJumps?: SshConfig[];
}

export interface SshServerConfig extends SshConfig {
  id: string;
  sshConfigPath?: string;
  idleTimeoutMs?: number;
}

export interface DbServerConfig {
  id: string;
  type: DatabaseType;
  maxRows?: number;
  timeoutMs?: number;
  database: DatabaseConfig;
  sshServerId?: string;
}

export interface GatewayConfig {
  defaults: DefaultsConfig;
  sshServers: SshServerConfig[];
  clients: ClientConfig[];
  dbServers: DbServerConfig[];
}

export interface AuthContext {
  client: ClientConfig;
}

export interface QueryRequest {
  apiKey: string;
  connectionId: string;
  sql: string;
  params?: unknown[];
  maxRows?: number;
  responseFormat?: "raw" | "json";
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  connectionId: string;
}
