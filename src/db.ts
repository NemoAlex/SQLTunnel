import mysql from "mysql2/promise";
import pg from "pg";
import { GatewayError } from "./errors.js";
import { formatSqlLog } from "./log-format.js";
import type { SshTunnelPool, Tunnel } from "./ssh.js";
import { withRowLimit } from "./sql.js";
import type { DbServerConfig, QueryResult } from "./types.js";

pg.types.setTypeParser(114, (value) => value);
pg.types.setTypeParser(3802, (value) => value);

interface QueryLogger {
  info(message: string): void;
}

export interface ExecuteQueryOptions {
  dbServer: DbServerConfig;
  sshTunnelPool: SshTunnelPool;
  sql: string;
  params: unknown[];
  maxRows: number;
  queryTimeoutMs: number;
  connectTimeoutMs: number;
  logger?: QueryLogger;
}

export async function executeQuery(options: ExecuteQueryOptions): Promise<QueryResult> {
  const started = Date.now();
  const limitedSql = withRowLimit(options.sql, options.maxRows);
  options.logger?.info(formatSqlLog(options.dbServer.id, limitedSql));

  if (options.dbServer.type === "mysql") {
    const result = await runMysql(options, limitedSql);
    return {
      ...result,
      durationMs: Date.now() - started,
      dbServerId: options.dbServer.id
    };
  }

  const result = await runPostgres(options, limitedSql);
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
    client = await runConnectStep(
      () => mysql.createConnection({
        host: tunnel ? undefined : options.dbServer.database.host,
        port: tunnel ? undefined : options.dbServer.database.port,
        user: options.dbServer.database.user,
        password: resolveDatabasePassword(options.dbServer),
        database: options.dbServer.database.database,
        stream: tunnel?.stream,
        namedPlaceholders: false,
        multipleStatements: false,
        connectTimeout: options.connectTimeoutMs
      }),
      options.connectTimeoutMs,
      "Timed out while connecting to database"
    );

    const activeClient = client;
    const [rows, fields] = await runSqlQuery(() => runWithTimeout(
      activeClient.query({ sql, timeout: options.queryTimeoutMs }, options.params),
      options.queryTimeoutMs,
      "QUERY_TIMEOUT",
      "Database query timed out",
      408
    ));
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
    statement_timeout: options.queryTimeoutMs,
    query_timeout: options.queryTimeoutMs,
    connectionTimeoutMillis: options.connectTimeoutMs,
    stream: tunnel ? () => tunnel.stream : undefined
  });

  try {
    await runConnectStep(() => client.connect(), options.connectTimeoutMs, "Timed out while connecting to database");
    const result = await runSqlQuery(() => runWithTimeout(
      client.query(sql, options.params),
      options.queryTimeoutMs,
      "QUERY_TIMEOUT",
      "Database query timed out",
      408
    ));
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
    options.dbServer.database.port,
    options.connectTimeoutMs
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

async function runConnectStep<T>(connect: () => Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  try {
    return await runWithTimeout(connect(), timeoutMs, "CONNECT_TIMEOUT", timeoutMessage, 504);
  } catch (error) {
    if (error instanceof GatewayError) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new GatewayError("CONNECT_TIMEOUT", timeoutMessage, 504);
    }
    throw new GatewayError("DB_CONNECT_FAILED", getErrorMessage(error), 502);
  }
}

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  code: string,
  message: string,
  statusCode: number
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new GatewayError(code, message, statusCode)), timeoutMs);
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
    if (isQueryTimeoutError(error)) {
      throw new GatewayError("QUERY_TIMEOUT", "Database query timed out", 408);
    }
    throw new GatewayError("QUERY_FAILED", getErrorMessage(error), 400);
  }
}

function isQueryTimeoutError(error: unknown): boolean {
  if (isTimeoutError(error)) {
    return true;
  }
  if (error && typeof error === "object" && "code" in error && error.code === "57014") {
    return true;
  }
  return getErrorMessage(error).toLowerCase().includes("statement timeout");
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  if (code === "ETIMEDOUT" || code === "PROTOCOL_SEQUENCE_TIMEOUT") {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return message.includes("timeout") || message.includes("timed out");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Query failed";
}
