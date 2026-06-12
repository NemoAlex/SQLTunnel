import mysql from "mysql2/promise";
import pg from "pg";
import { GatewayError } from "./errors.js";
import type { SshTunnelPool, Tunnel } from "./ssh.js";
import { withRowLimit } from "./sql.js";
import type { DbServerConfig, QueryResult } from "./types.js";

pg.types.setTypeParser(114, (value) => value);
pg.types.setTypeParser(3802, (value) => value);

export interface ExecuteQueryOptions {
  dbServer: DbServerConfig;
  sshTunnelPool: SshTunnelPool;
  sql: string;
  params: unknown[];
  maxRows: number;
  timeoutMs: number;
}

export async function executeQuery(options: ExecuteQueryOptions): Promise<QueryResult> {
  const started = Date.now();
  const limitedSql = withRowLimit(options.sql, options.maxRows);

  if (options.dbServer.type === "mysql") {
    const result = await runWithTimeout(runMysql(options, limitedSql), options.timeoutMs);
    return {
      ...result,
      durationMs: Date.now() - started,
      dbServerId: options.dbServer.id
    };
  }

  const result = await runWithTimeout(runPostgres(options, limitedSql), options.timeoutMs);
  return {
    ...result,
    durationMs: Date.now() - started,
    dbServerId: options.dbServer.id
  };
}

async function runMysql(options: ExecuteQueryOptions, sql: string) {
  const tunnel = await openTunnel(options);
  let client: mysql.Connection | undefined;

  try {
    client = await mysql.createConnection({
      host: tunnel ? undefined : options.dbServer.database.host,
      port: tunnel ? undefined : options.dbServer.database.port,
      user: options.dbServer.database.user,
      password: resolveDatabasePassword(options.dbServer),
      database: options.dbServer.database.database,
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
    host: tunnel ? undefined : options.dbServer.database.host,
    port: tunnel ? undefined : options.dbServer.database.port,
    user: options.dbServer.database.user,
    password: resolveDatabasePassword(options.dbServer),
    database: options.dbServer.database.database,
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
  if (!options.dbServer.sshServerId) {
    return undefined;
  }

  return options.sshTunnelPool.openTunnel(
    options.dbServer.sshServerId,
    options.dbServer.database.host,
    options.dbServer.database.port
  );
}

function resolveDatabasePassword(dbServer: DbServerConfig): string {
  if (dbServer.database.password !== undefined) {
    return dbServer.database.password;
  }
  throw new GatewayError("INVALID_CONFIG", `Db server ${dbServer.id} database password is not configured`, 500);
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
