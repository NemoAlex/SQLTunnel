import type { FastifyInstance } from "fastify";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";
import type {
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
      server = buildServer(config, { openApiPath: this.openApiPath });
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
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "未知错误";
}
