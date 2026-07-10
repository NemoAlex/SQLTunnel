import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopPreferences,
  DesktopSnapshot,
  SQLTunnelDesktopApi
} from "../shared/desktop.js";
import type { GatewayConfig } from "../src/types.js";

const channels = {
  getSnapshot: "desktop:get-snapshot",
  saveConfig: "desktop:save-config",
  savePreferences: "desktop:save-preferences",
  startService: "desktop:start-service",
  stopService: "desktop:stop-service",
  restartService: "desktop:restart-service",
  openSettings: "desktop:open-settings",
  openConfigFolder: "desktop:open-config-folder",
  snapshotChanged: "desktop:snapshot-changed"
} as const;

const api: SQLTunnelDesktopApi = {
  getSnapshot: () => ipcRenderer.invoke(channels.getSnapshot) as Promise<DesktopSnapshot>,
  saveConfig: (config: GatewayConfig) =>
    ipcRenderer.invoke(channels.saveConfig, config) as Promise<DesktopSnapshot>,
  savePreferences: (preferences: DesktopPreferences) =>
    ipcRenderer.invoke(channels.savePreferences, preferences) as Promise<DesktopSnapshot>,
  startService: () => ipcRenderer.invoke(channels.startService) as Promise<DesktopSnapshot>,
  stopService: () => ipcRenderer.invoke(channels.stopService) as Promise<DesktopSnapshot>,
  restartService: () => ipcRenderer.invoke(channels.restartService) as Promise<DesktopSnapshot>,
  openSettings: () => ipcRenderer.invoke(channels.openSettings) as Promise<void>,
  openConfigFolder: () => ipcRenderer.invoke(channels.openConfigFolder) as Promise<void>,
  onSnapshot: (listener: (snapshot: DesktopSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: DesktopSnapshot) => listener(snapshot);
    ipcRenderer.on(channels.snapshotChanged, handler);
    return () => ipcRenderer.removeListener(channels.snapshotChanged, handler);
  }
};

contextBridge.exposeInMainWorld("sqlTunnel", api);
