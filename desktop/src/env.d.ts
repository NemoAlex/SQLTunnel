/// <reference types="vite/client" />

import type { SQLTunnelDesktopApi } from "../../shared/desktop.js";

declare global {
  interface Window {
    sqlTunnel: SQLTunnelDesktopApi;
  }
}

export {};
