import type { GatewayConfig } from "../src/types.js";

export type ServicePhase = "stopped" | "starting" | "running" | "stopping" | "error";

export interface ServiceStatus {
  phase: ServicePhase;
  host: string;
  port: number;
  url?: string;
  startedAt?: string;
  error?: string;
}

export interface DesktopPreferences {
  port: number;
  startOnLaunch: boolean;
  launchAtLogin: boolean;
}

export interface DesktopLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

export interface DesktopSnapshot {
  config: GatewayConfig;
  preferences: DesktopPreferences;
  service: ServiceStatus;
  logs: DesktopLogEntry[];
  configPath: string;
}

export interface SQLTunnelDesktopApi {
  getSnapshot(): Promise<DesktopSnapshot>;
  saveConfig(config: GatewayConfig): Promise<DesktopSnapshot>;
  savePreferences(preferences: DesktopPreferences): Promise<DesktopSnapshot>;
  startService(): Promise<DesktopSnapshot>;
  stopService(): Promise<DesktopSnapshot>;
  restartService(): Promise<DesktopSnapshot>;
  openConfigFolder(): Promise<void>;
  onSnapshot(listener: (snapshot: DesktopSnapshot) => void): () => void;
}

export const DESKTOP_CHANNELS = {
  getSnapshot: "desktop:get-snapshot",
  saveConfig: "desktop:save-config",
  savePreferences: "desktop:save-preferences",
  startService: "desktop:start-service",
  stopService: "desktop:stop-service",
  restartService: "desktop:restart-service",
  openConfigFolder: "desktop:open-config-folder",
  snapshotChanged: "desktop:snapshot-changed"
} as const;
