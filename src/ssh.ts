import fs from "node:fs";
import type { Socket } from "node:net";
import { Client } from "ssh2";
import { GatewayError } from "./errors.js";
import type { DbServerConfig, SshConfig } from "./types.js";

export interface Tunnel {
  stream: Socket;
  close: () => void;
}

export async function openSshTunnel(connection: DbServerConfig): Promise<Tunnel | undefined> {
  if (!connection.ssh) {
    return undefined;
  }

  const sshConfig = connection.ssh;
  const clients = await connectSshChain(sshConfig);
  const targetClient = clients.at(-1);
  if (!targetClient) {
    throw new Error(`Failed to open SSH tunnel for ${connection.id}`);
  }

  const stream = await openForward(targetClient, connection.database.host, connection.database.port);

  return {
    stream,
    close: () => {
      stream.destroy();
      for (const client of clients.reverse()) {
        client.end();
      }
    }
  };
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
