import { startServer } from "./app.js";

const [command] = process.argv.slice(2);

if (!command || command === "serve") {
  await startServer();
} else {
  printUsage();
  process.exit(1);
}

function printUsage() {
  console.error("Usage: sqltunnel serve");
}
