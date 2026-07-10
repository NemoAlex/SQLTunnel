import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell
} from "electron";
import { DesktopConfigStore } from "./config-store.js";
import { ServiceRuntime } from "./service-runtime.js";
import { DESKTOP_CHANNELS } from "../shared/desktop.js";
import type { DesktopPreferences, DesktopSnapshot } from "../shared/desktop.js";
import type { GatewayConfig } from "../src/types.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let store: DesktopConfigStore;
let runtime: ServiceRuntime;
let config: GatewayConfig;
let preferences: DesktopPreferences;
let quitAfterShutdown = false;

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      createMainWindow();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.whenReady().then(initializeDesktopApp).catch((error) => {
    console.error(error);
    app.quit();
  });
}

async function initializeDesktopApp(): Promise<void> {
  app.setName("SQLTunnel");
  store = new DesktopConfigStore(app.getPath("userData"));
  store.initialize();
  config = store.loadGatewayConfig();
  preferences = store.loadPreferences();
  runtime = new ServiceRuntime(
    store.configPath,
    preferences,
    path.join(app.getAppPath(), "docs", "openapi.json"),
    broadcastSnapshot
  );

  applyLoginItemPreference();
  registerIpcHandlers();
  installApplicationMenu();
  createMainWindow();

  if (preferences.startOnLaunch) {
    await runtime.start().catch(() => undefined);
  }
}

function createMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 400,
    height: 520,
    minWidth: 360,
    minHeight: 400,
    maxWidth: 520,
    title: "SQLTunnel",
    backgroundColor: "#f4f5f7",
    fullscreenable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  loadRenderer(mainWindow, "main");
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 760,
    minHeight: 560,
    title: "SQLTunnel 设置",
    backgroundColor: "#f5f6f8",
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.once("ready-to-show", () => settingsWindow?.show());
  settingsWindow.on("page-title-updated", (event) => {
    event.preventDefault();
    settingsWindow?.setTitle("SQLTunnel 设置");
  });
  settingsWindow.on("closed", () => {
    settingsWindow = undefined;
  });
  loadRenderer(settingsWindow, "settings");
}

function loadRenderer(browserWindow: BrowserWindow, windowKind: "main" | "settings"): void {
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    const url = new URL(developmentUrl);
    url.searchParams.set("window", windowKind);
    void browserWindow.loadURL(url.toString());
    return;
  }
  void browserWindow.loadFile(
    path.join(dirname, "..", "..", "dist-renderer", "index.html"),
    { query: { window: windowKind } }
  );
}

function registerIpcHandlers(): void {
  ipcMain.handle(DESKTOP_CHANNELS.getSnapshot, () => getSnapshot());
  ipcMain.handle(DESKTOP_CHANNELS.saveConfig, (_event, nextConfig: GatewayConfig) => {
    config = store.saveGatewayConfig(nextConfig);
    runtime.record("success", "配置已保存；正在运行的服务将在下次启动时使用新配置");
    return getSnapshot();
  });
  ipcMain.handle(DESKTOP_CHANNELS.savePreferences, (_event, nextPreferences: DesktopPreferences) => {
    preferences = store.savePreferences(nextPreferences);
    runtime.setPreferences(preferences);
    applyLoginItemPreference();
    runtime.record("success", "桌面偏好已保存");
    return getSnapshot();
  });
  ipcMain.handle(DESKTOP_CHANNELS.startService, async () => {
    await runtime.start();
    return getSnapshot();
  });
  ipcMain.handle(DESKTOP_CHANNELS.stopService, async () => {
    await runtime.stop();
    return getSnapshot();
  });
  ipcMain.handle(DESKTOP_CHANNELS.restartService, async () => {
    await runtime.restart();
    return getSnapshot();
  });
  ipcMain.handle(DESKTOP_CHANNELS.openSettings, () => {
    createSettingsWindow();
  });
  ipcMain.handle(DESKTOP_CHANNELS.openConfigFolder, async () => {
    const error = await shell.openPath(store.dataDirectory);
    if (error) {
      throw new Error(error);
    }
  });
}

function getSnapshot(): DesktopSnapshot {
  return {
    config,
    preferences,
    service: runtime.getStatus(),
    connections: runtime.getConnections(config),
    logs: runtime.getLogs(),
    configPath: store.configPath
  };
}

function broadcastSnapshot(): void {
  if (!runtime || !store) {
    return;
  }
  for (const browserWindow of [mainWindow, settingsWindow]) {
    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.webContents.send(DESKTOP_CHANNELS.snapshotChanged, getSnapshot());
    }
  }
}

function applyLoginItemPreference(): void {
  if (!app.isPackaged) {
    return;
  }
  if (app.getLoginItemSettings().openAtLogin === preferences.launchAtLogin) {
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: preferences.launchAtLogin,
    openAsHidden: false
  });
}

function installApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "设置…",
          accelerator: "CommandOrControl+,",
          click: () => createSettingsWindow()
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("activate", () => createMainWindow());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!runtime || quitAfterShutdown) {
    return;
  }
  event.preventDefault();
  quitAfterShutdown = true;
  void runtime.stop().finally(() => app.quit());
});
