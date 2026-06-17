const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

export function formatSqlLog(dbServerId: string, sql: string): string {
  return `${style(dbServerId, BOLD, CYAN)} ${style(sql, DIM)}`;
}

export function formatSshTunnelOpenedLog(sshServerId: string): string {
  return `${style("ssh", BOLD, GREEN)} ${style("open", GREEN)} ${style(sshServerId, BOLD)}`;
}

export function formatSshTunnelClosedLog(sshServerId: string): string {
  return `${style("ssh", BOLD, YELLOW)} ${style("close", YELLOW)} ${style(sshServerId, BOLD)}`;
}

function style(value: string, ...codes: string[]): string {
  return `${codes.join("")}${value}${RESET}`;
}
