import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { SshTunnelPool, type Tunnel } from "./ssh.js";
import type { BackupConfig, BackupJobConfig, DbServerConfig, GatewayConfig } from "./types.js";

interface BackupLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

interface BackupRecord {
  jobId: string;
  dbServerId: string;
  fileName: string;
  createdAt: string;
  databaseType: DbServerConfig["type"];
}

const plainLogger = {
  info: (message: string) => console.info(message)
};

export async function runBackupJob(
  gatewayConfig: GatewayConfig,
  backupConfig: BackupConfig,
  jobId: string,
  logger: BackupLogger = console
): Promise<BackupRecord> {
  if (!backupConfig.configured) {
    throw new Error("Backup is not configured. Create config/backup.yaml to enable backup jobs.");
  }

  const job = backupConfig.jobs.find((candidate) => candidate.id === jobId);
  if (!job) {
    throw new Error(`Backup job not found: ${jobId}`);
  }

  return runBackupJobConfig(gatewayConfig, backupConfig, job, logger);
}

export async function runBackupJobConfig(
  gatewayConfig: GatewayConfig,
  backupConfig: BackupConfig,
  job: BackupJobConfig,
  logger: BackupLogger = console
): Promise<BackupRecord> {
  const dbServer = gatewayConfig.dbServers.find((candidate) => candidate.id === job.dbServerId);
  if (!dbServer) {
    throw new Error(`Db server not found for backup job ${job.id}: ${job.dbServerId}`);
  }

  await fs.mkdir(job.outputDir, { recursive: true });
  const timestamp = formatBackupTimestamp(new Date(), backupConfig.defaults.timezone);
  const extension = dbServer.type === "postgres" ? "dump" : "sql";
  const finalFileName = `${job.id}.${timestamp}.${extension}`;
  const tmpPath = path.join(job.outputDir, `${finalFileName}.tmp`);
  const finalPath = path.join(job.outputDir, finalFileName);
  const metadataPath = metadataPathFor(finalPath);
  const sshTunnelPool = new SshTunnelPool(gatewayConfig.sshServers, plainLogger);
  const forward = dbServer.sshServerId
    ? await startLocalForward(dbServer, sshTunnelPool)
    : undefined;

  const host = forward ? "127.0.0.1" : dbServer.database.host;
  const port = forward ? forward.port : dbServer.database.port;
  logger.info(`backup start ${job.id} -> ${finalPath}`);

  try {
    if (dbServer.type === "postgres") {
      await runPostgresDump(backupConfig, job, dbServer, host, port, tmpPath);
    } else {
      await runMysqlDump(backupConfig, job, dbServer, host, port, tmpPath);
    }

    const record: BackupRecord = {
      jobId: job.id,
      dbServerId: job.dbServerId,
      fileName: finalFileName,
      createdAt: new Date().toISOString(),
      databaseType: dbServer.type
    };
    await fs.rename(tmpPath, finalPath);
    await fs.writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    await updateLatestPointers(job.outputDir, job.id);
    await applyRetention(job, backupConfig.defaults.timezone);
    logger.info(`backup complete ${job.id} -> ${finalPath}`);
    return record;
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    logger.error(`backup failed ${job.id}`, error);
    throw error;
  } finally {
    await forward?.close();
    await sshTunnelPool.closeAll();
  }
}

async function runPostgresDump(
  backupConfig: BackupConfig,
  job: BackupJobConfig,
  dbServer: DbServerConfig,
  host: string,
  port: number,
  outputPath: string
) {
  const args = [
    "-h", host,
    "-p", String(port),
    "-U", dbServer.database.user,
    "-d", dbServer.database.database,
    "--format=custom",
    "--file", outputPath,
    ...job.dumpOptions
  ];
  await runCommand(backupConfig.defaults.binaries.pgDump, args, {
    PGPASSWORD: resolveDatabasePassword(dbServer)
  });
}

async function runMysqlDump(
  backupConfig: BackupConfig,
  job: BackupJobConfig,
  dbServer: DbServerConfig,
  host: string,
  port: number,
  outputPath: string
) {
  const defaultsPath = `${outputPath}.defaults.cnf`;
  const defaults = [
    "[client]",
    `host=${host}`,
    `port=${port}`,
    `user=${dbServer.database.user}`,
    `password=${resolveDatabasePassword(dbServer)}`,
    ""
  ].join("\n");
  await fs.writeFile(defaultsPath, defaults, { mode: 0o600 });
  const output = await fs.open(outputPath, "w", 0o600);
  try {
    const args = [
      `--defaults-extra-file=${defaultsPath}`,
      "--single-transaction",
      "--routines",
      "--triggers",
      "--events",
      ...job.dumpOptions,
      dbServer.database.database
    ];
    await runCommand(backupConfig.defaults.binaries.mySqlDump, args, {}, output.fd);
  } finally {
    await output.close();
    await fs.rm(defaultsPath, { force: true }).catch(() => undefined);
  }
}

function runCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
  stdoutFd?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", stdoutFd ?? "inherit", "pipe"]
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function startLocalForward(dbServer: DbServerConfig, sshTunnelPool: SshTunnelPool) {
  if (!dbServer.sshServerId) {
    return undefined;
  }

  const activeTunnels = new Set<Tunnel>();
  const server = net.createServer((socket) => {
    void sshTunnelPool.openTunnel(
      dbServer.sshServerId as string,
      dbServer.database.host,
      dbServer.database.port,
      dbServer.connectTimeoutMs ?? 10_000
    ).then((tunnel) => {
      activeTunnels.add(tunnel);
      socket.once("close", () => {
        activeTunnels.delete(tunnel);
        tunnel.close();
      });
      tunnel.stream.once("close", () => socket.destroy());
      socket.pipe(tunnel.stream);
      tunnel.stream.pipe(socket);
    }).catch((error) => {
      socket.destroy(error instanceof Error ? error : undefined);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate local backup tunnel port");
  }

  return {
    port: address.port,
    close: async () => {
      for (const tunnel of activeTunnels) {
        tunnel.close();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

async function updateLatestPointers(outputDir: string, jobId: string) {
  const records = await listBackupRecords(outputDir, jobId);
  const latest = records.at(0);
  const previous = records.at(1);
  if (latest) {
    await updatePointer(outputDir, "latest", latest.fileName);
  }
  if (previous) {
    await updatePointer(outputDir, "previous", previous.fileName);
  }
}

async function updatePointer(outputDir: string, pointerName: string, fileName: string) {
  const pointerPath = path.join(outputDir, pointerName);
  await fs.rm(pointerPath, { force: true }).catch(() => undefined);
  try {
    await fs.symlink(fileName, pointerPath);
  } catch {
    await fs.writeFile(`${pointerPath}.txt`, `${fileName}\n`, { mode: 0o600 });
  }
}

async function applyRetention(job: BackupJobConfig, timezone: string) {
  const records = await listBackupRecords(job.outputDir, job.id);
  const keep = new Set<string>();
  for (const record of records.slice(0, job.retention.latest + job.retention.previous)) {
    keep.add(record.fileName);
  }
  keepByBucket(records, keep, job.retention.daily, (date) => localDateKey(date, timezone));
  keepByBucket(records, keep, job.retention.weekly, (date) => localIsoWeekKey(date, timezone));
  keepByBucket(records, keep, job.retention.monthly, (date) => localMonthKey(date, timezone));

  for (const record of records) {
    if (keep.has(record.fileName)) {
      continue;
    }
    const backupPath = path.join(job.outputDir, record.fileName);
    await fs.rm(backupPath, { force: true });
    await fs.rm(metadataPathFor(backupPath), { force: true });
  }
}

function keepByBucket(
  records: BackupRecord[],
  keep: Set<string>,
  count: number,
  bucket: (date: Date) => string
) {
  const seen = new Set<string>();
  for (const record of records) {
    const key = bucket(new Date(record.createdAt));
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (seen.size <= count) {
      keep.add(record.fileName);
    }
  }
}

async function listBackupRecords(outputDir: string, jobId: string): Promise<BackupRecord[]> {
  const entries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
  const records: BackupRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".metadata.json")) {
      continue;
    }
    try {
      const raw = await fs.readFile(path.join(outputDir, entry.name), "utf8");
      const record = JSON.parse(raw) as BackupRecord;
      if (record.jobId === jobId && record.fileName) {
        records.push(record);
      }
    } catch {
      // Ignore malformed metadata not created by a successful SQLTunnel backup.
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function metadataPathFor(filePath: string): string {
  return `${filePath}.metadata.json`;
}

function formatBackupTimestamp(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}${value("month")}${value("day")}T${value("hour")}${value("minute")}${value("second")}`;
}

function localDateKey(date: Date, timezone: string): string {
  const parts = localDateParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function localMonthKey(date: Date, timezone: string): string {
  const parts = localDateParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function localIsoWeekKey(date: Date, timezone: string): string {
  const parts = localDateParts(date, timezone);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day")
  };
}

function resolveDatabasePassword(dbServer: DbServerConfig): string {
  if (dbServer.database.password !== undefined) {
    return dbServer.database.password;
  }
  throw new Error(`Db server ${dbServer.id} database password is not configured`);
}
