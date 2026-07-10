export type DatabaseType = "mysql" | "postgres";

export interface DefaultsConfig {
  maxRows: number;
  queryTimeoutMs: number;
  connectTimeoutMs: number;
  schemaCacheTtlMs: number;
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
  description?: string;
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

export interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  ordinalPosition: number;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
  comment?: string;
}

export interface SchemaTable {
  name: string;
  type: "table" | "partitioned_table" | "view" | "materialized_view" | "foreign_table";
  comment?: string;
  columns: SchemaColumn[];
}

export interface DatabaseSchema {
  name: string;
  tables: SchemaTable[];
}

export interface DatabaseSchemaResult {
  dbServerId: string;
  databaseName: string;
  databaseType: DatabaseType;
  schemas: DatabaseSchema[];
  cached: boolean;
  cachedAt: string;
}

export interface SchemaTableSummary {
  schemaName: string;
  tableName: string;
  type: SchemaTable["type"];
  comment?: string;
}

export interface SchemaDatabaseSummary {
  dbServerId: string;
  description?: string;
  databaseName: string;
  databaseType: DatabaseType;
  permission: ClientDbServerPermission;
}

export interface ListDatabasesSchemaRequest {
  operation: "list_databases";
}

export interface ListTablesSchemaRequest {
  operation: "list_tables";
  dbServerId: string;
  refresh?: boolean;
}

export interface DescribeTableSchemaRequest {
  operation: "describe_table";
  dbServerId: string;
  schemaName: string;
  tableName: string;
  refresh?: boolean;
}

export type SchemaRequest = ListDatabasesSchemaRequest | ListTablesSchemaRequest | DescribeTableSchemaRequest;

export interface ListDatabasesSchemaResult {
  operation: "list_databases";
  databases: SchemaDatabaseSummary[];
}

export interface ListTablesSchemaResult {
  operation: "list_tables";
  dbServerId: string;
  databaseName: string;
  databaseType: DatabaseType;
  tables: SchemaTableSummary[];
  cached: boolean;
  cachedAt: string;
}

export interface DescribeTableSchemaResult {
  operation: "describe_table";
  dbServerId: string;
  databaseName: string;
  databaseType: DatabaseType;
  schemaName: string;
  table: SchemaTable;
  cached: boolean;
  cachedAt: string;
}

export type SchemaResult = ListDatabasesSchemaResult | ListTablesSchemaResult | DescribeTableSchemaResult;
