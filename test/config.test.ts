import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { GatewayError } from "../src/errors.js";

function writeGatewayConfig(descriptionLine: string): { configPath: string; cleanup: () => void } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqltunnel-config-"));
  const configPath = path.join(directory, "gateway.yaml");
  fs.writeFileSync(
    configPath,
    `dbServers:
  - id: app-postgres
${descriptionLine}    type: postgres
    database:
      host: 127.0.0.1
      port: 5432
      user: app
      password: secret
      database: app
clients: []
`
  );
  return { configPath, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test("loads an optional db server description", (t) => {
  const fixture = writeGatewayConfig("    description: Application data for customers and orders\n");
  t.after(fixture.cleanup);

  const config = loadConfig(fixture.configPath);

  assert.equal(config.dbServers[0]?.description, "Application data for customers and orders");
});

test("rejects an empty db server description", (t) => {
  const fixture = writeGatewayConfig("    description: \"  \"\n");
  t.after(fixture.cleanup);

  assert.throws(
    () => loadConfig(fixture.configPath),
    (error: unknown) =>
      error instanceof GatewayError &&
      error.code === "INVALID_CONFIG" &&
      error.message === "dbServers[app-postgres].description must be a non-empty string"
  );
});
