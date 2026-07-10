import { AuthService, isReadOnlySql } from "./auth.js";
import { executeQuery } from "./db.js";
import { GatewayError } from "./errors.js";
import { getSchemaSql, MAX_SCHEMA_COLUMNS, normalizeDatabaseSchema } from "./schema.js";
import { normalizeParams, normalizeSql, resolveMaxRows } from "./sql.js";
import { SshTunnelPool } from "./ssh.js";
import type {
  AuthContext,
  DatabaseSchemaResult,
  DescribeTableSchemaResult,
  GatewayConfig,
  ListDatabasesSchemaResult,
  ListTablesSchemaResult,
  QueryRequest,
  QueryResult,
  SchemaResult
} from "./types.js";

const plainLogger = {
  info: (message: string) => console.info(message)
};

export class GatewayService {
  private readonly auth: AuthService;
  private readonly dbServersById;
  private readonly sshTunnelPool: SshTunnelPool;
  private readonly executeQueryFn: typeof executeQuery;
  private readonly schemaCache = new Map<string, { value: DatabaseSchemaResult; expiresAt: number }>();
  private readonly schemaLoads = new Map<string, Promise<DatabaseSchemaResult>>();
  private readonly schemaGenerations = new Map<string, number>();

  constructor(private readonly config: GatewayConfig, dependencies: { executeQuery?: typeof executeQuery } = {}) {
    this.auth = new AuthService(config);
    this.dbServersById = new Map(config.dbServers.map((dbServer) => [dbServer.id, dbServer]));
    this.sshTunnelPool = new SshTunnelPool(config.sshServers, plainLogger);
    this.executeQueryFn = dependencies.executeQuery ?? executeQuery;
  }

  authenticate(apiKey: unknown): AuthContext {
    return this.auth.authenticate(apiKey);
  }

  listDbServers(context: AuthContext) {
    return context.client.dbServers.map((grant) => {
      const dbServer = this.dbServersById.get(grant.serverId);
      if (!dbServer) {
        throw new GatewayError("INVALID_CONFIG", `Unknown dbServer in client grant: ${grant.serverId}`, 500);
      }

      return {
        id: dbServer.id,
        ...(dbServer.description === undefined ? {} : { description: dbServer.description }),
        type: dbServer.type,
        permission: grant.permission,
        maxRows: resolveEffectiveLimit(dbServer.maxRows ?? this.config.defaults.maxRows, grant.maxRows),
        queryTimeoutMs: resolveEffectiveLimit(
          dbServer.queryTimeoutMs ?? this.config.defaults.queryTimeoutMs,
          grant.queryTimeoutMs
        ),
        connectTimeoutMs: dbServer.connectTimeoutMs ?? this.config.defaults.connectTimeoutMs,
        ssh: Boolean(dbServer.sshServerId)
      };
    });
  }

  async query(context: AuthContext, body: Partial<QueryRequest> | undefined): Promise<QueryResult> {
    if (!body || typeof body.dbServerId !== "string") {
      throw new GatewayError("INVALID_REQUEST", "dbServerId is required");
    }

    const dbServer = this.dbServersById.get(body.dbServerId);
    if (!dbServer) {
      throw new GatewayError("DB_SERVER_NOT_FOUND", `Db server not found: ${body.dbServerId}`, 404);
    }

    const grant = this.auth.getDbServerGrant(context, dbServer);
    const sql = normalizeSql(body.sql);
    const params = normalizeParams(body.params);
    const configuredMaxRows = resolveEffectiveLimit(
      dbServer.maxRows ?? this.config.defaults.maxRows,
      grant.maxRows
    );
    const maxRows = resolveMaxRows(body.maxRows, configuredMaxRows);
    const queryTimeoutMs = resolveEffectiveLimit(
      dbServer.queryTimeoutMs ?? this.config.defaults.queryTimeoutMs,
      grant.queryTimeoutMs
    );
    const connectTimeoutMs = dbServer.connectTimeoutMs ?? this.config.defaults.connectTimeoutMs;

    this.auth.assertWriteAllowed(grant, sql);

    const result = await this.executeQueryFn({
      dbServer,
      sshTunnelPool: this.sshTunnelPool,
      sql,
      params,
      maxRows,
      queryTimeoutMs,
      connectTimeoutMs,
      logger: plainLogger
    });

    if (!isReadOnlySql(sql)) {
      this.invalidateSchemaCache(dbServer.id);
    }

    return result;
  }

  async inspectSchema(context: AuthContext, body: unknown): Promise<SchemaResult> {
    if (!body || typeof body !== "object" || !("operation" in body) || typeof body.operation !== "string") {
      throw new GatewayError("INVALID_REQUEST", "operation is required");
    }

    if (body.operation === "list_databases") {
      return this.listDatabases(context);
    }
    if (body.operation !== "list_tables" && body.operation !== "describe_table") {
      throw new GatewayError(
        "INVALID_REQUEST",
        "operation must be list_databases, list_tables, or describe_table"
      );
    }
    if (!("dbServerId" in body) || typeof body.dbServerId !== "string") {
      throw new GatewayError("INVALID_REQUEST", "dbServerId is required");
    }
    const refresh = "refresh" in body ? body.refresh : undefined;
    if (refresh !== undefined && typeof refresh !== "boolean") {
      throw new GatewayError("INVALID_REQUEST", "refresh must be a boolean");
    }
    if (body.operation === "list_tables") {
      return this.listDatabaseTables(context, body.dbServerId, refresh);
    }
    if (body.operation === "describe_table") {
      if (!("schemaName" in body) || typeof body.schemaName !== "string" || body.schemaName.length === 0) {
        throw new GatewayError("INVALID_REQUEST", "schemaName is required");
      }
      if (!("tableName" in body) || typeof body.tableName !== "string" || body.tableName.length === 0) {
        throw new GatewayError("INVALID_REQUEST", "tableName is required");
      }
      return this.getTableSchema(context, body.dbServerId, body.schemaName, body.tableName, refresh);
    }
    throw new GatewayError("INVALID_REQUEST", "Unsupported schema operation");
  }

  listDatabases(context: AuthContext): ListDatabasesSchemaResult {
    const databases = context.client.dbServers.map((grant) => {
      const dbServer = this.dbServersById.get(grant.serverId);
      if (!dbServer) {
        throw new GatewayError("INVALID_CONFIG", `Unknown dbServer in client grant: ${grant.serverId}`, 500);
      }
      return {
        dbServerId: dbServer.id,
        ...(dbServer.description === undefined ? {} : { description: dbServer.description }),
        databaseName: dbServer.database.database,
        databaseType: dbServer.type,
        permission: grant.permission
      };
    });
    return { operation: "list_databases", databases };
  }

  async listDatabaseTables(
    context: AuthContext,
    dbServerId: string,
    refresh?: boolean
  ): Promise<ListTablesSchemaResult> {
    const schema = await this.getFullSchema(context, dbServerId, refresh);
    return {
      operation: "list_tables",
      dbServerId: schema.dbServerId,
      databaseName: schema.databaseName,
      databaseType: schema.databaseType,
      tables: schema.schemas.flatMap((databaseSchema) =>
        databaseSchema.tables.map((table) => ({
          schemaName: databaseSchema.name,
          tableName: table.name,
          type: table.type,
          ...(table.comment ? { comment: table.comment } : {})
        }))
      ),
      cached: schema.cached,
      cachedAt: schema.cachedAt
    };
  }

  async getTableSchema(
    context: AuthContext,
    dbServerId: string,
    schemaName: string,
    tableName: string,
    refresh?: boolean
  ): Promise<DescribeTableSchemaResult> {
    const schema = await this.getFullSchema(context, dbServerId, refresh);
    const databaseSchema = schema.schemas.find((entry) => entry.name === schemaName);
    const table = databaseSchema?.tables.find((entry) => entry.name === tableName);
    if (!table) {
      throw new GatewayError("TABLE_NOT_FOUND", `Table not found: ${schemaName}.${tableName}`, 404);
    }
    return {
      operation: "describe_table",
      dbServerId: schema.dbServerId,
      databaseName: schema.databaseName,
      databaseType: schema.databaseType,
      schemaName,
      table,
      cached: schema.cached,
      cachedAt: schema.cachedAt
    };
  }

  private async getFullSchema(
    context: AuthContext,
    dbServerId: string,
    refresh?: boolean
  ): Promise<DatabaseSchemaResult> {
    if (typeof dbServerId !== "string" || dbServerId.length === 0) {
      throw new GatewayError("INVALID_REQUEST", "dbServerId is required");
    }
    if (refresh !== undefined && typeof refresh !== "boolean") {
      throw new GatewayError("INVALID_REQUEST", "refresh must be a boolean");
    }

    const dbServer = this.dbServersById.get(dbServerId);
    if (!dbServer) {
      throw new GatewayError("DB_SERVER_NOT_FOUND", `Db server not found: ${dbServerId}`, 404);
    }
    const grant = this.auth.getDbServerGrant(context, dbServer);

    const loading = this.schemaLoads.get(dbServer.id);
    if (loading) {
      return loading;
    }

    if (!refresh) {
      const cached = this.schemaCache.get(dbServer.id);
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.value, cached: true };
      }
      this.schemaCache.delete(dbServer.id);

    }

    const loadPromise = this.loadSchema(dbServer, grant.queryTimeoutMs);
    this.schemaLoads.set(dbServer.id, loadPromise);

    try {
      return await loadPromise;
    } finally {
      if (this.schemaLoads.get(dbServer.id) === loadPromise) {
        this.schemaLoads.delete(dbServer.id);
      }
    }
  }

  async close(): Promise<void> {
    this.schemaCache.clear();
    this.schemaGenerations.clear();
    await this.sshTunnelPool.closeAll();
  }

  private async loadSchema(
    dbServer: GatewayConfig["dbServers"][number],
    clientQueryTimeoutMs: number | undefined
  ): Promise<DatabaseSchemaResult> {
    const generation = this.schemaGenerations.get(dbServer.id) ?? 0;
    const queryTimeoutMs = resolveEffectiveLimit(
      dbServer.queryTimeoutMs ?? this.config.defaults.queryTimeoutMs,
      clientQueryTimeoutMs
    );
    const result = await this.executeQueryFn({
      dbServer,
      sshTunnelPool: this.sshTunnelPool,
      sql: getSchemaSql(dbServer.type),
      params: [],
      maxRows: MAX_SCHEMA_COLUMNS + 1,
      queryTimeoutMs,
      connectTimeoutMs: dbServer.connectTimeoutMs ?? this.config.defaults.connectTimeoutMs,
      logger: plainLogger
    });
    const cachedAt = new Date().toISOString();
    const schema = normalizeDatabaseSchema(
      dbServer.id,
      dbServer.database.database,
      dbServer.type,
      result,
      cachedAt
    );

    if (
      this.config.defaults.schemaCacheTtlMs > 0 &&
      (this.schemaGenerations.get(dbServer.id) ?? 0) === generation
    ) {
      this.schemaCache.set(dbServer.id, {
        value: schema,
        expiresAt: Date.now() + this.config.defaults.schemaCacheTtlMs
      });
    }

    return schema;
  }

  private invalidateSchemaCache(dbServerId: string): void {
    this.schemaCache.delete(dbServerId);
    this.schemaGenerations.set(dbServerId, (this.schemaGenerations.get(dbServerId) ?? 0) + 1);
  }
}

function resolveEffectiveLimit(serverLimit: number, clientLimit: number | undefined): number {
  if (clientLimit === undefined) {
    return serverLimit;
  }
  return Math.min(serverLimit, clientLimit);
}
