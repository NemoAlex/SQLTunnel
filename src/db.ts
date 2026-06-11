import mysql from "mysql2/promise";
import pg from "pg";
import { GatewayError } from "./errors.js";
import { openSshTunnel } from "./ssh.js";
import { withRowLimit } from "./sql.js";
import type { DbServerConfig, QueryResult } from "./types.js";

export interface ExecuteQueryOptions {
  connection: DbServerConfig;
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
  const tunnel = await openSshTunnel(options.connection);
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

    const [rows, fields] = await client.query({ sql, timeout: options.timeoutMs }, options.params);
    const normalizedRows = Array.isArray(rows) ? rows.slice(0, options.maxRows) : [];
    return {
      columns: normalizeMysqlColumns(fields),
      rows: normalizedRows as Record<string, unknown>[],
      rowCount: normalizedRows.length
    };
  } finally {
    await client?.end().catch(() => undefined);
    tunnel?.close();
  }
}

async function runPostgres(options: ExecuteQueryOptions, sql: string) {
  const tunnel = await openSshTunnel(options.connection);
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
    const result = await client.query(sql, options.params);
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
