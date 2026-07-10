import type { FastifyInstance } from "fastify";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";
import type { GatewayConfig } from "../src/types.js";
import type {
  ConnectionIndicatorState,
  ConnectionOverview,
  DesktopLogEntry,
  DesktopPreferences,
  ServiceStatus
} from "../shared/desktop.js";

const HOST = "127.0.0.1";
const MAX_LOG_ENTRIES = 250;

export class ServiceRuntime {
  private server?: FastifyInstance;
  private preferences: DesktopPreferences;
  private readonly logs: DesktopLogEntry[] = [];
  private readonly databaseStates = new Map<string, ConnectionIndicatorState>();
  private readonly sshStates = new Map<string, ConnectionIndicatorState>();
  private status: ServiceStatus;

  constructor(
    private readonly configPath: string,
    preferences: DesktopPreferences,
    private readonly openApiPath: string,
    private readonly onChange: () => void
  ) {
    this.preferences = preferences;
    this.status = {
      phase: "stopped",
      host: HOST,
      port: preferences.port
    };
    this.record("info", "桌面控制台已就绪");
  }

  getStatus(): ServiceStatus {
    return { ...this.status };
  }

  getLogs(): DesktopLogEntry[] {
    return this.logs.map((entry) => ({ ...entry }));
  }

  getConnections(config: GatewayConfig): ConnectionOverview {
    return {
      databases: config.dbServers.map((dbServer) => ({
        id: dbServer.id,
        label: dbServer.id,
        detail: `${dbServer.type === "postgres" ? "PostgreSQL" : "MySQL"} · ${dbServer.database.host}:${dbServer.database.port}`,
        state: this.databaseStates.get(dbServer.id) ?? "disconnected"
      })),
      sshServers: config.sshServers.map((sshServer) => ({
        id: sshServer.id,
        label: sshServer.id,
        detail: `${sshServer.host}:${sshServer.port ?? 22}`,
        state: this.sshStates.get(sshServer.id) ?? "disconnected"
      }))
    };
  }

  setPreferences(preferences: DesktopPreferences): void {
    this.preferences = preferences;
    if (this.status.phase !== "running") {
      this.status = { ...this.status, port: preferences.port };
    }
    this.notify();
  }

  async start(): Promise<void> {
    if (this.status.phase === "running" || this.status.phase === "starting") {
      return;
    }

    this.status = {
      phase: "starting",
      host: HOST,
      port: this.preferences.port
    };
    this.record("info", `正在启动 127.0.0.1:${this.preferences.port}`);

    let server: FastifyInstance | undefined;
    try {
      const config = loadConfig(this.configPath);
      this.resetConnectionStates(config);
      server = buildServer(config, {
        openApiPath: this.openApiPath,
        onDatabaseActivity: (dbServerId, active, succeeded) =>
          this.handleDatabaseActivity(dbServerId, active, succeeded),
        onSshConnectionStatus: (sshServerId, connected) => this.handleSshStatus(sshServerId, connected),
        onHttpRequest: ({ method, url, statusCode, durationMs }) => {
          const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warning" : "info";
          this.record(level, `HTTP ${method} ${url} ${statusCode} · ${Math.round(durationMs)}ms`);
        }
      });
      this.server = server;
      await server.listen({ host: HOST, port: this.preferences.port });
      const url = `http://${HOST}:${this.preferences.port}`;
      this.status = {
        phase: "running",
        host: HOST,
        port: this.preferences.port,
        url,
        startedAt: new Date().toISOString()
      };
      this.record("success", `SQLTunnel 已运行于 ${url}`);
    } catch (error) {
      await server?.close().catch(() => undefined);
      this.server = undefined;
      const message = getErrorMessage(error);
      this.status = {
        phase: "error",
        host: HOST,
        port: this.preferences.port,
        error: message
      };
      this.disconnectAll();
      this.record("error", `启动失败：${message}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.server) {
      if (this.status.phase !== "stopped") {
        this.status = {
          phase: "stopped",
          host: HOST,
          port: this.preferences.port
        };
        this.disconnectAll();
        this.record("info", "SQLTunnel 已停止");
      }
      return;
    }

    this.status = { ...this.status, phase: "stopping", error: undefined };
    this.record("info", "正在停止 SQLTunnel");
    const server = this.server;
    this.server = undefined;

    try {
      await server.close();
      this.status = {
        phase: "stopped",
        host: HOST,
        port: this.preferences.port
      };
      this.disconnectAll();
      this.record("success", "SQLTunnel 已安全停止");
    } catch (error) {
      const message = getErrorMessage(error);
      this.status = {
        phase: "error",
        host: HOST,
        port: this.preferences.port,
        error: message
      };
      this.record("error", `停止失败：${message}`);
      throw error;
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  record(level: DesktopLogEntry["level"], message: string): void {
    this.logs.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      level,
      message
    });
    this.logs.splice(MAX_LOG_ENTRIES);
    this.notify();
  }

  private notify(): void {
    this.onChange();
  }

  private resetConnectionStates(config: GatewayConfig): void {
    this.databaseStates.clear();
    this.sshStates.clear();
    for (const dbServer of config.dbServers) {
      this.databaseStates.set(dbServer.id, "disconnected");
    }
    for (const sshServer of config.sshServers) {
      this.sshStates.set(sshServer.id, "disconnected");
    }
  }

  private disconnectAll(): void {
    for (const dbServerId of this.databaseStates.keys()) {
      this.databaseStates.set(dbServerId, "disconnected");
    }
    for (const sshServerId of this.sshStates.keys()) {
      this.sshStates.set(sshServerId, "disconnected");
    }
    this.notify();
  }

  private handleDatabaseActivity(dbServerId: string, active: boolean, succeeded?: boolean): void {
    if (!this.databaseStates.has(dbServerId)) {
      return;
    }
    this.databaseStates.set(dbServerId, active ? "active" : succeeded ? "ready" : "disconnected");
    if (active) {
      this.record("info", `正在访问数据库：${dbServerId}`);
    } else if (succeeded) {
      this.record("success", `数据库请求完成：${dbServerId}`);
    } else {
      this.record("error", `数据库请求失败：${dbServerId}`);
    }
  }

  private handleSshStatus(sshServerId: string, connected: boolean): void {
    if (!this.sshStates.has(sshServerId)) {
      return;
    }
    this.sshStates.set(sshServerId, connected ? "connected" : "disconnected");
    this.record(connected ? "success" : "info", `SSH 隧道已${connected ? "连接" : "断开"}：${sshServerId}`);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "未知错误";
}
