import mysql from "mysql2/promise";
import pg from "pg";
import { GatewayError } from "./errors.js";
import type { SshTunnelPool, Tunnel } from "./ssh.js";
import { withRowLimit } from "./sql.js";
import type { DbServerConfig, QueryResult } from "./types.js";

pg.types.setTypeParser(114, (value) => value);
pg.types.setTypeParser(3802, (value) => value);

export interface ExecuteQueryOptions {
  connection: DbServerConfig;
  sshTunnelPool: SshTunnelPool;
  sql: string;
  params: unknown[];
  maxRows: number;
  timeoutMs: number;
}

export async function executeQuery(options: ExecuteQueryOptions): Promise<QueryResult> {
  const started = Date.now();
  const limitedSql = withRowLimit(options.sql, options.maxRows);

  if (options.connection.type === "mysql") {
    const result = await runWithTimeout(runMysql(options, limitedSql), options.timeoutMs);
    return {
      ...result,
      durationMs: Date.now() - started,
      connectionId: options.connection.id
    };
  }

  const result = await runWithTimeout(runPostgres(options, limitedSql), options.timeoutMs);
  return {
    ...result,
    durationMs: Date.now() - started,
    connectionId: options.connection.id
  };
}

async function runMysql(options: ExecuteQueryOptions, sql: string) {
  const tunnel = await openTunnel(options);
  let client: mysql.Connection | undefined;

  try {
    client = await mysql.createConnection({
      host: tunnel ? undefined : options.connection.database.host,
      port: tunnel ? undefined : options.connection.database.port,
      user: options.connection.database.user,
      password: resolveDatabasePassword(options.connection),
      database: options.connection.database.database,
      stream: tunnel?.stream,
      namedPlaceholders: false,
      multipleStatements: false,
      connectTimeout: options.timeoutMs
    });

    const activeClient = client;
    const [rows, fields] = await runSqlQuery(() => activeClient.query({ sql, timeout: options.timeoutMs }, options.params));
    const normalizedRows = Array.isArray(rows)
      ? (rows.slice(0, options.maxRows) as Record<string, unknown>[])
      : [];
    return {
      columns: normalizeMysqlColumns(fields),
      rows: normalizedRows,
      rowCount: normalizedRows.length
    };
  } finally {
    await client?.end().catch(() => undefined);
    tunnel?.close();
  }
}

async function runPostgres(options: ExecuteQueryOptions, sql: string) {
  const tunnel = await openTunnel(options);
  const client = new pg.Client({
    host: tunnel ? undefined : options.connection.database.host,
    port: tunnel ? undefined : options.connection.database.port,
    user: options.connection.database.user,
    password: resolveDatabasePassword(options.connection),
    database: options.connection.database.database,
    statement_timeout: options.timeoutMs,
    query_timeout: options.timeoutMs,
    connectionTimeoutMillis: options.timeoutMs,
    stream: tunnel ? () => tunnel.stream : undefined
  });

  try {
    await client.connect();
    const result = await runSqlQuery(() => client.query(sql, options.params));
    const rows = result.rows.slice(0, options.maxRows);
    return {
      columns: result.fields.map((field) => field.name),
      rows,
      rowCount: rows.length
    };
  } finally {
    await client.end().catch(() => undefined);
    tunnel?.close();
  }
}

async function openTunnel(options: ExecuteQueryOptions): Promise<Tunnel | undefined> {
  if (!options.connection.sshServerId) {
    return undefined;
  }

  return options.sshTunnelPool.openTunnel(
    options.connection.sshServerId,
    options.connection.database.host,
    options.connection.database.port
  );
}

function resolveDatabasePassword(connection: DbServerConfig): string {
  if (connection.database.password !== undefined) {
    return connection.database.password;
  }
  throw new GatewayError("INVALID_CONFIG", `Connection ${connection.id} database password is not configured`, 500);
}

function normalizeMysqlColumns(fields: unknown): string[] {
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields.map((field) => {
    if (field && typeof field === "object" && "name" in field && typeof field.name === "string") {
      return field.name;
    }
    return String(field);
  });
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new GatewayError("QUERY_TIMEOUT", "Query timed out", 408)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function runSqlQuery<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (error instanceof GatewayError) {
      throw error;
    }
    throw new GatewayError("QUERY_FAILED", getErrorMessage(error), 400);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Query failed";
}
