import { loadConfig } from "./config.js";
import { GatewayError } from "./errors.js";
import { buildServer } from "./server.js";

export async function startServer() {
  const config = loadConfig();
  const app = buildServer(config);

  try {
    await app.listen(resolveListenOptions());
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

function resolveListenOptions() {
  const host = process.env.FASTIFY_HOST ?? process.env.HOST ?? "0.0.0.0";
  const rawPort = process.env.FASTIFY_PORT ?? process.env.PORT ?? "3000";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new GatewayError("INVALID_LISTEN_PORT", `FASTIFY_PORT/PORT must be a positive integer: ${rawPort}`, 500);
  }

  return { host, port };
}
