import type { FastifyInstance } from "fastify";
import { normalizeGatewayConfig } from "../src/config.js";
import { GatewayService } from "../src/gateway-service.js";
import { buildServer } from "../src/server.js";
import type { GatewayConfig } from "../src/types.js";
import type {
  ConnectionIndicatorState,
  ConnectionOverview,
  DesktopLogEntry,
  DesktopPreferences,
  ServiceStatus
} from "../shared/desktop.js";
import type { UiLocale } from "../shared/ui-locale.js";
import { text } from "./i18n.js";

const MAX_LOG_ENTRIES = 250;

export class ServiceRuntime {
  private server?: FastifyInstance;
  private preferences: DesktopPreferences;
  private readonly logs: DesktopLogEntry[] = [];
  private readonly databaseStates = new Map<string, ConnectionIndicatorState>();
  private readonly sshStates = new Map<string, ConnectionIndicatorState>();
  private gateway?: GatewayService;
  private status: ServiceStatus;

  constructor(
    private readonly getConfig: () => GatewayConfig,
    private readonly configDirectory: string,
    preferences: DesktopPreferences,
    private readonly openApiPath: string,
    private readonly onChange: () => void,
    private locale: UiLocale = "en"
  ) {
    this.preferences = preferences;
    this.status = {
      phase: "stopped",
      host: preferences.host,
      port: preferences.port
    };
    this.record("info", text(this.locale, "Desktop console ready"));
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
        detail: [dbServer.type === "postgres" ? "PostgreSQL" : "MySQL", dbServer.description]
          .filter(Boolean)
          .join(" · "),
        state: this.databaseStates.get(dbServer.id) ?? "disconnected"
      })),
      sshServers: config.sshServers.map((sshServer) => ({
        id: sshServer.id,
        label: sshServer.id,
        detail: "",
        state: this.sshStates.get(sshServer.id) ?? "disconnected"
      }))
    };
  }

  setPreferences(preferences: DesktopPreferences): void {
    this.preferences = preferences;
    if (this.status.phase !== "running") {
      this.status = { ...this.status, host: preferences.host, port: preferences.port };
    }
    this.notify();
  }

  setLocale(locale: UiLocale): void {
    this.locale = locale;
  }

  async testDatabaseConnection(dbServerId: string): Promise<void> {
    const config = this.resolveConfig();
    for (const dbServer of config.dbServers) {
      if (!this.databaseStates.has(dbServer.id)) this.databaseStates.set(dbServer.id, "disconnected");
    }
    for (const sshServer of config.sshServers) {
      if (!this.sshStates.has(sshServer.id)) this.sshStates.set(sshServer.id, "disconnected");
    }
    const gateway = this.getOrCreateGateway(config);
    this.record("info", text(this.locale, "Testing database connection: {id}", { id: dbServerId }));
    try {
      await gateway.testConnection(dbServerId);
      this.record("success", text(this.locale, "Database connection succeeded: {id}", { id: dbServerId }));
    } finally {
      this.notify();
    }
  }

  async testDraftDatabaseConnection(config: GatewayConfig, dbServerId: string): Promise<void> {
    const gateway = new GatewayService(normalizeGatewayConfig(config, this.configDirectory));
    try {
      await gateway.testConnection(dbServerId);
    } finally {
      await gateway.close();
    }
  }

  async testDraftSshConnection(config: GatewayConfig, sshServerId: string): Promise<void> {
    const gateway = new GatewayService(normalizeGatewayConfig(config, this.configDirectory));
    try {
      await gateway.testSshConnection(sshServerId);
    } finally {
      await gateway.close();
    }
  }

  async configurationChanged(): Promise<void> {
    await this.closeGateway();
    this.disconnectAll();
  }

  async start(): Promise<void> {
    if (this.status.phase === "running" || this.status.phase === "starting") {
      return;
    }

    this.status = {
      phase: "starting",
      host: this.preferences.host,
      port: this.preferences.port
    };
    this.record("info", text(this.locale, "Starting on {host}:{port}", {
      host: this.preferences.host,
      port: this.preferences.port
    }));

    let server: FastifyInstance | undefined;
    try {
      const config = this.resolveConfig();
      if (!this.gateway) this.resetConnectionStates(config);
      const gateway = this.getOrCreateGateway(config);
      server = buildServer(config, {
        openApiPath: this.openApiPath,
        gateway,
        onDatabaseActivity: (dbServerId, active, succeeded) =>
          this.handleDatabaseActivity(dbServerId, active, succeeded),
        onSshConnectionStatus: (sshServerId, connected) => this.handleSshStatus(sshServerId, connected),
        onHttpRequest: ({ method, url, statusCode, durationMs }) => {
          const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warning" : "info";
          this.record(level, `HTTP ${method} ${url} ${statusCode} · ${Math.round(durationMs)}ms`);
        }
      });
      this.server = server;
      await server.listen({ host: this.preferences.host, port: this.preferences.port });
      const url = formatHttpUrl(this.preferences.host, this.preferences.port);
      this.status = {
        phase: "running",
        host: this.preferences.host,
        port: this.preferences.port,
        url,
        startedAt: new Date().toISOString()
      };
      this.record("success", text(this.locale, "SQLTunnel is running at {url}", { url }));
    } catch (error) {
      if (server) {
        await server.close().catch(() => undefined);
        this.gateway = undefined;
      } else {
        await this.closeGateway().catch(() => undefined);
      }
      this.server = undefined;
      const message = getErrorMessage(error, this.locale);
      this.status = {
        phase: "error",
        host: this.preferences.host,
        port: this.preferences.port,
        error: message
      };
      this.disconnectAll();
      this.record("error", text(this.locale, "Startup failed: {message}", { message }));
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.server) {
      await this.closeGateway();
      this.disconnectAll();
      if (this.status.phase !== "stopped") {
        this.status = {
          phase: "stopped",
          host: this.preferences.host,
          port: this.preferences.port
        };
        this.record("info", text(this.locale, "SQLTunnel stopped"));
      }
      return;
    }

    this.status = { ...this.status, phase: "stopping", error: undefined };
    this.record("info", text(this.locale, "Stopping SQLTunnel"));
    const server = this.server;
    this.server = undefined;

    try {
      await server.close();
      this.gateway = undefined;
      this.status = {
        phase: "stopped",
        host: this.preferences.host,
        port: this.preferences.port
      };
      this.disconnectAll();
      this.record("success", text(this.locale, "SQLTunnel stopped safely"));
    } catch (error) {
      await this.closeGateway().catch(() => undefined);
      this.disconnectAll();
      const message = getErrorMessage(error, this.locale);
      this.status = {
        phase: "error",
        host: this.preferences.host,
        port: this.preferences.port,
        error: message
      };
      this.record("error", text(this.locale, "Failed to stop: {message}", { message }));
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
      this.record("info", text(this.locale, "Accessing database: {id}", { id: dbServerId }));
    } else if (succeeded) {
      this.record("success", text(this.locale, "Database request completed: {id}", { id: dbServerId }));
    } else {
      this.record("error", text(this.locale, "Database request failed: {id}", { id: dbServerId }));
    }
  }

  private handleSshStatus(sshServerId: string, connected: boolean): void {
    if (!this.sshStates.has(sshServerId)) {
      return;
    }
    this.sshStates.set(sshServerId, connected ? "connected" : "disconnected");
    this.record(
      connected ? "success" : "info",
      text(this.locale, connected ? "SSH tunnel connected: {id}" : "SSH tunnel disconnected: {id}", { id: sshServerId })
    );
  }

  private getOrCreateGateway(config: GatewayConfig): GatewayService {
    this.gateway ??= new GatewayService(config, {
      onDatabaseActivity: (id, active, succeeded) => this.handleDatabaseActivity(id, active, succeeded),
      onSshConnectionStatus: (id, connected) => this.handleSshStatus(id, connected)
    });
    return this.gateway;
  }

  private resolveConfig(): GatewayConfig {
    return normalizeGatewayConfig(this.getConfig(), this.configDirectory);
  }

  private async closeGateway(): Promise<void> {
    const gateway = this.gateway;
    this.gateway = undefined;
    await gateway?.close();
  }
}

function getErrorMessage(error: unknown, locale: UiLocale): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return text(locale, "Unknown error");
}

function formatHttpUrl(host: string, port: number): string {
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${port}`;
}
