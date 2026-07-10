import assert from "node:assert/strict";
import test from "node:test";
import { GatewayService } from "../src/gateway-service.js";
import { getSchemaSql, normalizeDatabaseSchema } from "../src/schema.js";
import type { GatewayConfig, QueryResult } from "../src/types.js";

const gatewayConfig: GatewayConfig = {
  defaults: {
    maxRows: 100,
    queryTimeoutMs: 1000,
    connectTimeoutMs: 1000,
    schemaCacheTtlMs: 300000
  },
  sshServers: [],
  dbServers: [
    {
      id: "mysql-test",
      type: "mysql",
      database: {
        host: "127.0.0.1",
        port: 3306,
        user: "test",
        password: "test",
        database: "shop"
      }
    }
  ],
  clients: [
    {
      id: "schema-test",
      apiKey: "schema-key",
      dbServers: [{ serverId: "mysql-test", permission: "write" }]
    }
  ]
};

const mysqlSchemaRows = [
  {
    schema_name: "shop",
    table_name: "users",
    table_type: "BASE TABLE",
    table_comment: "Application users",
    column_name: "id",
    data_type: "bigint unsigned",
    is_nullable: "NO",
    column_default: null,
    column_comment: "Primary identifier",
    ordinal_position: 1,
    is_primary: 1,
    is_unique: 1
  },
  {
    schema_name: "shop",
    table_name: "users",
    table_type: "BASE TABLE",
    table_comment: "Application users",
    column_name: "email",
    data_type: "varchar(255)",
    is_nullable: "YES",
    column_default: "",
    column_comment: "",
    ordinal_position: 2,
    is_primary: 0,
    is_unique: 1
  },
  {
    schema_name: "shop",
    table_name: "active_users",
    table_type: "VIEW",
    table_comment: "",
    column_name: "id",
    data_type: "bigint unsigned",
    is_nullable: "NO",
    column_default: null,
    column_comment: "",
    ordinal_position: 1,
    is_primary: 0,
    is_unique: 0
  }
];

test("normalizes MySQL schema metadata", () => {
  const queryResult: QueryResult = {
    columns: [],
    rows: mysqlSchemaRows,
    rowCount: 3,
    durationMs: 5,
    dbServerId: "mysql-test"
  };

  const result = normalizeDatabaseSchema("mysql-test", "shop", "mysql", queryResult, "2026-07-10T00:00:00.000Z");

  assert.equal(result.databaseType, "mysql");
  assert.equal(result.cached, false);
  assert.equal(result.schemas[0].name, "shop");
  const users = result.schemas[0].tables.find((table) => table.name === "users");
  const activeUsers = result.schemas[0].tables.find((table) => table.name === "active_users");
  assert.equal(activeUsers?.type, "view");
  assert.equal(users?.type, "table");
  assert.deepEqual(users?.columns[0], {
    name: "id",
    dataType: "bigint unsigned",
    nullable: false,
    ordinalPosition: 1,
    primaryKey: true,
    unique: true,
    comment: "Primary identifier"
  });
  assert.equal(users?.columns[1].nullable, true);
  assert.equal(users?.columns[1].defaultValue, "");
});

test("normalizes binary MySQL-compatible schema identifiers", () => {
  const row = mysqlSchemaRows[0];
  const queryResult: QueryResult = {
    columns: [],
    rows: [
      {
        ...row,
        schema_name: Buffer.from(row.schema_name),
        table_name: Buffer.from(row.table_name),
        column_name: Buffer.from(row.column_name),
        data_type: Buffer.from(row.data_type)
      }
    ],
    rowCount: 1,
    durationMs: 5,
    dbServerId: "mysql-test"
  };

  const result = normalizeDatabaseSchema("mysql-test", "shop", "mysql", queryResult, "2026-07-10T00:00:00.000Z");

  assert.equal(result.schemas[0].name, "shop");
  assert.equal(result.schemas[0].tables[0].name, "users");
  assert.equal(result.schemas[0].tables[0].columns[0].name, "id");
  assert.equal(result.schemas[0].tables[0].columns[0].dataType, "bigint unsigned");
});

test("normalizes PostgreSQL schema metadata", () => {
  const queryResult: QueryResult = {
    columns: [],
    rows: [
      {
        schema_name: "public",
        table_name: "events",
        table_type: "partitioned_table",
        table_comment: null,
        column_name: "created_at",
        data_type: "timestamp with time zone",
        is_nullable: false,
        column_default: "now()",
        column_comment: null,
        ordinal_position: 1,
        is_primary: false,
        is_unique: false
      },
      {
        schema_name: "reporting",
        table_name: "daily_sales",
        table_type: "materialized_view",
        table_comment: "Daily totals",
        column_name: "day",
        data_type: "date",
        is_nullable: true,
        column_default: null,
        column_comment: null,
        ordinal_position: 1,
        is_primary: false,
        is_unique: true
      }
    ],
    rowCount: 2,
    durationMs: 7,
    dbServerId: "pg-test"
  };

  const result = normalizeDatabaseSchema("pg-test", "app", "postgres", queryResult, "2026-07-10T00:00:00.000Z");

  assert.deepEqual(result.schemas.map((schema) => schema.name), ["public", "reporting"]);
  assert.equal(result.schemas[0].tables[0].type, "partitioned_table");
  assert.equal(result.schemas[0].tables[0].columns[0].defaultValue, "now()");
  assert.equal(result.schemas[1].tables[0].type, "materialized_view");
});

test("uses engine-specific metadata catalogs", () => {
  assert.match(getSchemaSql("mysql"), /information_schema\.columns/i);
  assert.match(getSchemaSql("mysql"), /database\(\)/i);
  assert.match(getSchemaSql("mysql"), /cast\(t\.table_name as char\) as table_name/i);
  assert.match(getSchemaSql("mysql"), /c\.ordinal_position as ordinal_position/i);
  assert.match(getSchemaSql("mysql"), /c\.is_nullable as is_nullable/i);
  assert.match(getSchemaSql("postgres"), /pg_class/i);
  assert.match(getSchemaSql("postgres"), /pg_catalog/);
});

test("caches schema metadata, supports refresh, and invalidates after writes", async () => {
  let schemaQueries = 0;
  const gateway = new GatewayService(gatewayConfig, {
    executeQuery: async (options) => {
      if (options.sql.includes("information_schema.tables")) {
        schemaQueries += 1;
        return {
          columns: [],
          rows: mysqlSchemaRows,
          rowCount: mysqlSchemaRows.length,
          durationMs: 1,
          dbServerId: options.dbServer.id
        };
      }
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs: 1,
        dbServerId: options.dbServer.id
      };
    }
  });
  const context = gateway.authenticate("schema-key");

  const databases = gateway.listDatabases(context);
  assert.deepEqual(databases.databases[0], {
    dbServerId: "mysql-test",
    databaseName: "shop",
    databaseType: "mysql",
    permission: "write"
  });

  const first = await gateway.listDatabaseTables(context, "mysql-test");
  const second = await gateway.listDatabaseTables(context, "mysql-test");
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual(first.tables.map((table) => `${table.schemaName}.${table.tableName}`), ["shop.users", "shop.active_users"]);
  assert.equal(schemaQueries, 1);

  const refreshed = await gateway.listDatabaseTables(context, "mysql-test", true);
  assert.equal(refreshed.cached, false);
  assert.equal(schemaQueries, 2);

  const table = await gateway.getTableSchema(context, "mysql-test", "shop", "users");
  assert.equal(table.table.name, "users");
  assert.equal(table.table.columns.length, 2);
  assert.equal(table.cached, true);

  await gateway.query(context, { dbServerId: "mysql-test", sql: "create table cache_test (id int)" });
  const afterWrite = await gateway.listDatabaseTables(context, "mysql-test");
  assert.equal(afterWrite.cached, false);
  assert.equal(schemaQueries, 3);

  await gateway.close();
});
