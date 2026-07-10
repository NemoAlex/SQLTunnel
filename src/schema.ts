import { GatewayError } from "./errors.js";
import type {
  DatabaseSchema,
  DatabaseSchemaResult,
  DatabaseType,
  QueryResult,
  SchemaColumn,
  SchemaTable
} from "./types.js";

export const MAX_SCHEMA_COLUMNS = 20000;

const MYSQL_SCHEMA_SQL = `
select
  cast(t.table_schema as char) as schema_name,
  cast(t.table_name as char) as table_name,
  cast(t.table_type as char) as table_type,
  t.table_comment,
  cast(c.column_name as char) as column_name,
  cast(c.column_type as char) as data_type,
  c.is_nullable,
  c.column_default,
  c.column_comment,
  c.ordinal_position,
  coalesce(k.is_primary, 0) as is_primary,
  coalesce(k.is_unique, 0) as is_unique
from information_schema.tables t
join information_schema.columns c
  on c.table_schema = t.table_schema
 and c.table_name = t.table_name
left join (
  select
    kcu.table_schema,
    kcu.table_name,
    kcu.column_name,
    max(case when tc.constraint_type = 'PRIMARY KEY' then 1 else 0 end) as is_primary,
    max(case when tc.constraint_type in ('PRIMARY KEY', 'UNIQUE') then 1 else 0 end) as is_unique
  from information_schema.key_column_usage kcu
  join information_schema.table_constraints tc
    on tc.constraint_schema = kcu.constraint_schema
   and tc.table_schema = kcu.table_schema
   and tc.table_name = kcu.table_name
   and tc.constraint_name = kcu.constraint_name
  where kcu.table_schema = database()
  group by kcu.table_schema, kcu.table_name, kcu.column_name
) k
  on k.table_schema = c.table_schema
 and k.table_name = c.table_name
 and k.column_name = c.column_name
where t.table_schema = database()
  and t.table_type in ('BASE TABLE', 'VIEW', 'SYSTEM VIEW')
order by t.table_schema, t.table_name, c.ordinal_position`;

const POSTGRES_SCHEMA_SQL = `
select
  n.nspname as schema_name,
  c.relname as table_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned_table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'f' then 'foreign_table'
  end as table_type,
  obj_description(c.oid, 'pg_class') as table_comment,
  a.attname as column_name,
  format_type(a.atttypid, a.atttypmod) as data_type,
  not a.attnotnull as is_nullable,
  pg_get_expr(ad.adbin, ad.adrelid) as column_default,
  col_description(c.oid, a.attnum) as column_comment,
  a.attnum as ordinal_position,
  exists (
    select 1 from pg_index i
    where i.indrelid = c.oid
      and i.indisprimary
      and a.attnum = any(i.indkey)
  ) as is_primary,
  exists (
    select 1 from pg_index i
    where i.indrelid = c.oid
      and i.indisunique
      and a.attnum = any(i.indkey)
  ) as is_unique
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and a.attnum > 0
  and not a.attisdropped
  and n.nspname not in ('pg_catalog', 'information_schema')
  and n.nspname not like 'pg_toast%'
  and n.nspname not like 'pg_temp_%'
order by n.nspname, c.relname, a.attnum`;

export function getSchemaSql(type: DatabaseType): string {
  return type === "mysql" ? MYSQL_SCHEMA_SQL : POSTGRES_SCHEMA_SQL;
}

export function normalizeDatabaseSchema(
  dbServerId: string,
  databaseName: string,
  databaseType: DatabaseType,
  result: QueryResult,
  cachedAt: string,
  cached = false
): DatabaseSchemaResult {
  if (result.rowCount > MAX_SCHEMA_COLUMNS) {
    throw new GatewayError(
      "SCHEMA_TOO_LARGE",
      `Database schema exceeds the ${MAX_SCHEMA_COLUMNS} column limit`,
      413
    );
  }

  const schemas = new Map<string, DatabaseSchema>();
  const tables = new Map<string, SchemaTable>();

  for (const row of result.rows) {
    const schemaName = requireRowString(row.schema_name, "schema_name");
    const tableName = requireRowString(row.table_name, "table_name");
    const tableKey = `${schemaName}\u0000${tableName}`;

    let schema = schemas.get(schemaName);
    if (!schema) {
      schema = { name: schemaName, tables: [] };
      schemas.set(schemaName, schema);
    }

    let table = tables.get(tableKey);
    if (!table) {
      table = {
        name: tableName,
        type: normalizeTableType(row.table_type, databaseType),
        ...optionalText("comment", row.table_comment),
        columns: []
      };
      tables.set(tableKey, table);
      schema.tables.push(table);
    }

    const column: SchemaColumn = {
      name: requireRowString(row.column_name, "column_name"),
      dataType: requireRowString(row.data_type, "data_type"),
      nullable: toBoolean(row.is_nullable),
      ordinalPosition: toInteger(row.ordinal_position, "ordinal_position"),
      primaryKey: toBoolean(row.is_primary),
      unique: toBoolean(row.is_unique),
      ...optionalText("defaultValue", row.column_default),
      ...optionalText("comment", row.column_comment)
    };
    table.columns.push(column);
  }

  return {
    dbServerId,
    databaseName,
    databaseType,
    schemas: [...schemas.values()],
    cached,
    cachedAt
  };
}

function normalizeTableType(value: unknown, databaseType: DatabaseType): SchemaTable["type"] {
  const normalized = String(value).toLowerCase().replaceAll(" ", "_");
  if (databaseType === "mysql") {
    return normalized === "base_table" ? "table" : "view";
  }
  if (
    normalized === "table" ||
    normalized === "partitioned_table" ||
    normalized === "view" ||
    normalized === "materialized_view" ||
    normalized === "foreign_table"
  ) {
    return normalized;
  }
  throw new GatewayError("SCHEMA_QUERY_FAILED", `Unsupported table type: ${String(value)}`, 500);
}

function requireRowString(value: unknown, field: string): string {
  const normalized = Buffer.isBuffer(value) ? value.toString("utf8") : value;
  if (typeof normalized !== "string" || normalized.length === 0) {
    throw new GatewayError("SCHEMA_QUERY_FAILED", `Schema query returned invalid ${field}`, 500);
  }
  return normalized;
}

function toInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new GatewayError("SCHEMA_QUERY_FAILED", `Schema query returned invalid ${field}`, 500);
  }
  return number;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function optionalText<Key extends "comment" | "defaultValue">(key: Key, value: unknown): Partial<Record<Key, string>> {
  if (value === null || value === undefined || (key === "comment" && value === "")) {
    return {};
  }
  return { [key]: String(value) } as Partial<Record<Key, string>>;
}
