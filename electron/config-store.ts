import fs from "node:fs";
import path from "node:path";
import { normalizeGatewayConfig } from "../src/config.js";
import type { GatewayConfig } from "../src/types.js";
import type { DesktopPreferences } from "../shared/desktop.js";
import { isUiLanguagePreference, resolveUiLocale } from "../shared/ui-locale.js";
import type { ConfigEncryption } from "./config-encryption.js";
import { text } from "./i18n.js";

const SECURE_FORMAT = "sqltunnel-safe-storage";
const SECURE_FORMAT_VERSION = 1;

type SecureConfigKind = "gateway" | "desktop";

interface SecureConfigEnvelope<T> {
  format: typeof SECURE_FORMAT;
  version: typeof SECURE_FORMAT_VERSION;
  kind: SecureConfigKind;
  value: T;
}

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

  constructor(
    readonly dataDirectory: string,
    private readonly encryption: ConfigEncryption
  ) {
    this.configPath = path.join(dataDirectory, "gateway.secure");
    this.preferencesPath = path.join(dataDirectory, "desktop.secure");
  }

  async initialize(): Promise<void> {
    fs.mkdirSync(this.dataDirectory, { recursive: true, mode: 0o700 });
    if (!await this.encryption.isAvailable()) {
      throw new Error("Secure configuration storage is unavailable");
    }

    await this.initializeGatewayConfig();
    await this.initializePreferences();
  }

  async loadGatewayConfig(): Promise<GatewayConfig> {
    const decrypted = await this.readEnvelope<Partial<GatewayConfig>>(this.configPath, "gateway");
    const config = normalizeStoredGatewayConfig(decrypted.value);
    this.validateGatewayConfig(config);
    if (decrypted.shouldReEncrypt) {
      await this.writeEnvelope(this.configPath, "gateway", config);
    }
    return config;
  }

  async saveGatewayConfig(config: GatewayConfig): Promise<GatewayConfig> {
    const normalized = normalizeStoredGatewayConfig(config);
    this.validateGatewayConfig(normalized);
    await this.writeEnvelope(this.configPath, "gateway", normalized);
    return normalized;
  }

  async loadPreferences(): Promise<DesktopPreferences> {
    const decrypted = await this.readEnvelope<Partial<DesktopPreferences>>(this.preferencesPath, "desktop");
    const preferences = normalizePreferences(decrypted.value);
    if (decrypted.shouldReEncrypt) {
      await this.writeEnvelope(this.preferencesPath, "desktop", preferences);
    }
    return preferences;
  }

  async savePreferences(preferences: DesktopPreferences): Promise<DesktopPreferences> {
    const normalized = normalizePreferences(preferences);
    await this.writeEnvelope(this.preferencesPath, "desktop", normalized);
    return normalized;
  }

  private async initializeGatewayConfig(): Promise<void> {
    if (fs.existsSync(this.configPath)) {
      await this.loadGatewayConfig();
      return;
    }

    await this.writeEnvelope(this.configPath, "gateway", DEFAULT_GATEWAY_CONFIG);
  }

  private async initializePreferences(): Promise<void> {
    if (fs.existsSync(this.preferencesPath)) {
      await this.loadPreferences();
      return;
    }

    await this.writeEnvelope(this.preferencesPath, "desktop", DEFAULT_DESKTOP_PREFERENCES);
  }

  private validateGatewayConfig(config: GatewayConfig): void {
    normalizeGatewayConfig(config, this.dataDirectory);
  }

  private async readEnvelope<T>(filePath: string, expectedKind: SecureConfigKind): Promise<{
    value: T;
    shouldReEncrypt: boolean;
  }> {
    const decrypted = await this.encryption.decryptString(fs.readFileSync(filePath));
    const parsed = JSON.parse(decrypted.result) as Partial<SecureConfigEnvelope<T>> | null;
    if (
      parsed?.format !== SECURE_FORMAT ||
      parsed.version !== SECURE_FORMAT_VERSION ||
      parsed.kind !== expectedKind ||
      typeof parsed.value !== "object" ||
      parsed.value === null
    ) {
      throw new Error(`Unsupported or invalid secure ${expectedKind} configuration`);
    }
    return { value: parsed.value, shouldReEncrypt: decrypted.shouldReEncrypt };
  }

  private async writeEnvelope<T>(filePath: string, kind: SecureConfigKind, value: T): Promise<void> {
    const envelope: SecureConfigEnvelope<T> = {
      format: SECURE_FORMAT,
      version: SECURE_FORMAT_VERSION,
      kind,
      value
    };
    const encrypted = await this.encryption.encryptString(JSON.stringify(envelope));
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    try {
      fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
      fs.renameSync(temporaryPath, filePath);
      fs.chmodSync(filePath, 0o600);
    } finally {
      if (fs.existsSync(temporaryPath)) {
        fs.rmSync(temporaryPath, { force: true });
      }
    }
  }
}

function normalizeStoredGatewayConfig(parsed: Partial<GatewayConfig>): GatewayConfig {
  return {
    defaults: {
      maxRows: parsed.defaults?.maxRows ?? DEFAULT_GATEWAY_CONFIG.defaults.maxRows,
      queryTimeoutMs: parsed.defaults?.queryTimeoutMs ?? DEFAULT_GATEWAY_CONFIG.defaults.queryTimeoutMs,
      connectTimeoutMs: parsed.defaults?.connectTimeoutMs ?? DEFAULT_GATEWAY_CONFIG.defaults.connectTimeoutMs,
      schemaCacheTtlMs: parsed.defaults?.schemaCacheTtlMs ?? DEFAULT_GATEWAY_CONFIG.defaults.schemaCacheTtlMs
    },
    sshServers: parsed.sshServers ?? [],
    dbServers: parsed.dbServers ?? [],
    clients: parsed.clients ?? []
  };
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
