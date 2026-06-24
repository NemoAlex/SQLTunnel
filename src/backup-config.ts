import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { GatewayError } from "./errors.js";
import type {
  BackupConfig,
  BackupDefaultsConfig,
  BackupJobConfig,
  BackupRetentionConfig,
  GatewayConfig
} from "./types.js";

const DEFAULT_BACKUP_CONFIG_PATH = "config/backup.yaml";

type PartialBackupConfig = Partial<Omit<BackupConfig, "configured" | "defaults" | "jobs">> & {
  defaults?: Partial<BackupDefaultsConfig> & {
    binaries?: Partial<BackupDefaultsConfig["binaries"]>;
    retention?: Partial<BackupRetentionConfig>;
  };
  jobs?: Array<Partial<Omit<BackupJobConfig, "retention" | "dumpOptions">> & {
    retention?: Partial<BackupRetentionConfig>;
    dumpOptions?: unknown[];
  }>;
};

export function loadBackupConfig(
  gatewayConfig: GatewayConfig,
  configPath = process.env.SQLTUNNEL_BACKUP_CONFIG ?? DEFAULT_BACKUP_CONFIG_PATH
): BackupConfig {
  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    return emptyBackupConfig();
  }

  const parsed = YAML.parse(fs.readFileSync(absolutePath, "utf8")) as PartialBackupConfig;
  const configDir = path.dirname(absolutePath);
  const defaults: BackupDefaultsConfig = {
    timezone: parsed.defaults?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    outputDir: resolveConfigPath(parsed.defaults?.outputDir ?? "backups", configDir),
    binaries: {
      pgDump: parsed.defaults?.binaries?.pgDump ?? "pg_dump",
      mySqlDump: parsed.defaults?.binaries?.mySqlDump ?? "mysqldump"
    },
    retention: normalizeRetention(parsed.defaults?.retention)
  };
  const config: BackupConfig = {
    version: parsed.version ?? 1,
    configured: true,
    defaults,
    jobs: (parsed.jobs ?? []).map((job) => normalizeJob(job, defaults, configDir))
  };

  validateBackupConfig(config, gatewayConfig);
  return config;
}

function emptyBackupConfig(): BackupConfig {
  return {
    version: 1,
    configured: false,
    defaults: {
      timezone: "UTC",
      outputDir: path.resolve("backups"),
      binaries: {
        pgDump: "pg_dump",
        mySqlDump: "mysqldump"
      },
      retention: normalizeRetention()
    },
    jobs: []
  };
}

function normalizeJob(
  job: Partial<Omit<BackupJobConfig, "retention" | "dumpOptions">> & {
    retention?: Partial<BackupRetentionConfig>;
    dumpOptions?: unknown[];
  },
  defaults: BackupDefaultsConfig,
  configDir: string
): BackupJobConfig {
  return {
    id: job.id ?? "",
    enabled: job.enabled ?? true,
    dbServerId: job.dbServerId ?? "",
    schedule: job.schedule ?? "",
    outputDir: resolveConfigPath(job.outputDir ?? defaults.outputDir, configDir),
    retention: normalizeRetention(job.retention, defaults.retention),
    dumpOptions: (job.dumpOptions ?? []).map((option) => String(option))
  };
}

function normalizeRetention(
  retention?: Partial<BackupRetentionConfig>,
  defaults?: BackupRetentionConfig
): BackupRetentionConfig {
  return {
    latest: retention?.latest ?? defaults?.latest ?? 1,
    previous: retention?.previous ?? defaults?.previous ?? 1,
    daily: retention?.daily ?? defaults?.daily ?? 7,
    weekly: retention?.weekly ?? defaults?.weekly ?? 4,
    monthly: retention?.monthly ?? defaults?.monthly ?? 3
  };
}

function validateBackupConfig(config: BackupConfig, gatewayConfig: GatewayConfig) {
  if (config.version !== 1) {
    throw new GatewayError("INVALID_CONFIG", "backup.version must be 1", 500);
  }
  requireString(config.defaults.timezone, "backup.defaults.timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: config.defaults.timezone }).format(new Date());
  } catch {
    throw new GatewayError("INVALID_CONFIG", `Invalid backup.defaults.timezone: ${config.defaults.timezone}`, 500);
  }
  requireString(config.defaults.outputDir, "backup.defaults.outputDir");
  requireString(config.defaults.binaries.pgDump, "backup.defaults.binaries.pgDump");
  requireString(config.defaults.binaries.mySqlDump, "backup.defaults.binaries.mySqlDump");
  validateRetention(config.defaults.retention, "backup.defaults.retention");

  const dbServerIds = new Set(gatewayConfig.dbServers.map((dbServer) => dbServer.id));
  const jobIds = new Set<string>();
  for (const job of config.jobs) {
    requireString(job.id, "backup.jobs[].id");
    if (jobIds.has(job.id)) {
      throw new GatewayError("INVALID_CONFIG", `Duplicate backup job id: ${job.id}`, 500);
    }
    jobIds.add(job.id);
    if (typeof job.enabled !== "boolean") {
      throw new GatewayError("INVALID_CONFIG", `backup job ${job.id}.enabled must be boolean`, 500);
    }
    requireString(job.dbServerId, `backup.jobs[${job.id}].dbServerId`);
    if (!dbServerIds.has(job.dbServerId)) {
      throw new GatewayError("INVALID_CONFIG", `backup job ${job.id} references unknown dbServer ${job.dbServerId}`, 500);
    }
    requireString(job.schedule, `backup.jobs[${job.id}].schedule`);
    validateCron(job.schedule, `backup.jobs[${job.id}].schedule`);
    requireString(job.outputDir, `backup.jobs[${job.id}].outputDir`);
    validateRetention(job.retention, `backup.jobs[${job.id}].retention`);
    if (!Array.isArray(job.dumpOptions)) {
      throw new GatewayError("INVALID_CONFIG", `backup.jobs[${job.id}].dumpOptions must be an array`, 500);
    }
  }
}

function validateRetention(retention: BackupRetentionConfig, label: string) {
  for (const [key, value] of Object.entries(retention)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new GatewayError("INVALID_CONFIG", `${label}.${key} must be a non-negative integer`, 500);
    }
  }
  if (retention.latest < 1) {
    throw new GatewayError("INVALID_CONFIG", `${label}.latest must be at least 1`, 500);
  }
}

function validateCron(schedule: string, label: string) {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new GatewayError("INVALID_CONFIG", `${label} must be a 5-field cron expression`, 500);
  }
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7]
  ] as const;
  for (const [index, field] of fields.entries()) {
    parseCronField(field, ranges[index][0], ranges[index][1], label);
  }
}

export function parseCronField(field: string, min: number, max: number, label: string): Set<number> {
  const values = new Set<number>();
  for (const rawPart of field.split(",")) {
    const [rangePart, stepPart] = rawPart.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step <= 0) {
      throw new GatewayError("INVALID_CONFIG", `${label} has invalid cron step: ${rawPart}`, 500);
    }

    const [start, end] = rangePart === "*"
      ? [min, max]
      : rangePart.includes("-")
        ? rangePart.split("-").map(Number)
        : [Number(rangePart), Number(rangePart)];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new GatewayError("INVALID_CONFIG", `${label} has invalid cron field: ${rawPart}`, 500);
    }
    for (let value = start; value <= end; value += step) {
      values.add(max === 7 && value === 7 ? 0 : value);
    }
  }
  return values;
}

function resolveConfigPath(filePath: string, configDir: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(configDir, filePath);
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GatewayError("INVALID_CONFIG", `${label} must be a non-empty string`, 500);
  }
}
