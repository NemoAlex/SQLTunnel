import { startServer } from "./app.js";
import { loadBackupConfig } from "./backup-config.js";
import { runBackupJob } from "./backup.js";
import { loadConfig } from "./config.js";

const [command, subcommand, ...args] = process.argv.slice(2);

if (!command || command === "serve") {
  await startServer();
} else if (command === "backup") {
  await handleBackupCommand(subcommand, args);
} else {
  printUsage();
  process.exit(1);
}

async function handleBackupCommand(subcommand: string | undefined, args: string[]) {
  const gatewayConfig = loadConfig();
  const backupConfig = loadBackupConfig(gatewayConfig);

  if (subcommand === "list") {
    if (!backupConfig.configured) {
      console.info("Backup is not configured.");
      return;
    }
    for (const job of backupConfig.jobs) {
      console.info(`${job.enabled ? "enabled " : "disabled"} ${job.id} ${job.schedule} ${job.dbServerId}`);
    }
    return;
  }

  if (subcommand === "run") {
    const jobId = readOption(args, "--job");
    if (!jobId) {
      throw new Error("backup run requires --job <jobId>");
    }
    await runBackupJob(gatewayConfig, backupConfig, jobId, console);
    return;
  }

  printUsage();
  process.exit(1);
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

function printUsage() {
  console.error([
    "Usage:",
    "  sqltunnel serve",
    "  sqltunnel backup list",
    "  sqltunnel backup run --job <jobId>"
  ].join("\n"));
}
