export type DatabaseType = "mysql" | "postgres";

export interface DefaultsConfig {
  maxRows: number;
  queryTimeoutMs: number;
  connectTimeoutMs: number;
}

export type ClientDbServerPermission = "read" | "write";

export interface ClientDbServerGrant {
  serverId: string;
  permission: ClientDbServerPermission;
  maxRows?: number;
  queryTimeoutMs?: number;
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
  queryTimeoutMs?: number;
  connectTimeoutMs?: number;
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
  dbServerId: string;
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
  dbServerId: string;
}

export interface BackupRetentionConfig {
  latest: number;
  previous: number;
  daily: number;
  weekly: number;
  monthly: number;
}

export interface BackupBinariesConfig {
  pgDump: string;
  mySqlDump: string;
}

export interface BackupDefaultsConfig {
  timezone: string;
  outputDir: string;
  binaries: BackupBinariesConfig;
  retention: BackupRetentionConfig;
}

export interface BackupJobConfig {
  id: string;
  enabled: boolean;
  dbServerId: string;
  schedule: string;
  outputDir: string;
  retention: BackupRetentionConfig;
  dumpOptions: string[];
}

export interface BackupConfig {
  version: 1;
  defaults: BackupDefaultsConfig;
  jobs: BackupJobConfig[];
  configured: boolean;
}
