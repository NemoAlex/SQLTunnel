import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell
} from "electron";
import { safeStorageConfigEncryption } from "./config-encryption.js";
import { DesktopConfigStore } from "./config-store.js";
import { ServiceRuntime } from "./service-runtime.js";
import { DESKTOP_CHANNELS } from "../shared/desktop.js";
import type { DesktopPreferences, DesktopSnapshot } from "../shared/desktop.js";
import { resolveUiLocale } from "../shared/ui-locale.js";
import type { UiLocale } from "../shared/ui-locale.js";
import type { GatewayConfig } from "../src/types.js";
import { text } from "./i18n.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
app.setName("SQLTunnel");
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let store: DesktopConfigStore;
let runtime: ServiceRuntime;
let config: GatewayConfig;
let preferences: DesktopPreferences;
let shutdownStarted = false;

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
  if (process.platform === "win32") {
    app.setAppUserModelId("dev.nemo.sqltunnel");
  }
  applyDevelopmentAppIcon();
  store = new DesktopConfigStore(app.getPath("userData"), safeStorageConfigEncryption);
  await store.initialize();
  config = await store.loadGatewayConfig();
  preferences = await store.loadPreferences();
  runtime = new ServiceRuntime(
    () => config,
    store.dataDirectory,
    preferences,
    path.join(app.getAppPath(), "docs", "openapi.json"),
    broadcastSnapshot,
    getUiLocale()
  );

  registerIpcHandlers();
  installApplicationMenu();
  createMainWindow();

  if (preferences.startOnLaunch) {
    await runtime.start().catch(() => undefined);
  }
}

function applyDevelopmentAppIcon(): void {
  if (process.platform !== "darwin" || app.isPackaged || !app.dock) {
    return;
  }
  app.dock.setIcon(path.join(app.getAppPath(), "assets", "icon-1024-macos.png"));
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
    ...getTitleBarOptions(),
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
    width: 840,
    height: 620,
    minWidth: 720,
    minHeight: 520,
    title: text(getUiLocale(), "SQLTunnel Settings"),
    ...getTitleBarOptions(),
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
    settingsWindow?.setTitle(text(getUiLocale(), "SQLTunnel Settings"));
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
  ipcMain.handle(DESKTOP_CHANNELS.saveConfig, async (_event, nextConfig: GatewayConfig) => {
    assertConfigurationEditable();
    config = await store.saveGatewayConfig(nextConfig);
    await runtime.configurationChanged();
    runtime.record("success", text(getUiLocale(), "Configuration saved"));
    return getSnapshot();
  });
  ipcMain.handle(DESKTOP_CHANNELS.savePreferences, async (_event, nextPreferences: DesktopPreferences) => {
    assertConfigurationEditable();
    preferences = await store.savePreferences(nextPreferences);
    runtime.setPreferences(preferences);
    runtime.setLocale(getUiLocale());
    runtime.record("success", text(getUiLocale(), "Desktop preferences saved"));
    installApplicationMenu();
    updateWindowTitles();
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
  ipcMain.handle(DESKTOP_CHANNELS.testDatabaseConnection, async (_event, dbServerId: string) => {
    if (typeof dbServerId !== "string" || !dbServerId.trim()) {
      throw new Error("Invalid database ID");
    }
    await runtime.testDatabaseConnection(dbServerId);
  });
  ipcMain.handle(DESKTOP_CHANNELS.testDraftDatabaseConnection, async (_event, draftConfig: GatewayConfig, dbServerId: string) => {
    assertDraftTestArguments(draftConfig, dbServerId);
    await runtime.testDraftDatabaseConnection(draftConfig, dbServerId);
  });
  ipcMain.handle(DESKTOP_CHANNELS.testDraftSshConnection, async (_event, draftConfig: GatewayConfig, sshServerId: string) => {
    assertDraftTestArguments(draftConfig, sshServerId);
    await runtime.testDraftSshConnection(draftConfig, sshServerId);
  });
  ipcMain.handle(DESKTOP_CHANNELS.openSettings, async () => {
    await requestOpenSettings();
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

function assertConfigurationEditable(): void {
  const phase = runtime.getStatus().phase;
  if (phase === "running" || phase === "starting" || phase === "stopping") {
    throw new Error(text(getUiLocale(), "Stop SQLTunnel before changing settings"));
  }
}

function assertDraftTestArguments(configDraft: unknown, connectionId: unknown): asserts configDraft is GatewayConfig {
  if (!configDraft || typeof configDraft !== "object" || typeof connectionId !== "string" || !connectionId.trim()) {
    throw new Error("Invalid connection test configuration");
  }
}

async function requestOpenSettings(): Promise<void> {
  const phase = runtime.getStatus().phase;
  if (phase !== "running" && phase !== "starting" && phase !== "stopping") {
    createSettingsWindow();
    return;
  }

  const options: Electron.MessageBoxOptions = {
    type: "warning",
    message: text(getUiLocale(), "SQLTunnel must be stopped first"),
    detail: text(getUiLocale(), "Configuration cannot be changed while the service is running."),
    buttons: [text(getUiLocale(), "Cancel"), text(getUiLocale(), "Stop and Open Settings")],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  if (result.response !== 1) {
    return;
  }
  await runtime.stop();
  createSettingsWindow();
}

function installApplicationMenu(): void {
  const locale = getUiLocale();
  const settingsItem: Electron.MenuItemConstructorOptions = {
    label: text(locale, "Settings…"),
    accelerator: "CommandOrControl+,",
    click: () => void requestOpenSettings()
  };
  const template: Electron.MenuItemConstructorOptions[] = [
    process.platform === "darwin" ? {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        settingsItem,
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    } : {
      label: text(locale, "File"),
      submenu: [
        settingsItem,
        { type: "separator" },
        { role: "quit", label: text(locale, "Exit") }
      ]
    },
    {
      label: text(locale, "Edit"),
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
    process.platform === "darwin" ? {
      label: text(locale, "Window"),
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" }
      ]
    } : {
      label: text(locale, "Window"),
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getTitleBarOptions(): Pick<Electron.BrowserWindowConstructorOptions, "titleBarStyle" | "titleBarOverlay"> {
  if (process.platform === "darwin") {
    return { titleBarStyle: "hiddenInset" };
  }
  if (process.platform === "win32") {
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#f7f7f8",
        symbolColor: "#252936",
        height: 38
      }
    };
  }
  return {};
}

function getUiLocale(): UiLocale {
  return resolveUiLocale(preferences.language, app.getPreferredSystemLanguages());
}

function updateWindowTitles(): void {
  settingsWindow?.setTitle(text(getUiLocale(), "SQLTunnel Settings"));
}

app.on("activate", () => createMainWindow());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!runtime) {
    return;
  }
  event.preventDefault();
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  void runtime.stop()
    .catch((error) => console.error("Failed to stop SQLTunnel while quitting", error))
    .finally(() => app.exit(0));
});
