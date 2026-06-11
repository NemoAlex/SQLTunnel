import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { GatewayError } from "./errors.js";
import type { GatewayConfig, SshConfig, SshServerConfig } from "./types.js";

const DEFAULT_CONFIG_PATH = "config/gateway.yaml";
const DEFAULT_SSH_PORT = 22;
const DEFAULT_IDENTITY_FILES = [
  "id_ed25519",
  "id_ecdsa",
  "id_rsa"
];

interface SshHostConfig {
  hostname?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string[];
}

export function loadConfig(configPath = process.env.SQLTUNNEL_CONFIG ?? DEFAULT_CONFIG_PATH): GatewayConfig {
  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new GatewayError(
      "CONFIG_NOT_FOUND",
      `Config file not found: ${absolutePath}. Create it from config/gateway.example.yaml.`,
      500
    );
  }

  const parsed = YAML.parse(fs.readFileSync(absolutePath, "utf8")) as Partial<GatewayConfig>;
  const configDir = path.dirname(absolutePath);
  const config: GatewayConfig = {
    defaults: {
      maxRows: parsed.defaults?.maxRows ?? 1000,
      timeoutMs: parsed.defaults?.timeoutMs ?? 10000
    },
    sshServers: normalizeSshServers(parsed.sshServers ?? [], configDir),
    clients: parsed.clients ?? [],
    dbServers: parsed.dbServers ?? []
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: GatewayConfig) {
  if (!Number.isInteger(config.defaults.maxRows) || config.defaults.maxRows <= 0) {
    throw new GatewayError("INVALID_CONFIG", "defaults.maxRows must be a positive integer", 500);
  }
  if (!Number.isInteger(config.defaults.timeoutMs) || config.defaults.timeoutMs <= 0) {
    throw new GatewayError("INVALID_CONFIG", "defaults.timeoutMs must be a positive integer", 500);
  }

  const clientIds = new Set<string>();
  const apiKeys = new Set<string>();
  for (const client of config.clients) {
    requireString(client.id, "clients[].id");
    if (clientIds.has(client.id)) {
      throw new GatewayError("INVALID_CONFIG", `Duplicate client id: ${client.id}`, 500);
    }
    clientIds.add(client.id);
    requireString(client.apiKey, `clients[${client.id}].apiKey`);
    if (apiKeys.has(client.apiKey)) {
      throw new GatewayError("INVALID_CONFIG", `Duplicate client apiKey for client ${client.id}`, 500);
    }
    apiKeys.add(client.apiKey);
    if (!Array.isArray(client.dbServers)) {
      throw new GatewayError("INVALID_CONFIG", `client ${client.id} must define dbServers`, 500);
    }
    for (const grant of client.dbServers) {
      requireString(grant.serverId, `clients[${client.id}].dbServers[].serverId`);
      if (grant.permission !== "read" && grant.permission !== "write") {
        throw new GatewayError(
          "INVALID_CONFIG",
          `clients[${client.id}].dbServers[${grant.serverId}].permission must be read or write`,
          500
        );
      }
      if (grant.maxRows !== undefined) {
        requirePositiveInteger(grant.maxRows, `clients[${client.id}].dbServers[${grant.serverId}].maxRows`);
      }
      if (grant.timeoutMs !== undefined) {
        requirePositiveInteger(grant.timeoutMs, `clients[${client.id}].dbServers[${grant.serverId}].timeoutMs`);
      }
    }
  }

  const sshServerIds = new Set<string>();
  for (const sshServer of config.sshServers) {
    requireString(sshServer.id, "sshServers[].id");
    if (sshServerIds.has(sshServer.id)) {
      throw new GatewayError("INVALID_CONFIG", `Duplicate sshServer id: ${sshServer.id}`, 500);
    }
    sshServerIds.add(sshServer.id);
    validateSshConfig(sshServer, `sshServers[${sshServer.id}]`);
    if (sshServer.sshConfigPath !== undefined) {
      requireString(sshServer.sshConfigPath, `sshServers[${sshServer.id}].sshConfigPath`);
    }
    if (sshServer.idleTimeoutMs !== undefined) {
      requirePositiveInteger(sshServer.idleTimeoutMs, `sshServers[${sshServer.id}].idleTimeoutMs`);
    }
  }

  const dbServerIds = new Set<string>();
  for (const dbServer of config.dbServers) {
    requireString(dbServer.id, "dbServers[].id");
    if (dbServerIds.has(dbServer.id)) {
      throw new GatewayError("INVALID_CONFIG", `Duplicate dbServer id: ${dbServer.id}`, 500);
    }
    dbServerIds.add(dbServer.id);
    if (dbServer.type !== "mysql" && dbServer.type !== "postgres") {
      throw new GatewayError("INVALID_CONFIG", `dbServer ${dbServer.id} type must be mysql or postgres`, 500);
    }
    requireString(dbServer.database?.host, `dbServers[${dbServer.id}].database.host`);
    requirePositiveInteger(dbServer.database?.port, `dbServers[${dbServer.id}].database.port`);
    requireString(dbServer.database?.user, `dbServers[${dbServer.id}].database.user`);
    if (!dbServer.database?.password) {
      throw new GatewayError(
        "INVALID_CONFIG",
        `dbServers[${dbServer.id}].database.password must be configured`,
        500
      );
    }
    requireString(dbServer.database.password, `dbServers[${dbServer.id}].database.password`);
    requireString(dbServer.database?.database, `dbServers[${dbServer.id}].database.database`);
    if (dbServer.sshServerId !== undefined) {
      requireString(dbServer.sshServerId, `dbServers[${dbServer.id}].sshServerId`);
      if (!sshServerIds.has(dbServer.sshServerId)) {
        throw new GatewayError(
          "INVALID_CONFIG",
          `dbServer ${dbServer.id} references unknown sshServer ${dbServer.sshServerId}`,
          500
        );
      }
    }
  }

  for (const client of config.clients) {
    const grantServerIds = new Set<string>();
    for (const grant of client.dbServers) {
      if (grantServerIds.has(grant.serverId)) {
        throw new GatewayError(
          "INVALID_CONFIG",
          `client ${client.id} has duplicate dbServer grant ${grant.serverId}`,
          500
        );
      }
      grantServerIds.add(grant.serverId);
      if (!dbServerIds.has(grant.serverId)) {
        throw new GatewayError(
          "INVALID_CONFIG",
          `client ${client.id} references unknown dbServer ${grant.serverId}`,
          500
        );
      }
    }
  }
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

function resolveSshPath(filePath: string, configDir: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  if (filePath.startsWith(".")) {
    return path.resolve(configDir, filePath);
  }
  return path.resolve(os.homedir(), filePath);
}

function validateSshConfig(sshConfig: SshConfig, label: string) {
  requireString(sshConfig.host, `${label}.host`);
  requirePositiveInteger(sshConfig.port, `${label}.port`);
  requireString(sshConfig.username, `${label}.username`);
  if (sshConfig.password !== undefined) {
    requireString(sshConfig.password, `${label}.password`);
  }
  if (sshConfig.privateKeyPath !== undefined) {
    requireString(sshConfig.privateKeyPath, `${label}.privateKeyPath`);
  }
  if (sshConfig.passphrase !== undefined) {
    requireString(sshConfig.passphrase, `${label}.passphrase`);
  }
  if (sshConfig.proxyJumps !== undefined) {
    if (!Array.isArray(sshConfig.proxyJumps)) {
      throw new GatewayError("INVALID_CONFIG", `${label}.proxyJumps must be an array`, 500);
    }
    for (const [index, proxyJump] of sshConfig.proxyJumps.entries()) {
      validateSshConfig(proxyJump, `${label}.proxyJumps[${index}]`);
    }
  }
}

function normalizeSshServers(
  sshServers: GatewayConfig["sshServers"],
  configDir: string
): GatewayConfig["sshServers"] {
  return sshServers.map((sshServer) => {
    const sshConfigPath = sshServer.sshConfigPath
      ? resolveConfigPath(sshServer.sshConfigPath, configDir)
      : undefined;
    const sshHosts = loadSshHosts(sshConfigPath);

    return {
      ...resolveSshConfig(sshServer, configDir, sshHosts, new Set()),
      id: sshServer.id,
      sshConfigPath,
      idleTimeoutMs: sshServer.idleTimeoutMs
    };
  });
}

function resolveSshConfig(
  sshConfig: SshConfig | undefined,
  configDir: string,
  sshHosts: Map<string, SshHostConfig>,
  seenHosts: Set<string>
): SshConfig {
  if (!sshConfig) {
    throw new GatewayError("INVALID_CONFIG", "ssh config is required", 500);
  }

  const originalHost = sshConfig.host;
  if (seenHosts.has(originalHost)) {
    throw new GatewayError("INVALID_CONFIG", `Circular SSH ProxyJump detected at host ${originalHost}`, 500);
  }

  const nextSeenHosts = new Set(seenHosts);
  nextSeenHosts.add(originalHost);

  const sshHost = sshHosts.get(originalHost);
  const privateKeyPath = sshConfig.privateKeyPath
    ? resolveConfigPath(sshConfig.privateKeyPath, configDir)
    : sshHost?.identityFile
      ? resolveSshPath(sshHost.identityFile, configDir)
      : findDefaultIdentityFile();
  const proxyJumps = sshConfig.proxyJumps
    ?? sshHost?.proxyJump?.map((proxyJump) => resolveProxyJump(proxyJump, configDir, sshHosts, nextSeenHosts));

  return {
    ...sshConfig,
    host: sshHost?.hostname ?? sshConfig.host,
    hostAlias: originalHost,
    port: sshConfig.port ?? sshHost?.port ?? DEFAULT_SSH_PORT,
    username: sshConfig.username ?? sshHost?.user ?? os.userInfo().username,
    privateKeyPath,
    proxyJumps
  };
}

function findDefaultIdentityFile(): string | undefined {
  for (const fileName of DEFAULT_IDENTITY_FILES) {
    const filePath = path.join(os.homedir(), ".ssh", fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return undefined;
}

function resolveProxyJump(
  proxyJump: string,
  configDir: string,
  sshHosts: Map<string, SshHostConfig>,
  seenHosts: Set<string>
): SshConfig {
  const parsed = parseProxyJump(proxyJump);
  return resolveSshConfig(
    {
      host: parsed.host,
      port: parsed.port,
      username: parsed.username
    },
    configDir,
    sshHosts,
    seenHosts
  );
}

function parseProxyJump(proxyJump: string): { host: string; port?: number; username?: string } {
  const atIndex = proxyJump.lastIndexOf("@");
  const username = atIndex >= 0 ? proxyJump.slice(0, atIndex) : undefined;
  const hostAndPort = atIndex >= 0 ? proxyJump.slice(atIndex + 1) : proxyJump;
  const portSeparator = hostAndPort.lastIndexOf(":");
  const hasPort = portSeparator > 0 && !hostAndPort.includes("]");
  const rawPort = hasPort ? hostAndPort.slice(portSeparator + 1) : undefined;
  const port = rawPort ? Number(rawPort) : undefined;

  return {
    host: hasPort ? hostAndPort.slice(0, portSeparator) : hostAndPort,
    port: Number.isInteger(port) && Number(port) > 0 ? port : undefined,
    username
  };
}

function loadSshHosts(configPath?: string): Map<string, SshHostConfig> {
  const sshConfigPath = configPath ?? path.join(os.homedir(), ".ssh", "config");
  if (!fs.existsSync(sshConfigPath)) {
    return new Map();
  }

  return parseSshConfig(fs.readFileSync(sshConfigPath, "utf8"));
}

function parseSshConfig(content: string): Map<string, SshHostConfig> {
  const hosts = new Map<string, SshHostConfig>();
  let currentHosts: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const [rawKey, ...valueParts] = line.split(/\s+/);
    const key = rawKey.toLowerCase();
    const value = valueParts.join(" ");

    if (key === "host") {
      currentHosts = valueParts.filter((host) => !host.startsWith("!") && !host.includes("*") && !host.includes("?"));
      for (const host of currentHosts) {
        if (!hosts.has(host)) {
          hosts.set(host, {});
        }
      }
      continue;
    }

    for (const host of currentHosts) {
      const config = hosts.get(host);
      if (!config) {
        continue;
      }
      if (key === "hostname" && config.hostname === undefined) {
        config.hostname = value;
      } else if (key === "user" && config.user === undefined) {
        config.user = value;
      } else if (key === "port" && config.port === undefined) {
        const port = Number(value);
        if (Number.isInteger(port) && port > 0) {
          config.port = port;
        }
      } else if (key === "identityfile" && config.identityFile === undefined) {
        config.identityFile = value;
      } else if (key === "proxyjump" && config.proxyJump === undefined && value.toLowerCase() !== "none") {
        config.proxyJump = value.split(",").map((entry) => entry.trim()).filter(Boolean);
      }
    }
  }

  return hosts;
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GatewayError("INVALID_CONFIG", `${label} must be a non-empty string`, 500);
  }
}

function requirePositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new GatewayError("INVALID_CONFIG", `${label} must be a positive integer`, 500);
  }
}
