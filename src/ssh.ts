import fs from "node:fs";
import type { Socket } from "node:net";
import { Client } from "ssh2";
import { GatewayError } from "./errors.js";
import type { SshConfig, SshServerConfig } from "./types.js";

export interface Tunnel {
  stream: Socket;
  close: () => void;
}

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

  constructor(sshServers: SshServerConfig[]) {
    this.sshServersById = new Map(sshServers.map((sshServer) => [sshServer.id, sshServer]));
  }

  async openTunnel(sshServerId: string, host: string, port: number): Promise<Tunnel> {
    const sshServer = this.sshServersById.get(sshServerId);
    if (!sshServer) {
      throw new GatewayError("INVALID_CONFIG", `Unknown sshServer: ${sshServerId}`, 500);
    }

    const entry = await this.getEntry(sshServer);
    entry.activeChannels += 1;

    try {
      const targetClient = entry.clients.at(-1);
      if (!targetClient) {
        throw new GatewayError("SSH_TUNNEL_ERROR", `SSH tunnel ${sshServerId} is not connected`, 502);
      }

      const stream = await openForward(targetClient, host, port);
      return {
        stream,
        close: () => {
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

  private async getEntry(sshServer: SshServerConfig): Promise<PoolEntry> {
    const existing = this.entries.get(sshServer.id);
    if (existing?.clients.length) {
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = undefined;
      }
      return existing;
    }

    if (existing?.connecting) {
      const clients = await existing.connecting;
      existing.clients = clients;
      existing.connecting = undefined;
      return existing;
    }

    const entry: PoolEntry = {
      clients: [],
      activeChannels: 0
    };
    entry.connecting = connectSshChain(sshServer);
    this.entries.set(sshServer.id, entry);

    try {
      entry.clients = await entry.connecting;
      entry.connecting = undefined;
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
    for (const client of [...entry.clients].reverse()) {
      client.end();
    }
  }
}

async function connectSshChain(target: SshConfig): Promise<Client[]> {
  const clients: Client[] = [];
  let previousClient: Client | undefined;

  for (const sshConfig of flattenSshChain(target)) {
    const sock = previousClient
      ? await openForward(previousClient, requiredHost(sshConfig), requiredPort(sshConfig))
      : undefined;

    try {
      const client = await connectSsh(sshConfig, sock);
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

async function connectSsh(sshConfig: SshConfig, sock?: Socket): Promise<Client> {
  const client = new Client();

  try {
    await new Promise<void>((resolve, reject) => {
      client
        .once("ready", () => resolve())
        .once("error", reject)
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

async function openForward(client: Client, host: string, port: number): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    client.forwardOut("127.0.0.1", 0, host, port, (error, channel) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(channel as unknown as Socket);
    });
  });
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

function toSshGatewayError(error: unknown, sshConfig: SshConfig): GatewayError {
  const message = error instanceof Error ? error.message : "Unknown SSH error";
  const host = sshConfig.hostAlias && sshConfig.hostAlias !== sshConfig.host
    ? `${sshConfig.hostAlias} (${sshConfig.host})`
    : requiredHost(sshConfig);
  const authHints = [
    sshConfig.password ? "password" : undefined,
    sshConfig.privateKeyPath ? `privateKey=${sshConfig.privateKeyPath}` : undefined,
    process.env.SSH_AUTH_SOCK ? "ssh-agent=available" : "ssh-agent=missing"
  ].filter(Boolean).join(", ");

  return new GatewayError(
    "SSH_AUTH_FAILED",
    `SSH authentication failed for ${requiredUsername(sshConfig)}@${host}:${requiredPort(sshConfig)}: ${message}. Auth sources: ${authHints}`,
    502
  );
}
