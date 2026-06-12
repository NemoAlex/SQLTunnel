import { GatewayError } from "./errors.js";

export function normalizeSql(sql: unknown): string {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new GatewayError("INVALID_REQUEST", "sql must be a non-empty string");
  }
  return sql.trim();
}

export function normalizeParams(params: unknown): unknown[] {
  if (params === undefined) {
    return [];
  }
  if (!Array.isArray(params)) {
    throw new GatewayError("INVALID_REQUEST", "params must be an array");
  }
  return params;
}

export function resolveMaxRows(requested: unknown, configuredMaxRows: number): number {
  if (requested === undefined) {
    return configuredMaxRows;
  }
  if (!Number.isInteger(requested) || Number(requested) <= 0) {
    throw new GatewayError("INVALID_REQUEST", "maxRows must be a positive integer");
  }
  return Math.min(Number(requested), configuredMaxRows);
}

export function normalizeResponseFormat(responseFormat: unknown): "raw" | "json" {
  if (responseFormat === undefined) {
    return "raw";
  }
  if (responseFormat !== "raw" && responseFormat !== "json") {
    throw new GatewayError("INVALID_REQUEST", "responseFormat must be raw or json");
  }
  return responseFormat;
}

export function withRowLimit(sql: string, maxRows: number): string {
  const trimmed = sql.trim().replace(/;+$/, "");
  const normalized = trimmed.toLowerCase();
  if (/^(select|with)\b/.test(normalized)) {
    return `select * from (${trimmed}) as sqltunnel_limited limit ${maxRows}`;
  }
  return trimmed;
}
