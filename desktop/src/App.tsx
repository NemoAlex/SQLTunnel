import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  Database,
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Network,
  Plus,
  Power,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  X
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  ClientConfig,
  DbServerConfig,
  GatewayConfig,
  SshServerConfig
} from "../../src/types.js";
import type {
  ConnectionIndicator,
  DesktopPreferences,
  DesktopSnapshot
} from "../../shared/desktop.js";
import { resolveUiLocale } from "../../shared/ui-locale.js";
import type { UiLocale } from "../../shared/ui-locale.js";
import { createTranslator } from "./i18n.js";
import type { Translate } from "./i18n.js";

type Section = "databases" | "ssh" | "clients" | "settings";
type Notice = { kind: "success" | "error" | "info"; message: string };
type ConnectionTestState = "idle" | "testing" | "success" | "error";

const navigation: Array<{
  id: Section;
  icon: typeof Database;
}> = [
  { id: "databases", icon: Database },
  { id: "ssh", icon: Network },
  { id: "clients", icon: UsersRound },
  { id: "settings", icon: Settings2 }
];

const I18nContext = createContext<{ locale: UiLocale; t: Translate }>({
  locale: "en",
  t: createTranslator("en")
});

function useI18n() {
  return useContext(I18nContext);
}

export default function App() {
  const windowKind = useMemo(
    () => new URLSearchParams(window.location.search).get("window") === "settings" ? "settings" : "main",
    []
  );
  const [snapshot, setSnapshot] = useState<DesktopSnapshot>();
  const [config, setConfig] = useState<GatewayConfig>();
  const [preferences, setPreferences] = useState<DesktopPreferences>();
  const [section, setSection] = useState<Section>("databases");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const dirtyRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const locale = useMemo(
    () => resolveUiLocale(preferences?.language ?? "system", navigator.languages),
    [preferences?.language]
  );
  const t = useMemo(() => createTranslator(locale), [locale]);
  const translatorRef = useRef(t);

  useEffect(() => {
    translatorRef.current = t;
    document.documentElement.lang = locale;
    document.title = windowKind === "settings" ? t("SQLTunnel Settings") : "SQLTunnel";
  }, [locale, t, windowKind]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const acceptSnapshot = useCallback((next: DesktopSnapshot, forceDraft = false) => {
    setSnapshot(next);
    if (forceDraft || !dirtyRef.current) {
      setConfig(structuredClone(next.config));
      setPreferences({ ...next.preferences });
    }
  }, []);

  // Keep the initial snapshot subscription stable. Re-running it on a locale
  // change would force the persisted language over the unsaved selection.
  useEffect(() => {
    void window.sqlTunnel.getSnapshot()
      .then((next) => acceptSnapshot(next, true))
      .catch((error) => setNotice({ kind: "error", message: getErrorMessage(error, translatorRef.current) }));
    return window.sqlTunnel.onSnapshot((next) => acceptSnapshot(next));
  }, [acceptSnapshot]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timeout = window.setTimeout(() => setNotice(undefined), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const markConfig = useCallback((updater: (current: GatewayConfig) => GatewayConfig) => {
    draftRevisionRef.current += 1;
    setConfig((current) => current ? updater(current) : current);
    setDirty(true);
  }, []);

  const markPreferences = useCallback((updater: (current: DesktopPreferences) => DesktopPreferences) => {
    draftRevisionRef.current += 1;
    setPreferences((current) => current ? updater(current) : current);
    setDirty(true);
  }, []);

  const saveDraft = useCallback(async (showNotice = true) => {
    if (!config || !preferences) {
      throw new Error(t("Configuration is not loaded"));
    }
    const revision = draftRevisionRef.current;
    const configDraft = structuredClone(config);
    const preferencesDraft = { ...preferences };
    await window.sqlTunnel.savePreferences(preferencesDraft);
    const afterConfig = await window.sqlTunnel.saveConfig(configDraft);
    if (draftRevisionRef.current === revision) {
      setDirty(false);
      dirtyRef.current = false;
      acceptSnapshot(afterConfig, true);
    } else {
      acceptSnapshot(afterConfig);
    }
    if (showNotice) {
      setNotice({
        kind: "success",
        message: afterConfig.service.phase === "running"
          ? t("Configuration saved. Restart the service to apply changes.")
          : t("Configuration saved")
      });
    }
    return afterConfig;
  }, [acceptSnapshot, config, preferences, t]);

  useEffect(() => {
    if (windowKind !== "settings" || !dirty || !config || !preferences) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      void saveDraft(false).catch((error) => {
        setNotice({ kind: "error", message: getErrorMessage(error, t) });
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [config, dirty, preferences, saveDraft, windowKind]);

  const runAction = useCallback(async (action: () => Promise<DesktopSnapshot>) => {
    setBusy(true);
    try {
      const next = await action();
      acceptSnapshot(next, !dirtyRef.current);
      return next;
    } catch (error) {
      setNotice({ kind: "error", message: getErrorMessage(error, t) });
      throw error;
    } finally {
      setBusy(false);
    }
  }, [acceptSnapshot, t]);

  const toggleService = async () => {
    if (!snapshot) {
      return;
    }
    if (snapshot.service.phase === "running" || snapshot.service.phase === "starting") {
      await runAction(() => window.sqlTunnel.stopService()).catch(() => undefined);
      return;
    }
    setBusy(true);
    try {
      if (dirtyRef.current) {
        await saveDraft(false);
      }
      const next = await window.sqlTunnel.startService();
      acceptSnapshot(next, true);
      setNotice({ kind: "success", message: t("SQLTunnel started") });
    } catch (error) {
      setNotice({ kind: "error", message: getErrorMessage(error, t) });
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot || !config || !preferences) {
    return (
      <I18nContext.Provider value={{ locale, t }}>
        <main className="loading-screen">
          <div className="brand-mark large"><Network size={28} /></div>
          <div className="loading-copy">
            <strong>{t("Opening SQLTunnel")}</strong>
            <span>{t("Loading local configuration and service status…")}</span>
          </div>
        </main>
      </I18nContext.Provider>
    );
  }

  const isTransitioning = snapshot.service.phase === "starting" || snapshot.service.phase === "stopping";

  if (windowKind === "main") {
    return (
      <I18nContext.Provider value={{ locale, t }}>
        <MainWindow
          snapshot={snapshot}
          busy={busy || isTransitioning}
          notice={notice}
          onToggle={() => void toggleService()}
        />
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, t }}>
      <SettingsWindow
        snapshot={snapshot}
        config={config}
        preferences={preferences}
        section={section}
        notice={notice}
        onSectionChange={setSection}
        onConfigChange={markConfig}
        onPreferencesChange={markPreferences}
      />
    </I18nContext.Provider>
  );
}

function MainWindow({ snapshot, busy, notice, onToggle }: {
  snapshot: DesktopSnapshot;
  busy: boolean;
  notice?: Notice;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"status" | "logs">("status");
  const running = snapshot.service.phase === "running";
  const statusLabels = {
    stopped: t("Stopped"),
    starting: t("Starting"),
    running: t("Running"),
    stopping: t("Stopping"),
    error: t("Error")
  } as const;
  return (
    <div className="main-window-shell">
      <WindowTitlebar title="SQLTunnel" />
      <section className="gateway-control">
        <div className="gateway-copy">
          <span className={`status-dot ${snapshot.service.phase}`} />
          <div>
            <strong>{statusLabels[snapshot.service.phase]}</strong>
            <small>{t("Secure MCP and OpenAPI gateway for MySQL and PostgreSQL.")}</small>
          </div>
        </div>
        <button
          className={`main-power-switch ${running ? "on" : ""}`}
          aria-label={running ? t("Stop service") : t("Start service")}
          aria-pressed={running}
          disabled={busy}
          onClick={onToggle}
        >
          <span><Power size={14} /></span>
        </button>
      </section>

      <nav className="main-tabs" aria-label={t("Main window content")} role="tablist">
        <button role="tab" aria-selected={activeTab === "status"} className={activeTab === "status" ? "active" : ""} onClick={() => setActiveTab("status")}>
          <Server size={13} />{t("Status")}
        </button>
        <button role="tab" aria-selected={activeTab === "logs"} className={activeTab === "logs" ? "active" : ""} onClick={() => setActiveTab("logs")}>
          <Activity size={13} />{t("Logs")}
          {snapshot.logs.length > 0 && <span>{snapshot.logs.length}</span>}
        </button>
      </nav>

      {activeTab === "status" ? (
        <main className="connection-overview">
          <ConnectionGroup title={t("Database servers")} connections={snapshot.connections.databases} emptyLabel={t("No databases configured")} testable />
          <ConnectionGroup title={t("SSH connections")} connections={snapshot.connections.sshServers} emptyLabel={t("No SSH configured")} />
        </main>
      ) : (
        <MainLogView logs={snapshot.logs} />
      )}

      <footer className="main-window-footer">
        {running && <EndpointCopyControl snapshot={snapshot} />}
        <button onClick={() => void window.sqlTunnel.openSettings()}><Settings2 size={14} />{t("Settings…")}</button>
      </footer>
      <NoticeToast notice={notice} />
    </div>
  );
}

function EndpointCopyControl({ snapshot }: { snapshot: DesktopSnapshot }) {
  const { t } = useI18n();
  const [copiedEndpoint, setCopiedEndpoint] = useState<"mcp" | "openapi">();
  const [menuOpen, setMenuOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<number | undefined>(undefined);
  const menuCloseTimer = useRef<number | undefined>(undefined);
  const baseUrl = snapshot.service.url ?? formatHttpUrl(snapshot.preferences.host, snapshot.preferences.port);
  const urls = {
    mcp: `${baseUrl.replace(/\/$/, "")}/mcp`,
    openapi: `${baseUrl.replace(/\/$/, "")}/openapi.json`
  };

  useEffect(() => () => {
    if (resetTimer.current !== undefined) {
      window.clearTimeout(resetTimer.current);
    }
    if (menuCloseTimer.current !== undefined) {
      window.clearTimeout(menuCloseTimer.current);
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const markCopied = (endpoint: "mcp" | "openapi") => {
    setCopiedEndpoint(endpoint);
    if (resetTimer.current !== undefined) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => setCopiedEndpoint(undefined), 1400);
  };

  const copyEndpoint = async (endpoint: "mcp" | "openapi") => {
    await navigator.clipboard.writeText(urls[endpoint]);
    markCopied(endpoint);
    if (menuCloseTimer.current !== undefined) {
      window.clearTimeout(menuCloseTimer.current);
    }
    menuCloseTimer.current = window.setTimeout(() => setMenuOpen(false), 700);
  };

  const toggleMenu = () => {
    if (menuCloseTimer.current !== undefined) {
      window.clearTimeout(menuCloseTimer.current);
      menuCloseTimer.current = undefined;
    }
    setMenuOpen((value) => !value);
  };

  return (
    <div className="endpoint-copy-control" ref={controlRef}>
      <button
        className={`endpoint-copy-trigger ${copiedEndpoint === "mcp" ? "copied" : ""} ${menuOpen ? "menu-open" : ""}`}
        type="button"
        title={urls.mcp}
        aria-label={t("Endpoint type")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={toggleMenu}
      >
        <span>{urls.mcp}</span>
        {copiedEndpoint ? <Check size={13} /> : <ChevronRight className="endpoint-menu-chevron" size={13} />}
      </button>
      {menuOpen && (
        <div className="endpoint-copy-menu" role="menu">
          {(["mcp", "openapi"] as const).map((endpoint) => (
            <button
              key={endpoint}
              type="button"
              role="menuitem"
              aria-label={`${t("Copy URL")}: ${endpoint === "mcp" ? "MCP" : "OpenAPI"}`}
              onClick={() => void copyEndpoint(endpoint)}
            >
              <span><strong>{endpoint === "mcp" ? "MCP" : "OpenAPI"}</strong><small>{urls[endpoint]}</small></span>
              {copiedEndpoint === endpoint ? <Check size={14} /> : <Copy size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MainLogView({ logs }: { logs: DesktopSnapshot["logs"] }) {
  const { locale, t } = useI18n();
  const consoleRef = useRef<HTMLTextAreaElement>(null);
  const output = useMemo(() => [...logs]
    .reverse()
    .map((entry) => `${formatLogTimestamp(entry.timestamp, locale)} ${entry.level.toUpperCase().padEnd(7)} ${entry.message}`)
    .join("\n"), [locale, logs]);

  useEffect(() => {
    const consoleElement = consoleRef.current;
    if (consoleElement) {
      consoleElement.scrollTop = consoleElement.scrollHeight;
    }
  }, [output]);

  return (
    <main className="main-log-view">
      <div className="main-log-toolbar">
        <span>{t("Runtime log")}</span>
        <small>{t("{count} entries", { count: logs.length })}</small>
      </div>
      <textarea
        ref={consoleRef}
        className="main-log-console"
        aria-label={t("Runtime log")}
        readOnly
        spellCheck={false}
        value={output}
        placeholder={t("Logs will appear here after the service starts.")}
      />
    </main>
  );
}

function formatLogTimestamp(timestamp: string, locale: UiLocale): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp)).replaceAll("/", "-");
}

function ConnectionGroup({ title, connections, emptyLabel, testable = false }: {
  title: string;
  connections: ConnectionIndicator[];
  emptyLabel: string;
  testable?: boolean;
}) {
  return (
    <section className="connection-group">
      <header><strong>{title}</strong><span>{connections.length}</span></header>
      <div className="connection-list">
        {connections.length === 0 ? (
          <div className="connection-empty">{emptyLabel}</div>
        ) : connections.map((connection) => <ConnectionRow key={connection.id} connection={connection} testable={testable} />)}
      </div>
    </section>
  );
}

function ConnectionRow({ connection, testable }: { connection: ConnectionIndicator; testable: boolean }) {
  const { t } = useI18n();
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState<string>();
  const resetTimer = useRef<number | undefined>(undefined);
  const labels = {
    disconnected: t("Not connected"),
    ready: t("Connected"),
    active: t("Request active"),
    connected: t("Connected")
  } as const;

  useEffect(() => () => {
    if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current);
  }, []);

  const testConnection = async () => {
    if (testState === "testing") return;
    setTestState("testing");
    setTestError(undefined);
    try {
      await window.sqlTunnel.testDatabaseConnection(connection.id);
      setTestState("success");
    } catch (error) {
      setTestState("error");
      setTestError(getErrorMessage(error, t));
    }
    if (resetTimer.current !== undefined) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setTestState("idle");
      setTestError(undefined);
    }, 2800);
  };

  const testLabel = testState === "testing"
    ? t("Testing")
    : testState === "success"
      ? t("Connection succeeded")
      : testState === "error"
        ? t("Connection failed")
        : t("Test");
  return (
    <div className={`connection-row ${testable ? "testable" : ""}`}>
      <span className={`connection-dot ${connection.state}`} />
      <div>
        <strong>{connection.label}</strong>
        {(testError || connection.detail) && <small title={testError}>{testError ?? connection.detail}</small>}
      </div>
      {testable && (
        <button
          className={`connection-test-button ${testState}`}
          type="button"
          disabled={testState === "testing"}
          title={testError ?? t("Test connection")}
          onClick={() => void testConnection()}
        >
          {testState === "testing" ? <RefreshCw size={12} /> : testState === "success" ? <Check size={12} /> : testState === "error" ? <AlertCircle size={12} /> : <Activity size={12} />}
          <span>{testLabel}</span>
        </button>
      )}
      <span className="connection-label">{labels[connection.state]}</span>
    </div>
  );
}

function SettingsWindow({
  snapshot,
  config,
  preferences,
  section,
  notice,
  onSectionChange,
  onConfigChange,
  onPreferencesChange
}: {
  snapshot: DesktopSnapshot;
  config: GatewayConfig;
  preferences: DesktopPreferences;
  section: Section;
  notice?: Notice;
  onSectionChange: (section: Section) => void;
  onConfigChange: EditorProps["onChange"];
  onPreferencesChange: (updater: (current: DesktopPreferences) => DesktopPreferences) => void;
}) {
  const { t } = useI18n();
  const labels: Record<Section, string> = {
    databases: t("Database"),
    ssh: "SSH",
    clients: t("Client"),
    settings: t("Settings")
  };
  const descriptions: Record<Section, string> = {
    databases: t("MySQL and PostgreSQL"),
    ssh: t("Bastions and keys"),
    clients: t("API keys and access"),
    settings: t("Port and default limits")
  };
  return (
    <div className="settings-shell">
      <WindowTitlebar title={t("SQLTunnel Settings")} />
      <aside className="settings-sidebar">
        <div className="settings-title"><Settings2 size={18} /><strong>{t("Settings")}</strong></div>
        <nav aria-label={t("Settings categories")} role="tablist">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} role="tab" aria-selected={section === item.id} className={section === item.id ? "active" : ""} onClick={() => onSectionChange(item.id)}>
                <Icon size={16} />
                <span><strong>{labels[item.id]}</strong><small>{descriptions[item.id]}</small></span>
                <ChevronRight size={13} />
              </button>
            );
          })}
        </nav>
        <button className="settings-config-folder" onClick={() => void window.sqlTunnel.openConfigFolder()} title={snapshot.configPath}>
          <FolderOpen size={14} /><span>{t("Open configuration folder")}</span>
        </button>
      </aside>
      <section className="settings-workspace">
        <main className="settings-content">
          {section === "databases" && <DatabaseEditor config={config} onChange={onConfigChange} />}
          {section === "ssh" && <SshEditor config={config} onChange={onConfigChange} />}
          {section === "clients" && <ClientEditor config={config} onChange={onConfigChange} />}
          {section === "settings" && (
            <SettingsEditor
              config={config}
              preferences={preferences}
              onConfigChange={onConfigChange}
              onPreferencesChange={onPreferencesChange}
            />
          )}
        </main>
      </section>
      <NoticeToast notice={notice} />
    </div>
  );
}

function WindowTitlebar({ title }: { title: string }) {
  return <header className="window-titlebar"><strong>{title}</strong></header>;
}

function NoticeToast({ notice }: { notice?: Notice }) {
  if (!notice) return null;
  return (
    <div className={`toast ${notice.kind}`} role="status">
      {notice.kind === "success" ? <Check size={17} /> : notice.kind === "error" ? <AlertCircle size={17} /> : <Activity size={17} />}
      <span>{notice.message}</span>
    </div>
  );
}

function DatabaseEditor({ config, onChange }: EditorProps) {
  const { t } = useI18n();
  const [editor, setEditor] = useState<{ index?: number; draft: DbServerConfig }>();
  const [editorError, setEditorError] = useState<string>();
  const [databaseTestState, setDatabaseTestState] = useState<ConnectionTestState>("idle");
  const databaseTestRevision = useRef(0);
  const [sshDraft, setSshDraft] = useState<SshServerConfig>();
  const [sshError, setSshError] = useState<string>();
  const [sshTestState, setSshTestState] = useState<ConnectionTestState>("idle");
  const sshTestRevision = useRef(0);

  const createDatabase = (): DbServerConfig => ({
    id: uniqueId("database", config.dbServers.map((item) => item.id), config.dbServers.length + 1),
    type: "postgres",
    database: {
      host: "127.0.0.1",
      port: 5432,
      user: "postgres",
      password: "",
      database: "postgres"
    }
  });

  const saveDatabase = () => {
    if (!editor) return;
    const error = validateDatabaseDraft(editor.draft, config, t, editor.index);
    if (error) {
      setEditorError(error);
      return;
    }
    databaseTestRevision.current += 1;
    const previousId = editor.index === undefined ? undefined : config.dbServers[editor.index]?.id;
    onChange((current) => ({
      ...current,
      dbServers: editor.index === undefined
        ? [...current.dbServers, editor.draft]
        : current.dbServers.map((item, index) => index === editor.index ? editor.draft : item),
      clients: previousId && previousId !== editor.draft.id
        ? current.clients.map((client) => ({
            ...client,
            dbServers: client.dbServers.map((grant) => grant.serverId === previousId
              ? { ...grant, serverId: editor.draft.id }
              : grant)
          }))
        : current.clients
    }));
    setEditor(undefined);
    setEditorError(undefined);
  };

  const remove = (index: number) => {
    databaseTestRevision.current += 1;
    const removedId = config.dbServers[index]?.id;
    onChange((current) => ({
      ...current,
      dbServers: current.dbServers.filter((_, itemIndex) => itemIndex !== index),
      clients: current.clients.map((client) => ({
        ...client,
        dbServers: client.dbServers.filter((grant) => grant.serverId !== removedId)
      }))
    }));
    setEditor(undefined);
  };

  const createSsh = () => {
    sshTestRevision.current += 1;
    setSshDraft({
      id: uniqueId("bastion", config.sshServers.map((item) => item.id), config.sshServers.length + 1),
      host: "",
      idleTimeoutMs: 60_000
    });
    setSshError(undefined);
    setSshTestState("idle");
  };

  const saveSsh = () => {
    if (!sshDraft || !editor) return;
    const error = validateSshDraft(sshDraft, config, t);
    if (error) {
      setSshError(error);
      return;
    }
    sshTestRevision.current += 1;
    onChange((current) => ({ ...current, sshServers: [...current.sshServers, sshDraft] }));
    setEditor({ ...editor, draft: { ...editor.draft, sshServerId: sshDraft.id } });
    setSshDraft(undefined);
    setSshError(undefined);
  };

  const testDatabaseDraft = async () => {
    if (!editor || databaseTestState === "testing") return;
    const error = validateDatabaseDraft(editor.draft, config, t, editor.index);
    if (error) {
      setEditorError(error);
      setDatabaseTestState("error");
      return;
    }
    setEditorError(undefined);
    setDatabaseTestState("testing");
    const revision = ++databaseTestRevision.current;
    try {
      await window.sqlTunnel.testDraftDatabaseConnection(
        configWithDatabaseDraft(config, editor.draft),
        editor.draft.id
      );
      if (revision !== databaseTestRevision.current) return;
      setDatabaseTestState("success");
    } catch (error) {
      if (revision !== databaseTestRevision.current) return;
      setEditorError(getErrorMessage(error, t));
      setDatabaseTestState("error");
    }
  };

  const testSshDraft = async () => {
    if (!sshDraft || sshTestState === "testing") return;
    const error = validateSshDraft(sshDraft, config, t);
    if (error) {
      setSshError(error);
      setSshTestState("error");
      return;
    }
    setSshError(undefined);
    setSshTestState("testing");
    const revision = ++sshTestRevision.current;
    try {
      await window.sqlTunnel.testDraftSshConnection(configWithSshDraft(config, sshDraft), sshDraft.id);
      if (revision !== sshTestRevision.current) return;
      setSshTestState("success");
    } catch (error) {
      if (revision !== sshTestRevision.current) return;
      setSshError(getErrorMessage(error, t));
      setSshTestState("error");
    }
  };

  return (
    <div className="page">
      <PageHeading eyebrow="CONNECTIONS" title={t("Database connections")} description={t("Connect MySQL and PostgreSQL directly or through reusable SSH tunnels, then test each connection before saving.")} action={<button className="button primary" onClick={() => { databaseTestRevision.current += 1; setEditor({ draft: createDatabase() }); setEditorError(undefined); setDatabaseTestState("idle"); }}><Plus size={16} />{t("Add database")}</button>} />
      {config.dbServers.length === 0 ? (
        <EmptyState icon={Database} title={t("No database connections yet")} description={t("Add one to assign client access.")} actionLabel={t("Add database")} onAction={() => { databaseTestRevision.current += 1; setEditor({ draft: createDatabase() }); setEditorError(undefined); setDatabaseTestState("idle"); }} />
      ) : (
        <div className="record-list">
          {config.dbServers.map((database, index) => <RecordRow key={`${database.id}-${index}`} icon={Database} title={database.id} detail={`${database.type === "postgres" ? "PostgreSQL" : "MySQL"} · ${database.database.host}:${database.database.port}`} badge={database.sshServerId ? "SSH" : undefined} onClick={() => { databaseTestRevision.current += 1; setEditor({ index, draft: structuredClone(database) }); setEditorError(undefined); setDatabaseTestState("idle"); }} />)}
        </div>
      )}
      {editor && (
        <ModalShell title={editor.index === undefined ? t("Add database") : t("Edit database")} error={editorError} onCancel={() => { databaseTestRevision.current += 1; setEditor(undefined); setEditorError(undefined); setDatabaseTestState("idle"); }} onSave={saveDatabase} onDelete={editor.index === undefined ? undefined : () => remove(editor.index!)} onTest={() => void testDatabaseDraft()} testState={databaseTestState}>
          <div className="modal-form"><DatabaseCard database={editor.draft} sshServers={config.sshServers} onChange={(draft) => { databaseTestRevision.current += 1; setEditor({ ...editor, draft }); setEditorError(undefined); setDatabaseTestState("idle"); }} onRemove={() => undefined} onOpenSsh={createSsh} /></div>
        </ModalShell>
      )}
      {sshDraft && (
        <ModalShell title={t("Add SSH")} error={sshError} onCancel={() => { sshTestRevision.current += 1; setSshDraft(undefined); setSshError(undefined); setSshTestState("idle"); }} onSave={saveSsh} onTest={() => void testSshDraft()} testState={sshTestState} elevated>
          <div className="modal-form"><SshCard ssh={sshDraft} onChange={(draft) => { sshTestRevision.current += 1; setSshDraft(draft); setSshError(undefined); setSshTestState("idle"); }} onRemove={() => undefined} /></div>
        </ModalShell>
      )}
    </div>
  );
}

function DatabaseCard({ database, sshServers, onChange, onRemove, onOpenSsh }: { database: DbServerConfig; sshServers: SshServerConfig[]; onChange: (next: DbServerConfig) => void; onRemove: () => void; onOpenSsh: () => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const patch = (next: Partial<DbServerConfig>) => onChange({ ...database, ...next });
  const patchDatabase = (next: Partial<DbServerConfig["database"]>) => onChange({ ...database, database: { ...database.database, ...next } });
  const advancedCount = [database.maxRows, database.queryTimeoutMs, database.connectTimeoutMs]
    .filter((value) => value !== undefined).length;

  return (
    <article className="editor-card">
      <button className="editor-card-header" onClick={() => setExpanded((value) => !value)}>
        <span className={`database-badge ${database.type}`}><Database size={18} /></span>
        <span className="editor-card-title"><strong>{database.id || t("Unnamed database")}</strong><small>{database.database.host}:{database.database.port} · {database.database.database || t("No database selected")}</small></span>
        {database.sshServerId && <span className="soft-badge"><Network size={12} />SSH</span>}
        <span className={`type-badge ${database.type}`}>{database.type === "postgres" ? "PostgreSQL" : "MySQL"}</span>
        <ChevronRight className={`expand-icon ${expanded ? "expanded" : ""}`} size={17} />
      </button>
      {expanded && (
        <div className="editor-card-body">
          <div className="form-section">
            <FormSectionTitle title={t("Connection identity")} description={t("Used by API and MCP")} />
            <div className="form-grid two">
              <Field label={t("Connection ID")} required><input value={database.id} onChange={(event) => patch({ id: event.target.value })} placeholder="prod-postgres" /></Field>
              <Field label={t("Database type")} required>
                <select value={database.type} onChange={(event) => {
                  const nextType = event.target.value as DbServerConfig["type"];
                  patch({ type: nextType, database: { ...database.database, port: nextType === "postgres" ? 5432 : 3306 } });
                }}>
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                </select>
              </Field>
              <Field className="span-two" label={t("Description")} hint={t("Optional")}><input value={database.description ?? ""} onChange={(event) => patch({ description: emptyAsUndefined(event.target.value) })} placeholder={t("For example: order data")} /></Field>
            </div>
          </div>

          <div className="form-section">
            <FormSectionTitle title={t("Database credentials")} />
            <div className="form-grid three">
              <Field className="span-two" label={t("Host")} required><input value={database.database.host} onChange={(event) => patchDatabase({ host: event.target.value })} placeholder="127.0.0.1" /></Field>
              <Field label={t("Port")} required><NumberInput value={database.database.port} onChange={(value) => patchDatabase({ port: value ?? 0 })} /></Field>
              <Field label={t("Database name")} required><input value={database.database.database} onChange={(event) => patchDatabase({ database: event.target.value })} placeholder="app" /></Field>
              <Field label={t("Username")} required><input value={database.database.user} onChange={(event) => patchDatabase({ user: event.target.value })} placeholder="postgres" autoComplete="off" /></Field>
              <Field label={t("Password")} required>
                <div className="secret-input"><input type={showPassword ? "text" : "password"} value={database.database.password ?? ""} onChange={(event) => patchDatabase({ password: event.target.value })} autoComplete="new-password" /><button onClick={() => setShowPassword((value) => !value)} type="button" aria-label={t("Show or hide password")}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
              </Field>
            </div>
          </div>

          <div className="form-section">
            <FormSectionTitle title={t("Connection method")} description={t("Direct or SSH")} />
            <div className="form-grid two">
              <div className="field span-two">
                <span className="field-label">{t("SSH tunnel")}</span>
                <div className="field-action-row">
                  <select value={database.sshServerId ?? ""} onChange={(event) => patch({ sshServerId: emptyAsUndefined(event.target.value) })}><option value="">{t("Direct connection")}</option>{sshServers.map((ssh) => <option key={ssh.id} value={ssh.id}>{ssh.id}</option>)}</select>
                  <button className="inline-action-button" type="button" onClick={onOpenSsh}><Plus size={15} />{t("Add SSH…")}</button>
                </div>
              </div>
            </div>
          </div>

          <div className="advanced-settings">
            <AdvancedToggle expanded={advancedExpanded} onToggle={() => setAdvancedExpanded((value) => !value)} description={advancedCount > 0 ? t("{count} configured", { count: advancedCount }) : t("Per-connection limits")} />
            {advancedExpanded && (
              <div className="advanced-settings-body">
                <div className="form-section">
                  <FormSectionTitle title={t("Per-connection limits")} description={t("Override global defaults")} />
                  <div className="form-grid three">
                    <Field label={t("Max rows")} hint={t("Inherit global")}><NumberInput value={database.maxRows} optional onChange={(value) => patch({ maxRows: value })} /></Field>
                    <Field label={t("Query timeout (ms)")} hint={t("Inherit global")}><NumberInput value={database.queryTimeoutMs} optional onChange={(value) => patch({ queryTimeoutMs: value })} /></Field>
                    <Field label={t("Connection timeout (ms)")} hint={t("Inherit global")}><NumberInput value={database.connectTimeoutMs} optional onChange={(value) => patch({ connectTimeoutMs: value })} /></Field>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="editor-footer"><button className="danger-link" onClick={onRemove}><Trash2 size={14} />{t("Delete this database")}</button></div>
        </div>
      )}
    </article>
  );
}

function SshEditor({ config, onChange }: EditorProps) {
  const { t } = useI18n();
  const [editor, setEditor] = useState<{ index?: number; draft: SshServerConfig }>();
  const [editorError, setEditorError] = useState<string>();
  const [testState, setTestState] = useState<ConnectionTestState>("idle");
  const testRevision = useRef(0);

  const createSsh = (): SshServerConfig => ({
      id: uniqueId("bastion", config.sshServers.map((item) => item.id), config.sshServers.length + 1),
      host: "",
      idleTimeoutMs: 60_000
  });

  const save = () => {
    if (!editor) return;
    const error = validateSshDraft(editor.draft, config, t, editor.index);
    if (error) {
      setEditorError(error);
      return;
    }
    testRevision.current += 1;
    const previousId = editor.index === undefined ? undefined : config.sshServers[editor.index]?.id;
    onChange((current) => ({
      ...current,
      sshServers: editor.index === undefined
        ? [...current.sshServers, editor.draft]
        : current.sshServers.map((item, index) => index === editor.index ? editor.draft : item),
      dbServers: previousId && previousId !== editor.draft.id
        ? current.dbServers.map((database) => database.sshServerId === previousId
            ? { ...database, sshServerId: editor.draft.id }
            : database)
        : current.dbServers
    }));
    setEditor(undefined);
    setEditorError(undefined);
  };

  const remove = (index: number) => {
    testRevision.current += 1;
    const removedId = config.sshServers[index]?.id;
    onChange((current) => ({
      ...current,
      sshServers: current.sshServers.filter((_, itemIndex) => itemIndex !== index),
      dbServers: current.dbServers.map((db) => db.sshServerId === removedId ? { ...db, sshServerId: undefined } : db)
    }));
    setEditor(undefined);
  };

  const testDraft = async () => {
    if (!editor || testState === "testing") return;
    const error = validateSshDraft(editor.draft, config, t, editor.index);
    if (error) {
      setEditorError(error);
      setTestState("error");
      return;
    }
    setEditorError(undefined);
    setTestState("testing");
    const revision = ++testRevision.current;
    try {
      await window.sqlTunnel.testDraftSshConnection(
        configWithSshDraft(config, editor.draft),
        editor.draft.id
      );
      if (revision !== testRevision.current) return;
      setTestState("success");
    } catch (error) {
      if (revision !== testRevision.current) return;
      setEditorError(getErrorMessage(error, t));
      setTestState("error");
    }
  };

  return (
    <div className="page">
      <PageHeading eyebrow="SECURE ROUTES" title={t("SSH tunnels")} description={t("Create reusable SSH routes with passwords, private keys, SSH config aliases, and ProxyJump.")} action={<button className="button primary" onClick={() => { testRevision.current += 1; setEditor({ draft: createSsh() }); setEditorError(undefined); setTestState("idle"); }}><Plus size={16} />{t("Add SSH")}</button>} />
      {config.sshServers.length === 0 ? (
        <EmptyState icon={Network} title={t("No SSH tunnels configured")} description={t("No SSH tunnel is needed for direct connections.")} actionLabel={t("Add SSH")} onAction={() => { testRevision.current += 1; setEditor({ draft: createSsh() }); setEditorError(undefined); setTestState("idle"); }} />
      ) : (
        <div className="record-list">
          {config.sshServers.map((ssh, index) => (
            <RecordRow
              key={`${ssh.id}-${index}`}
              icon={Network}
              title={ssh.id}
              detail={ssh.username ?? t("User not set")}
              onClick={() => {
                testRevision.current += 1;
                setEditor({ index, draft: structuredClone(ssh) });
                setEditorError(undefined);
                setTestState("idle");
              }}
            />
          ))}
        </div>
      )}
      {editor && (
        <ModalShell
          title={editor.index === undefined ? t("Add SSH") : t("Edit SSH")}
          error={editorError}
          onCancel={() => { testRevision.current += 1; setEditor(undefined); setEditorError(undefined); setTestState("idle"); }}
          onSave={save}
          onDelete={editor.index === undefined ? undefined : () => remove(editor.index!)}
          onTest={() => void testDraft()}
          testState={testState}
        >
          <div className="modal-form">
            <SshCard
              ssh={editor.draft}
              onChange={(draft) => {
                testRevision.current += 1;
                setEditor({ ...editor, draft });
                setEditorError(undefined);
                setTestState("idle");
              }}
              onRemove={() => undefined}
            />
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function SshCard({ ssh, onChange, onRemove }: { ssh: SshServerConfig; onChange: (next: SshServerConfig) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const patch = (next: Partial<SshServerConfig>) => onChange({ ...ssh, ...next });
  const advancedCount = [ssh.passphrase, ssh.sshConfigPath, ssh.idleTimeoutMs !== 60_000 ? ssh.idleTimeoutMs : undefined]
    .filter((value) => value !== undefined && value !== "").length;
  return (
    <article className="editor-card static-card">
      <div className="static-card-heading"><span className="database-badge ssh"><Network size={18} /></span><span><strong>{ssh.id || t("Unnamed SSH")}</strong><small>{ssh.host || t("Waiting for host")}:{ssh.port ?? 22}</small></span><button className="icon-button danger" onClick={onRemove} aria-label={t("Delete SSH")}><Trash2 size={15} /></button></div>
      <div className="editor-card-body visible">
        <div className="form-section">
          <FormSectionTitle title={t("Connection information")} />
          <div className="form-grid three">
            <Field label={t("Connection ID")} required><input value={ssh.id} onChange={(event) => patch({ id: event.target.value })} placeholder="bastion-prod" /></Field>
            <Field label={t("Host or Host alias")} required><input value={ssh.host} onChange={(event) => patch({ host: event.target.value })} placeholder="bastion.example.com" /></Field>
            <Field label={t("Port")} hint={t("Optional")}><NumberInput value={ssh.port} optional placeholder="22" onChange={(value) => patch({ port: value })} /></Field>
            <Field className="span-three" label={t("Username")} hint={t("Optional")}><input value={ssh.username ?? ""} onChange={(event) => patch({ username: emptyAsUndefined(event.target.value) })} placeholder="deploy" /></Field>
          </div>
        </div>
        <div className="form-section">
          <FormSectionTitle title={t("Authentication")} description={t("Password, private key, or SSH Agent")} />
          <div className="form-grid two">
            <Field label={t("Password")} hint={t("Optional")}><div className="secret-input"><input type={showPassword ? "text" : "password"} value={ssh.password ?? ""} onChange={(event) => patch({ password: emptyAsUndefined(event.target.value) })} autoComplete="new-password" /><button onClick={() => setShowPassword((value) => !value)} type="button" aria-label={t("Show or hide password")}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></Field>
            <Field label={t("Private key path")} hint={t("Optional")}><input value={ssh.privateKeyPath ?? ""} onChange={(event) => patch({ privateKeyPath: emptyAsUndefined(event.target.value) })} placeholder="~/.ssh/id_ed25519" /></Field>
          </div>
        </div>
        <div className="advanced-settings">
          <AdvancedToggle expanded={advancedExpanded} onToggle={() => setAdvancedExpanded((value) => !value)} description={advancedCount > 0 ? t("{count} configured", { count: advancedCount }) : t("Passphrase, SSH Config, and idle timeout")} />
          {advancedExpanded && (
            <div className="advanced-settings-body">
              <div className="form-grid three">
                <Field label={t("Idle timeout (ms)")}><NumberInput value={ssh.idleTimeoutMs ?? 60_000} onChange={(value) => patch({ idleTimeoutMs: value })} /></Field>
                <Field label={t("Private key passphrase")} hint={t("Optional")}><input type="password" value={ssh.passphrase ?? ""} onChange={(event) => patch({ passphrase: emptyAsUndefined(event.target.value) })} autoComplete="new-password" /></Field>
                <Field className="span-three" label={t("SSH Config path")} hint="Host alias / ProxyJump"><input value={ssh.sshConfigPath ?? ""} onChange={(event) => patch({ sshConfigPath: emptyAsUndefined(event.target.value) })} placeholder="~/.ssh/config" /></Field>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ClientEditor({ config, onChange }: EditorProps) {
  const { t } = useI18n();
  const [editor, setEditor] = useState<{ index?: number; draft: ClientConfig }>();
  const [editorError, setEditorError] = useState<string>();

  const createClient = (): ClientConfig => ({
      id: uniqueId("client", config.clients.map((item) => item.id), config.clients.length + 1),
      apiKey: generateApiKey(),
      dbServers: []
  });

  const save = () => {
    if (!editor) return;
    const error = validateClientDraft(editor.draft, config, t, editor.index);
    if (error) {
      setEditorError(error);
      return;
    }
    onChange((current) => ({
      ...current,
      clients: editor.index === undefined
        ? [...current.clients, editor.draft]
        : current.clients.map((item, index) => index === editor.index ? editor.draft : item)
    }));
    setEditor(undefined);
    setEditorError(undefined);
  };

  const remove = (index: number) => {
    onChange((current) => ({ ...current, clients: current.clients.filter((_, itemIndex) => itemIndex !== index) }));
    setEditor(undefined);
  };

  return (
    <div className="page">
      <PageHeading eyebrow="ACCESS CONTROL" title={t("Clients and access")} description={t("Issue Bearer API keys and grant per-database read or write access with optional limits.")} action={<button className="button primary" onClick={() => setEditor({ draft: createClient() })}><Plus size={16} />{t("Add client")}</button>} />
      {config.clients.length === 0 ? (
        <EmptyState icon={UsersRound} title={t("No authorized clients yet")} description={t("Create an API key and assign database access.")} actionLabel={t("Add client")} onAction={() => setEditor({ draft: createClient() })} />
      ) : (
        <div className="record-list">
          {config.clients.map((client, index) => (
            <RecordRow
              key={`${client.id}-${index}`}
              icon={KeyRound}
              title={client.id}
              detail={t("{count} database grants", { count: client.dbServers.length })}
              badge="Bearer"
              onClick={() => {
                setEditor({ index, draft: structuredClone(client) });
                setEditorError(undefined);
              }}
            />
          ))}
        </div>
      )}
      {editor && (
        <ModalShell
          title={editor.index === undefined ? t("Add client") : t("Edit client")}
          error={editorError}
          onCancel={() => setEditor(undefined)}
          onSave={save}
          onDelete={editor.index === undefined ? undefined : () => remove(editor.index!)}
        >
          <div className="modal-form">
            <ClientCard
              client={editor.draft}
              dbServers={config.dbServers}
              onChange={(draft) => {
                setEditor({ ...editor, draft });
                setEditorError(undefined);
              }}
              onRemove={() => undefined}
            />
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function ClientCard({ client, dbServers, onChange, onRemove }: { client: ClientConfig; dbServers: DbServerConfig[]; onChange: (next: ClientConfig) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const patch = (next: Partial<ClientConfig>) => onChange({ ...client, ...next });
  const toggleGrant = (serverId: string, enabled: boolean) => {
    patch({ dbServers: enabled ? [...client.dbServers, { serverId, permission: "read" }] : client.dbServers.filter((grant) => grant.serverId !== serverId) });
  };
  const updateGrant = (serverId: string, next: Partial<ClientConfig["dbServers"][number]>) => {
    patch({ dbServers: client.dbServers.map((grant) => grant.serverId === serverId ? { ...grant, ...next } : grant) });
  };
  const advancedCount = client.dbServers.filter((grant) => grant.maxRows !== undefined || grant.queryTimeoutMs !== undefined).length;

  return (
    <article className="editor-card static-card client-card">
      <div className="static-card-heading"><span className="database-badge client"><KeyRound size={18} /></span><span><strong>{client.id || t("Unnamed client")}</strong><small>{t("{count} database grants", { count: client.dbServers.length })}</small></span><span className="soft-badge"><ShieldCheck size={12} />Bearer</span><button className="icon-button danger" onClick={onRemove} aria-label={t("Delete")}><Trash2 size={15} /></button></div>
      <div className="editor-card-body visible">
        <div className="form-grid three client-identity-grid">
          <Field label={t("Client ID")} required><input value={client.id} onChange={(event) => patch({ id: event.target.value })} placeholder="analytics-agent" /></Field>
          <Field className="span-two" label="API Key" required>
            <div className="secret-input key-input"><input type={showKey ? "text" : "password"} value={client.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} autoComplete="off" /><button onClick={() => setShowKey((value) => !value)} type="button" aria-label={t("Show or hide password")}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button><button className="regenerate" onClick={() => patch({ apiKey: generateApiKey() })} type="button"><RefreshCw size={14} />{t("Regenerate")}</button></div>
          </Field>
        </div>
        <div className="grant-heading"><div><strong>{t("Database access")}</strong><span>{t("Read-only by default")}</span></div><span>{t("{count}/{total} granted", { count: client.dbServers.length, total: dbServers.length })}</span></div>
        {dbServers.length > 0 && <AdvancedToggle expanded={advancedExpanded} onToggle={() => setAdvancedExpanded((value) => !value)} description={advancedCount > 0 ? t("{count} grants override limits", { count: advancedCount }) : t("Per-grant row and timeout overrides")} />}
        {dbServers.length === 0 ? (
          <div className="inline-empty"><Database size={17} />{t("Add a database connection before assigning access.")}</div>
        ) : (
          <div className={`grant-list ${advancedExpanded ? "advanced" : ""}`}>
            {dbServers.map((db) => {
              const grant = client.dbServers.find((item) => item.serverId === db.id);
              return (
                <div className={`grant-row ${grant ? "enabled" : ""}`} key={db.id}>
                  <label className="grant-toggle"><input type="checkbox" checked={Boolean(grant)} onChange={(event) => toggleGrant(db.id, event.target.checked)} /><span><Check size={12} /></span></label>
                  <span className={`database-badge tiny ${db.type}`}><Database size={14} /></span>
                  <div className="grant-db"><strong>{db.id}</strong><small>{db.type} · {db.database.database}</small></div>
                  {grant ? (
                    <>
                      <select className={`permission-select ${grant.permission}`} value={grant.permission} onChange={(event) => updateGrant(db.id, { permission: event.target.value as "read" | "write" })}><option value="read">{t("Read only")}</option><option value="write">{t("Read and write")}</option></select>
                      {advancedExpanded && (
                        <>
                          <NumberInput className="grant-limit" value={grant.maxRows} optional placeholder={t("Row limit")} onChange={(value) => updateGrant(db.id, { maxRows: value })} />
                          <NumberInput className="grant-limit" value={grant.queryTimeoutMs} optional placeholder={t("Timeout (ms)")} onChange={(value) => updateGrant(db.id, { queryTimeoutMs: value })} />
                        </>
                      )}
                    </>
                  ) : <span className="grant-disabled">{t("Not granted")}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

function SettingsEditor({ config, preferences, onConfigChange, onPreferencesChange }: { config: GatewayConfig; preferences: DesktopPreferences; onConfigChange: EditorProps["onChange"]; onPreferencesChange: (updater: (current: DesktopPreferences) => DesktopPreferences) => void }) {
  const { t } = useI18n();
  const patchDefaults = (next: Partial<GatewayConfig["defaults"]>) => onConfigChange((current) => ({ ...current, defaults: { ...current.defaults, ...next } }));
  return (
    <div className="page settings-page">
      <PageHeading eyebrow="PREFERENCES" title={t("Global settings")} description={t("Configure the local MCP and OpenAPI endpoints, startup behavior, language, and default query safeguards.")} />
      <section className="settings-card">
        <PanelTitle icon={Server} title={t("Local service")} description={t("Listen only on the configured address")} />
        <div className="settings-row">
          <div><strong>{t("Listen address")}</strong></div>
          <ListenAddressControl
            value={preferences.host}
            onChange={(host) => onPreferencesChange((current) => ({ ...current, host }))}
          />
        </div>
        <div className="settings-row"><div><strong>{t("Listen port")}</strong><span>{t("Shared by OpenAPI and MCP")}</span></div><NumberInput className="settings-number" value={preferences.port} onChange={(value) => onPreferencesChange((current) => ({ ...current, port: value ?? 3000 }))} /></div>
        <ToggleRow label={t("Start service when the app opens")} checked={preferences.startOnLaunch} onChange={(checked) => onPreferencesChange((current) => ({ ...current, startOnLaunch: checked }))} />
        <div className="settings-row">
          <div><strong>{t("Interface language")}</strong><span>{t("Unsupported system languages use English")}</span></div>
          <select className="settings-language" value={preferences.language} onChange={(event) => onPreferencesChange((current) => ({ ...current, language: event.target.value as DesktopPreferences["language"] }))}>
            <option value="system">{t("Follow system")}</option>
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
      </section>

      <section className="settings-card">
        <PanelTitle icon={SlidersHorizontal} title={t("Default query limits")} description={t("Used unless overridden")} />
        <div className="settings-row"><div><strong>{t("Maximum returned rows")}</strong><span>{t("Per query")}</span></div><NumberInput className="settings-number" value={config.defaults.maxRows} onChange={(value) => patchDefaults({ maxRows: value ?? 1000 })} /></div>
        <div className="settings-row"><div><strong>{t("Query timeout")}</strong><span>{t("Milliseconds")}</span></div><NumberInput className="settings-number" value={config.defaults.queryTimeoutMs} onChange={(value) => patchDefaults({ queryTimeoutMs: value ?? 10_000 })} /></div>
        <div className="settings-row"><div><strong>{t("Connection timeout")}</strong><span>{t("Milliseconds")}</span></div><NumberInput className="settings-number" value={config.defaults.connectTimeoutMs} onChange={(value) => patchDefaults({ connectTimeoutMs: value ?? 10_000 })} /></div>
        <div className="settings-row"><div><strong>{t("Schema cache TTL")}</strong><span>{t("Milliseconds; 0 disables caching")}</span></div><NumberInput className="settings-number" value={config.defaults.schemaCacheTtlMs} allowZero onChange={(value) => patchDefaults({ schemaCacheTtlMs: value ?? 300_000 })} /></div>
      </section>

    </div>
  );
}

function ListenAddressControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const initialMode = value === "127.0.0.1" || value === "0.0.0.0" ? value : "custom";
  const [mode, setMode] = useState<"127.0.0.1" | "0.0.0.0" | "custom">(initialMode);
  const [customAddress, setCustomAddress] = useState(initialMode === "custom" ? value : "");

  useEffect(() => {
    if (value === "127.0.0.1" || value === "0.0.0.0") {
      if (mode !== "custom") setMode(value);
      return;
    }
    setMode("custom");
    setCustomAddress(value);
  }, [mode, value]);

  const changeMode = (nextMode: "127.0.0.1" | "0.0.0.0" | "custom") => {
    setMode(nextMode);
    if (nextMode !== "custom") {
      onChange(nextMode);
    } else if (customAddress.trim()) {
      onChange(customAddress);
    }
  };

  return (
    <div className={`settings-address-control ${mode === "custom" ? "has-custom" : ""}`}>
      <select value={mode} aria-label={t("Address mode")} onChange={(event) => changeMode(event.target.value as "127.0.0.1" | "0.0.0.0" | "custom")}>
        <option value="127.0.0.1">127.0.0.1</option>
        <option value="0.0.0.0">0.0.0.0</option>
        <option value="custom">{t("Custom")}</option>
      </select>
      {mode === "custom" && (
        <input
          value={customAddress}
          aria-label={t("Custom listen address")}
          placeholder="192.168.1.10"
          onChange={(event) => {
            setCustomAddress(event.target.value);
            onChange(event.target.value);
          }}
        />
      )}
    </div>
  );
}

interface EditorProps {
  config: GatewayConfig;
  onChange: (updater: (current: GatewayConfig) => GatewayConfig) => void;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

function PanelTitle({ icon: Icon, title, description }: { icon: typeof ShieldCheck; title: string; description: string }) {
  return <div className="panel-title"><span><Icon size={17} /></span><div><strong>{title}</strong><small>{description}</small></div></div>;
}

function RecordRow({ icon: Icon, title, detail, badge, onClick }: {
  icon: typeof Database;
  title: string;
  detail: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button className="record-row" type="button" onClick={onClick}>
      <span className="record-icon"><Icon size={16} /></span>
      <span className="record-copy"><strong>{title}</strong><small>{detail}</small></span>
      {badge && <span className="soft-badge">{badge}</span>}
      <ChevronRight className="record-chevron" size={16} />
    </button>
  );
}

function ModalShell({ title, children, error, onCancel, onSave, onDelete, onTest, testState = "idle", elevated = false }: {
  title: string;
  children: React.ReactNode;
  error?: string;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onTest?: () => void;
  testState?: ConnectionTestState;
  elevated?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (elevated || !document.querySelector(".modal-backdrop.elevated"))) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [elevated, onCancel]);

  return (
    <div className={`modal-backdrop ${elevated ? "elevated" : ""}`}>
      <section className="editor-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="editor-modal-header">
          <strong>{title}</strong>
          <button className="icon-button" type="button" onClick={onCancel} aria-label={t("Close")}><X size={16} /></button>
        </header>
        <div className="editor-modal-content">{children}</div>
        {error && <div className="modal-error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>}
        <footer className="editor-modal-footer">
          <div>
            {onDelete && <button className="button danger-button" type="button" onClick={onDelete}><Trash2 size={15} />{t("Delete")}</button>}
            {onTest && (
              <button className={`button editor-test-button ${testState}`} type="button" disabled={testState === "testing"} onClick={onTest}>
                {testState === "testing" ? <RefreshCw size={15} /> : testState === "success" ? <Check size={15} /> : testState === "error" ? <AlertCircle size={15} /> : <Activity size={15} />}
                {testState === "testing" ? t("Testing") : testState === "success" ? t("Connection succeeded") : testState === "error" ? t("Connection failed") : t("Test")}
              </button>
            )}
          </div>
          <div>
            <button className="button" type="button" onClick={onCancel}>{t("Cancel")}</button>
            <button className="button primary" type="button" onClick={onSave}>{t("Save")}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function FormSectionTitle({ title, description }: { title: string; description?: string }) {
  return <div className="form-section-title"><strong>{title}</strong>{description && <span>{description}</span>}</div>;
}

function AdvancedToggle({ expanded, onToggle, description }: { expanded: boolean; onToggle: () => void; description: string }) {
  const { t } = useI18n();
  return (
    <button className="advanced-toggle" type="button" aria-expanded={expanded} onClick={onToggle}>
      <SlidersHorizontal size={16} />
      <strong>{t("Advanced settings")}</strong>
      <small>{description}</small>
      <ChevronRight className={expanded ? "expanded" : ""} size={16} />
    </button>
  );
}

function Field({ label, hint, required, className = "", children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`field ${className}`}><span className="field-label">{label}{required && <em>*</em>}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function NumberInput({ value, onChange, optional = false, allowZero = false, placeholder, className = "" }: { value?: number; onChange: (value: number | undefined) => void; optional?: boolean; allowZero?: boolean; placeholder?: string; className?: string }) {
  return <input className={className} type="number" min={allowZero ? 0 : 1} step={1} value={value ?? ""} placeholder={placeholder} onChange={(event) => {
    if (event.target.value === "" && optional) {
      onChange(undefined);
      return;
    }
    const parsed = Number(event.target.value);
    onChange(Number.isFinite(parsed) ? parsed : undefined);
  }} />;
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="settings-row settings-toggle-row"><div><strong>{label}</strong>{description && <span>{description}</span>}</div><input className="native-checkbox" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: { icon: typeof Database; title: string; description: string; actionLabel: string; onAction: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={25} /></div><h2>{title}</h2><p>{description}</p><button className="button primary" onClick={onAction}><Plus size={16} />{actionLabel}</button></div>;
}

function uniqueId(prefix: string, existing: string[], start: number): string {
  let candidate = `${prefix}-${start}`;
  let suffix = start;
  while (existing.includes(candidate)) {
    suffix += 1;
    candidate = `${prefix}-${suffix}`;
  }
  return candidate;
}

function generateApiKey(): string {
  return `st_${crypto.randomUUID().replaceAll("-", "")}`;
}

function emptyAsUndefined(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

function configWithDatabaseDraft(config: GatewayConfig, database: DbServerConfig): GatewayConfig {
  return { ...config, dbServers: [database], clients: [] };
}

function configWithSshDraft(config: GatewayConfig, ssh: SshServerConfig): GatewayConfig {
  return { ...config, sshServers: [ssh], dbServers: [], clients: [] };
}

function validateDatabaseDraft(database: DbServerConfig, config: GatewayConfig, t: Translate, currentIndex?: number): string | undefined {
  if (!database.id.trim()) return t("Enter a connection ID");
  if (config.dbServers.some((item, index) => index !== currentIndex && item.id === database.id)) return t("This connection ID already exists");
  if (!database.database.host.trim()) return t("Enter the database host");
  if (!isPositiveInteger(database.database.port)) return t("The database port must be a positive integer");
  if (!database.database.database.trim()) return t("Enter the database name");
  if (!database.database.user.trim()) return t("Enter the database username");
  if (!database.database.password?.trim()) return t("Enter the database password");
  if (database.sshServerId && !config.sshServers.some((item) => item.id === database.sshServerId)) return t("The selected SSH connection does not exist");
  if (database.maxRows !== undefined && !isPositiveInteger(database.maxRows)) return t("Max rows must be a positive integer");
  if (database.queryTimeoutMs !== undefined && !isPositiveInteger(database.queryTimeoutMs)) return t("Query timeout must be a positive integer");
  if (database.connectTimeoutMs !== undefined && !isPositiveInteger(database.connectTimeoutMs)) return t("Connection timeout must be a positive integer");
  return undefined;
}

function validateSshDraft(ssh: SshServerConfig, config: GatewayConfig, t: Translate, currentIndex?: number): string | undefined {
  if (!ssh.id.trim()) return t("Enter a connection ID");
  if (config.sshServers.some((item, index) => index !== currentIndex && item.id === ssh.id)) return t("This connection ID already exists");
  if (!ssh.host.trim()) return t("Enter the SSH host");
  if (ssh.port !== undefined && !isPositiveInteger(ssh.port)) return t("The SSH port must be a positive integer");
  if (ssh.username !== undefined && !ssh.username.trim()) return t("Enter the SSH username");
  if (ssh.idleTimeoutMs !== undefined && !isPositiveInteger(ssh.idleTimeoutMs)) return t("Idle timeout must be a positive integer");
  return undefined;
}

function validateClientDraft(client: ClientConfig, config: GatewayConfig, t: Translate, currentIndex?: number): string | undefined {
  if (!client.id.trim()) return t("Enter a client ID");
  if (config.clients.some((item, index) => index !== currentIndex && item.id === client.id)) return t("This client ID already exists");
  if (!client.apiKey.trim()) return t("Enter an API key");
  if (config.clients.some((item, index) => index !== currentIndex && item.apiKey === client.apiKey)) return t("This API key is already used by another client");
  const knownDatabases = new Set(config.dbServers.map((item) => item.id));
  const grantedDatabases = new Set<string>();
  for (const grant of client.dbServers) {
    if (!knownDatabases.has(grant.serverId)) return t("Database {id} does not exist", { id: grant.serverId });
    if (grantedDatabases.has(grant.serverId)) return t("Database {id} is granted more than once", { id: grant.serverId });
    grantedDatabases.add(grant.serverId);
    if (grant.maxRows !== undefined && !isPositiveInteger(grant.maxRows)) return t("The grant row limit must be a positive integer");
    if (grant.queryTimeoutMs !== undefined && !isPositiveInteger(grant.queryTimeoutMs)) return t("The grant timeout must be a positive integer");
  }
  return undefined;
}

function isPositiveInteger(value: number | undefined): value is number {
  return Number.isInteger(value) && (value ?? 0) > 0;
}

function formatHttpUrl(host: string, port: number): string {
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${port}`;
}

function getErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "");
  }
  return t("Operation failed. Check recent activity.");
}
