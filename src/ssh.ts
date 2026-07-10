import fs from "node:fs";
import type { Socket } from "node:net";
import { Client } from "ssh2";
import { GatewayError } from "./errors.js";
import { formatSshTunnelClosedLog, formatSshTunnelOpenedLog } from "./log-format.js";
import type { SshConfig, SshServerConfig } from "./types.js";

export interface Tunnel {
  stream: Socket;
  close: () => void;
}

interface PlainLogger {
  info(message: string): void;
}

export type SshConnectionStatusListener = (sshServerId: string, connected: boolean) => void;

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

interface PoolEntry {
  clients: Client[];
  activeChannels: number;
  idleTimer?: NodeJS.Timeout;
  connecting?: Promise<Client[]>;
}

export class SshTunnelPool {
  private readonly sshServersById: Map<string, SshServerConfig>;
  private readonly entries = new Map<string, PoolEntry>();

  constructor(
    sshServers: SshServerConfig[],
    private readonly logger?: PlainLogger,
    private readonly onConnectionStatus?: SshConnectionStatusListener
  ) {
    this.sshServersById = new Map(sshServers.map((sshServer) => [sshServer.id, sshServer]));
  }

  async openTunnel(sshServerId: string, host: string, port: number, connectTimeoutMs: number): Promise<Tunnel> {
    const sshServer = this.sshServersById.get(sshServerId);
    if (!sshServer) {
      throw new GatewayError("INVALID_CONFIG", `Unknown sshServer: ${sshServerId}`, 500);
    }

    const entry = await this.getEntry(sshServer, connectTimeoutMs);
    entry.activeChannels += 1;

    try {
      const targetClient = entry.clients.at(-1);
      if (!targetClient) {
        throw new GatewayError("SSH_TUNNEL_ERROR", `SSH tunnel ${sshServerId} is not connected`, 502);
      }

      const stream = await openForward(targetClient, host, port, connectTimeoutMs);
      let closed = false;
      return {
        stream,
        close: () => {
          if (closed) {
            return;
          }
          closed = true;
          stream.destroy();
          this.release(sshServer.id);
        }
      };
    } catch (error) {
      this.release(sshServer.id);
      throw error;
    }
  }

  async closeAll(): Promise<void> {
    for (const sshServerId of this.entries.keys()) {
      this.closeEntry(sshServerId);
    }
  }

  private async getEntry(sshServer: SshServerConfig, connectTimeoutMs: number): Promise<PoolEntry> {
    const existing = this.entries.get(sshServer.id);
    if (existing?.clients.length) {
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = undefined;
      }
      return existing;
    }

    if (existing?.connecting) {
      const clients = await withConnectTimeout(
        existing.connecting,
        connectTimeoutMs,
        `Timed out while establishing SSH tunnel ${sshServer.id}`
      );
      existing.clients = clients;
      existing.connecting = undefined;
      return existing;
    }

    const entry: PoolEntry = {
      clients: [],
      activeChannels: 0
    };
    entry.connecting = connectSshChain(sshServer, connectTimeoutMs);
    this.entries.set(sshServer.id, entry);

    try {
      entry.clients = await withConnectTimeout(
        entry.connecting,
        connectTimeoutMs,
        `Timed out while establishing SSH tunnel ${sshServer.id}`
      );
      entry.connecting = undefined;
      this.logger?.info(formatSshTunnelOpenedLog(sshServer.id));
      this.onConnectionStatus?.(sshServer.id, true);
      for (const client of entry.clients) {
        client.once("close", () => {
          if (this.entries.get(sshServer.id) === entry) {
            this.closeEntry(sshServer.id);
          }
        });
      }
      return entry;
    } catch (error) {
      this.entries.delete(sshServer.id);
      throw error;
    }
  }

  private release(sshServerId: string) {
    const entry = this.entries.get(sshServerId);
    if (!entry) {
      return;
    }

    entry.activeChannels = Math.max(0, entry.activeChannels - 1);
    if (entry.activeChannels > 0 || entry.idleTimer) {
      return;
    }

    const sshServer = this.sshServersById.get(sshServerId);
    const idleTimeoutMs = sshServer?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    entry.idleTimer = setTimeout(() => this.closeEntry(sshServerId), idleTimeoutMs);
  }

  private closeEntry(sshServerId: string) {
    const entry = this.entries.get(sshServerId);
    if (!entry) {
      return;
    }

    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }
    this.entries.delete(sshServerId);
    this.logger?.info(formatSshTunnelClosedLog(sshServerId));
    this.onConnectionStatus?.(sshServerId, false);
    for (const client of [...entry.clients].reverse()) {
      client.end();
    }
  }
}

async function connectSshChain(target: SshConfig, connectTimeoutMs: number): Promise<Client[]> {
  const clients: Client[] = [];
  let previousClient: Client | undefined;

  for (const sshConfig of flattenSshChain(target)) {
    const sock = previousClient
      ? await openForward(previousClient, requiredHost(sshConfig), requiredPort(sshConfig), connectTimeoutMs)
      : undefined;

    try {
      const client = await connectSsh(sshConfig, sock, connectTimeoutMs);
      clients.push(client);
      previousClient = client;
    } catch (error) {
      sock?.destroy();
      for (const client of clients.reverse()) {
        client.end();
      }
      throw error;
    }
  }

  return clients;
}

function flattenSshChain(target: SshConfig): SshConfig[] {
  return [
    ...(target.proxyJumps ?? []).flatMap((proxyJump) => flattenSshChain(proxyJump)),
    {
      ...target,
      proxyJumps: undefined
    }
  ];
}

async function connectSsh(sshConfig: SshConfig, sock: Socket | undefined, connectTimeoutMs: number): Promise<Client> {
  const client = new Client();

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        client.end();
        reject(new GatewayError(
          "CONNECT_TIMEOUT",
          `Timed out while connecting to SSH server ${formatSshServer(sshConfig)}`,
          504
        ));
      }, connectTimeoutMs);
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      client
        .once("ready", () => finish(resolve))
        .once("error", (error) => finish(() => reject(error)))
        .connect({
          host: sock ? undefined : requiredHost(sshConfig),
          port: sock ? undefined : requiredPort(sshConfig),
          username: requiredUsername(sshConfig),
          password: sshConfig.password,
          privateKey: resolvePrivateKey(sshConfig),
          passphrase: sshConfig.passphrase,
          agent: process.env.SSH_AUTH_SOCK,
          sock
        });
    });
  } catch (error) {
    client.end();
    throw toSshGatewayError(error, sshConfig);
  }

  return client;
}

function resolvePrivateKey(sshConfig: SshConfig): string | Buffer | undefined {
  if (!sshConfig.privateKeyPath) {
    return undefined;
  }

  const privateKey = fs.readFileSync(sshConfig.privateKeyPath, "utf8");
  if (process.env.SSH_AUTH_SOCK && !sshConfig.passphrase && isEncryptedPrivateKey(privateKey)) {
    return undefined;
  }

  return privateKey;
}

function isEncryptedPrivateKey(privateKey: string): boolean {
  return /ENCRYPTED/.test(privateKey) || /Proc-Type:\s*4,ENCRYPTED/.test(privateKey);
}

async function openForward(client: Client, host: string, port: number, connectTimeoutMs: number): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new GatewayError("CONNECT_TIMEOUT", `Timed out while opening SSH tunnel to ${host}:${port}`, 504));
    }, connectTimeoutMs);
    client.forwardOut("127.0.0.1", 0, host, port, (error, channel) => {
      if (settled) {
        channel?.destroy();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(channel as unknown as Socket);
    });
  });
}

async function withConnectTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new GatewayError("CONNECT_TIMEOUT", message, 504)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function requiredHost(sshConfig: SshConfig): string {
  if (!sshConfig.host) {
    throw new Error("SSH host is required");
  }
  return sshConfig.host;
}

function requiredPort(sshConfig: SshConfig): number {
  if (!sshConfig.port) {
    throw new Error(`SSH port is required for ${requiredHost(sshConfig)}`);
  }
  return sshConfig.port;
}

function requiredUsername(sshConfig: SshConfig): string {
  if (!sshConfig.username) {
    throw new Error(`SSH username is required for ${requiredHost(sshConfig)}`);
  }
  return sshConfig.username;
}

function formatSshServer(sshConfig: SshConfig): string {
  const host = sshConfig.hostAlias && sshConfig.hostAlias !== sshConfig.host
    ? `${sshConfig.hostAlias} (${sshConfig.host})`
    : requiredHost(sshConfig);
  return `${requiredUsername(sshConfig)}@${host}:${requiredPort(sshConfig)}`;
}

function toSshGatewayError(error: unknown, sshConfig: SshConfig): GatewayError {
  if (error instanceof GatewayError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "Unknown SSH error";
  const authHints = [
    sshConfig.password ? "password" : undefined,
    sshConfig.privateKeyPath ? `privateKey=${sshConfig.privateKeyPath}` : undefined,
    process.env.SSH_AUTH_SOCK ? "ssh-agent=available" : "ssh-agent=missing"
  ].filter(Boolean).join(", ");

  return new GatewayError(
    "SSH_AUTH_FAILED",
    `SSH authentication failed for ${formatSshServer(sshConfig)}: ${message}. Auth sources: ${authHints}`,
    502
  );
}
