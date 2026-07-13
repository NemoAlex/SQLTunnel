import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ConfigEncryption } from "../electron/config-encryption.js";
import {
  DEFAULT_DESKTOP_PREFERENCES,
  DesktopConfigStore
} from "../electron/config-store.js";
import { ServiceRuntime } from "../electron/service-runtime.js";
import { resolveUiLocale } from "../shared/ui-locale.js";
import { GatewayService } from "../src/gateway-service.js";
import { buildServer } from "../src/server.js";
import type { GatewayConfig } from "../src/types.js";

const testEncryption: ConfigEncryption = {
  isAvailable: async () => true,
  encryptString: async (plainText) => xorBuffer(Buffer.from(plainText, "utf8")),
  decryptString: async (encrypted) => ({
    result: xorBuffer(encrypted).toString("utf8"),
    shouldReEncrypt: false
  })
};

async function createStore(t: test.TestContext): Promise<DesktopConfigStore> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqltunnel-desktop-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new DesktopConfigStore(directory, testEncryption);
  await store.initialize();
  return store;
}

function xorBuffer(value: Buffer): Buffer {
  return Buffer.from(value.map((byte) => byte ^ 0xa5));
}

test("desktop store initializes encrypted editable configuration", async (t) => {
  const store = await createStore(t);
  const config = await store.loadGatewayConfig();

  assert.deepEqual(config.dbServers, []);
  assert.deepEqual(config.sshServers, []);
  assert.deepEqual(config.clients, []);
  assert.equal(config.defaults.maxRows, 1000);
  assert.deepEqual(await store.loadPreferences(), DEFAULT_DESKTOP_PREFERENCES);
  assert.equal(path.basename(store.configPath), "gateway.secure");
  assert.equal(path.basename(store.preferencesPath), "desktop.secure");

  if (process.platform !== "win32") {
    assert.equal(fs.statSync(store.configPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(store.preferencesPath).mode & 0o777, 0o600);
  }
});

test("desktop store validates and atomically persists encrypted graphical config", async (t) => {
  const store = await createStore(t);
  const config: GatewayConfig = {
    ...await store.loadGatewayConfig(),
    dbServers: [{
      id: "app-db",
      type: "postgres",
      database: {
        host: "127.0.0.1",
        port: 5432,
        user: "app",
        password: "secret",
        database: "app"
      }
    }],
    clients: [{
      id: "agent",
      apiKey: "test-key",
      dbServers: [{ serverId: "app-db", permission: "read" }]
    }]
  };

  const saved = await store.saveGatewayConfig(config);

  assert.equal(saved.dbServers[0]?.id, "app-db");
  assert.equal(saved.clients[0]?.dbServers[0]?.permission, "read");
  assert.equal((await store.loadGatewayConfig()).dbServers[0]?.database.password, "secret");
  assert.equal(fs.readFileSync(store.configPath).includes(Buffer.from("secret")), false);
  assert.equal(fs.readFileSync(store.configPath).includes(Buffer.from("test-key")), false);
  assert.equal(fs.readdirSync(store.dataDirectory).some((file) => file.endsWith(".tmp")), false);
});

test("desktop store rejects invalid config without replacing the saved file", async (t) => {
  const store = await createStore(t);
  const original = fs.readFileSync(store.configPath);
  const saved = await store.loadGatewayConfig();
  const invalid: GatewayConfig = {
    ...saved,
    defaults: { ...saved.defaults, maxRows: 0 }
  };

  await assert.rejects(() => store.saveGatewayConfig(invalid), /maxRows must be a positive integer/);
  assert.deepEqual(fs.readFileSync(store.configPath), original);
});

test("desktop store persists and validates encrypted preferences", async (t) => {
  const store = await createStore(t);
  const saved = await store.savePreferences({
    ...DEFAULT_DESKTOP_PREFERENCES,
    host: "0.0.0.0",
    port: 4567,
    language: "en"
  });

  assert.equal(saved.host, "0.0.0.0");
  assert.equal(saved.port, 4567);
  assert.deepEqual(await store.loadPreferences(), saved);
  assert.equal(fs.readFileSync(store.preferencesPath).includes(Buffer.from("0.0.0.0")), false);
  await assert.rejects(
    () => store.savePreferences({ ...saved, host: " " }),
    /listen address cannot be empty/
  );
});

test("desktop UI follows supported system languages and falls back to English", () => {
  assert.equal(resolveUiLocale("system", ["zh-Hans-CN"]), "zh-CN");
  assert.equal(resolveUiLocale("system", ["zh-Hant-TW"]), "en");
  assert.equal(resolveUiLocale("system", ["es-MX", "fr-FR"]), "fr");
  assert.equal(resolveUiLocale("system", ["es-MX"]), "en");
  assert.equal(resolveUiLocale("de", ["es-MX"]), "de");
});

test("desktop runtime starts the real Fastify gateway and stops cleanly", async (t) => {
  const store = await createStore(t);
  const config = await store.saveGatewayConfig({
    ...await store.loadGatewayConfig(),
    sshServers: [{ id: "bastion", host: "bastion.example.com", port: 22, username: "deploy" }],
    dbServers: [{
      id: "app-db",
      type: "postgres",
      sshServerId: "bastion",
      database: {
        host: "127.0.0.1",
        port: 5432,
        user: "app",
        password: "secret",
        database: "app"
      }
    }]
  });
  const port = await reservePort();
  const runtime = new ServiceRuntime(
    () => config,
    store.dataDirectory,
    { ...DEFAULT_DESKTOP_PREFERENCES, port },
    path.resolve("docs/openapi.json"),
    () => undefined
  );
  t.after(() => runtime.stop());

  await runtime.start();
  const response = await fetch(`http://127.0.0.1:${port}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(runtime.getStatus().phase, "running");
  assert.equal(runtime.getConnections(config).databases[0]?.state, "disconnected");
  assert.equal(runtime.getConnections(config).sshServers[0]?.state, "disconnected");

  await runtime.stop();
  assert.equal(runtime.getStatus().phase, "stopped");
  assert.equal(runtime.getConnections(config).databases[0]?.state, "disconnected");
});

test("gateway reports database activity and the connection result around each request", async () => {
  const events: Array<{ id: string; active: boolean; succeeded?: boolean }> = [];
  const config: GatewayConfig = {
    defaults: {
      maxRows: 100,
      queryTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      schemaCacheTtlMs: 0
    },
    sshServers: [],
    dbServers: [{
      id: "app-db",
      type: "postgres",
      database: {
        host: "127.0.0.1",
        port: 5432,
        user: "app",
        password: "secret",
        database: "app"
      }
    }],
    clients: [{
      id: "agent",
      apiKey: "test-key",
      dbServers: [{ serverId: "app-db", permission: "read" }]
    }]
  };
  const gateway = new GatewayService(config, {
    executeQuery: async () => ({
      columns: ["value"],
      rows: [{ value: 1 }],
      rowCount: 1,
      durationMs: 1,
      dbServerId: "app-db"
    }),
    onDatabaseActivity: (id, active, succeeded) => events.push({ id, active, succeeded })
  });

  const context = gateway.authenticate("test-key");
  await gateway.query(context, { dbServerId: "app-db", sql: "select 1" });

  assert.deepEqual(events, [
    { id: "app-db", active: true, succeeded: undefined },
    { id: "app-db", active: false, succeeded: true }
  ]);

  const failedEvents: Array<{ id: string; active: boolean; succeeded?: boolean }> = [];
  const failingGateway = new GatewayService(config, {
    executeQuery: async () => {
      throw new Error("database offline");
    },
    onDatabaseActivity: (id, active, succeeded) => failedEvents.push({ id, active, succeeded })
  });

  await assert.rejects(
    () => failingGateway.query(failingGateway.authenticate("test-key"), {
      dbServerId: "app-db",
      sql: "select 1"
    }),
    /database offline/
  );
  assert.deepEqual(failedEvents, [
    { id: "app-db", active: true, succeeded: undefined },
    { id: "app-db", active: false, succeeded: false }
  ]);
});

test("gateway tests a configured database with a minimal read-only query", async () => {
  const sql: string[] = [];
  const timeouts: Array<{ query: number; connect: number }> = [];
  const events: Array<{ id: string; active: boolean; succeeded?: boolean }> = [];
  const gateway = new GatewayService({
    defaults: {
      maxRows: 100,
      queryTimeoutMs: 30_000,
      connectTimeoutMs: 30_000,
      schemaCacheTtlMs: 0
    },
    sshServers: [],
    clients: [],
    dbServers: [{
      id: "app-db",
      type: "postgres",
      description: "Application database",
      database: {
        host: "127.0.0.1",
        port: 5432,
        user: "app",
        password: "secret",
        database: "app"
      }
    }]
  }, {
    executeQuery: async (options) => {
      sql.push(options.sql);
      timeouts.push({ query: options.queryTimeoutMs, connect: options.connectTimeoutMs });
      return {
        columns: ["value"],
        rows: [{ value: 1 }],
        rowCount: 1,
        durationMs: 1,
        dbServerId: options.dbServer.id
      };
    },
    onDatabaseActivity: (id, active, succeeded) => events.push({ id, active, succeeded })
  });

  await gateway.testConnection("app-db");

  assert.deepEqual(sql, ["SELECT 1"]);
  assert.deepEqual(timeouts, [{ query: 10_000, connect: 10_000 }]);
  assert.deepEqual(events, [
    { id: "app-db", active: true, succeeded: undefined },
    { id: "app-db", active: false, succeeded: true }
  ]);
  await gateway.close();
});

test("server forwards completed HTTP requests to the desktop log callback", async (t) => {
  const requests: Array<{ method: string; url: string; statusCode: number; durationMs: number }> = [];
  const app = buildServer({
    defaults: {
      maxRows: 100,
      queryTimeoutMs: 1000,
      connectTimeoutMs: 1000,
      schemaCacheTtlMs: 0
    },
    sshServers: [],
    dbServers: [],
    clients: []
  }, {
    onHttpRequest: (entry) => requests.push(entry)
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "GET");
  assert.equal(requests[0]?.url, "/health");
  assert.equal(requests[0]?.statusCode, 200);
  assert.ok((requests[0]?.durationMs ?? -1) >= 0);
});

async function reservePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
