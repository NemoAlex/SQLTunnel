import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadConfig } from "../src/config.js";
import type { GatewayConfig } from "../src/types.js";
import type { DesktopPreferences } from "../shared/desktop.js";
import { isUiLanguagePreference, resolveUiLocale } from "../shared/ui-locale.js";
import { text } from "./i18n.js";

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  defaults: {
    maxRows: 1000,
    queryTimeoutMs: 10_000,
    connectTimeoutMs: 10_000,
    schemaCacheTtlMs: 300_000
  },
  sshServers: [],
  dbServers: [],
  clients: []
};

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  host: "127.0.0.1",
  port: 3000,
  startOnLaunch: false,
  language: "system"
};

export class DesktopConfigStore {
  readonly configPath: string;
  readonly preferencesPath: string;

  constructor(readonly dataDirectory: string) {
    this.configPath = path.join(dataDirectory, "gateway.yaml");
    this.preferencesPath = path.join(dataDirectory, "desktop.json");
  }

  initialize(): void {
    fs.mkdirSync(this.dataDirectory, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this.configPath)) {
      this.writeGatewayConfig(DEFAULT_GATEWAY_CONFIG);
    }
    if (!fs.existsSync(this.preferencesPath)) {
      this.writePreferences(DEFAULT_DESKTOP_PREFERENCES);
    }
  }

  loadGatewayConfig(): GatewayConfig {
    const parsed = YAML.parse(fs.readFileSync(this.configPath, "utf8")) as Partial<GatewayConfig> | null;
    return {
      defaults: {
        maxRows: parsed?.defaults?.maxRows ?? DEFAULT_GATEWAY_CONFIG.defaults.maxRows,
        queryTimeoutMs: parsed?.defaults?.queryTimeoutMs ?? DEFAULT_GATEWAY_CONFIG.defaults.queryTimeoutMs,
        connectTimeoutMs: parsed?.defaults?.connectTimeoutMs ?? DEFAULT_GATEWAY_CONFIG.defaults.connectTimeoutMs,
        schemaCacheTtlMs: parsed?.defaults?.schemaCacheTtlMs ?? DEFAULT_GATEWAY_CONFIG.defaults.schemaCacheTtlMs
      },
      sshServers: parsed?.sshServers ?? [],
      dbServers: parsed?.dbServers ?? [],
      clients: parsed?.clients ?? []
    };
  }

  saveGatewayConfig(config: GatewayConfig): GatewayConfig {
    const temporaryPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    const serialized = YAML.stringify(config, { indent: 2, lineWidth: 0 });

    try {
      fs.writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
      loadConfig(temporaryPath);
      fs.renameSync(temporaryPath, this.configPath);
      fs.chmodSync(this.configPath, 0o600);
    } finally {
      if (fs.existsSync(temporaryPath)) {
        fs.rmSync(temporaryPath, { force: true });
      }
    }

    return this.loadGatewayConfig();
  }

  loadPreferences(): DesktopPreferences {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.preferencesPath, "utf8")) as Partial<DesktopPreferences>;
      return normalizePreferences(parsed);
    } catch {
      return { ...DEFAULT_DESKTOP_PREFERENCES };
    }
  }

  savePreferences(preferences: DesktopPreferences): DesktopPreferences {
    const normalized = normalizePreferences(preferences);
    this.writePreferences(normalized);
    return normalized;
  }

  private writeGatewayConfig(config: GatewayConfig): void {
    fs.writeFileSync(this.configPath, YAML.stringify(config, { indent: 2, lineWidth: 0 }), {
      encoding: "utf8",
      mode: 0o600
    });
  }

  private writePreferences(preferences: DesktopPreferences): void {
    const temporaryPath = `${this.preferencesPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    fs.renameSync(temporaryPath, this.preferencesPath);
    fs.chmodSync(this.preferencesPath, 0o600);
  }
}

function normalizePreferences(preferences: Partial<DesktopPreferences>): DesktopPreferences {
  const language = isUiLanguagePreference(preferences.language) ? preferences.language : "system";
  const locale = resolveUiLocale(language, [Intl.DateTimeFormat().resolvedOptions().locale]);
  const host = String(preferences.host ?? DEFAULT_DESKTOP_PREFERENCES.host).trim();
  if (!host || /\s/.test(host)) {
    throw new Error(text(locale, "The listen address cannot be empty or contain spaces"));
  }
  const port = Number(preferences.port ?? DEFAULT_DESKTOP_PREFERENCES.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(text(locale, "The port must be an integer between 1 and 65535"));
  }

  return {
    host,
    port,
    startOnLaunch: preferences.startOnLaunch === true,
    language
  };
}
