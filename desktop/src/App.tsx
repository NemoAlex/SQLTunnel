import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  Database,
  Eye,
  EyeOff,
  FileKey2,
  FolderOpen,
  KeyRound,
  Network,
  Plus,
  Power,
  RefreshCw,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ClientConfig,
  DbServerConfig,
  GatewayConfig,
  SshServerConfig
} from "../../src/types.js";
import type {
  ConnectionIndicator,
  DesktopPreferences,
  DesktopSnapshot,
  ServicePhase
} from "../../shared/desktop.js";

type Section = "databases" | "ssh" | "clients" | "settings";
type Notice = { kind: "success" | "error" | "info"; message: string };

const navigation: Array<{
  id: Section;
  label: string;
  icon: typeof Database;
}> = [
  { id: "databases", label: "数据库", icon: Database },
  { id: "ssh", label: "SSH", icon: Network },
  { id: "clients", label: "客户端", icon: UsersRound },
  { id: "settings", label: "设置", icon: Settings2 }
];

const statusLabels: Record<ServicePhase, string> = {
  stopped: "已停止",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  error: "异常"
};

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

  useEffect(() => {
    document.title = windowKind === "settings" ? "SQLTunnel 设置" : "SQLTunnel";
  }, [windowKind]);

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

  useEffect(() => {
    void window.sqlTunnel.getSnapshot()
      .then((next) => acceptSnapshot(next, true))
      .catch((error) => setNotice({ kind: "error", message: getErrorMessage(error) }));
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
    setConfig((current) => current ? updater(current) : current);
    setDirty(true);
  }, []);

  const markPreferences = useCallback((updater: (current: DesktopPreferences) => DesktopPreferences) => {
    setPreferences((current) => current ? updater(current) : current);
    setDirty(true);
  }, []);

  const saveDraft = useCallback(async (showNotice = true) => {
    if (!config || !preferences) {
      throw new Error("配置尚未载入");
    }
    const afterConfig = await window.sqlTunnel.saveConfig(config);
    acceptSnapshot(afterConfig, true);
    const afterPreferences = await window.sqlTunnel.savePreferences(preferences);
    acceptSnapshot(afterPreferences, true);
    setDirty(false);
    dirtyRef.current = false;
    if (showNotice) {
      setNotice({
        kind: "success",
        message: afterPreferences.service.phase === "running"
          ? "配置已保存，重启服务后生效"
          : "配置已保存"
      });
    }
    return afterPreferences;
  }, [acceptSnapshot, config, preferences]);

  const runAction = useCallback(async (action: () => Promise<DesktopSnapshot>) => {
    setBusy(true);
    try {
      const next = await action();
      acceptSnapshot(next, !dirtyRef.current);
      return next;
    } catch (error) {
      setNotice({ kind: "error", message: getErrorMessage(error) });
      throw error;
    } finally {
      setBusy(false);
    }
  }, [acceptSnapshot]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveDraft();
    } catch (error) {
      setNotice({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

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
      setNotice({ kind: "success", message: "SQLTunnel 已启动" });
    } catch (error) {
      setNotice({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const restartService = async () => {
    setBusy(true);
    try {
      if (dirtyRef.current) {
        await saveDraft(false);
      }
      const next = await window.sqlTunnel.restartService();
      acceptSnapshot(next, true);
      setNotice({ kind: "success", message: "配置已应用，服务已重启" });
    } catch (error) {
      setNotice({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot || !config || !preferences) {
    return (
      <main className="loading-screen">
        <div className="brand-mark large"><Network size={28} /></div>
        <div className="loading-copy">
          <strong>正在打开 SQLTunnel</strong>
          <span>载入本地配置与服务状态…</span>
        </div>
      </main>
    );
  }

  const isTransitioning = snapshot.service.phase === "starting" || snapshot.service.phase === "stopping";

  if (windowKind === "main") {
    return (
      <MainWindow
        snapshot={snapshot}
        busy={busy || isTransitioning}
        notice={notice}
        onToggle={() => void toggleService()}
        onDismissNotice={() => setNotice(undefined)}
      />
    );
  }

  return (
    <SettingsWindow
      snapshot={snapshot}
      config={config}
      preferences={preferences}
      section={section}
      dirty={dirty}
      busy={busy}
      notice={notice}
      onSectionChange={setSection}
      onConfigChange={markConfig}
      onPreferencesChange={markPreferences}
      onSave={() => void handleSave()}
      onSaveAndRestart={() => void restartService()}
      onDismissNotice={() => setNotice(undefined)}
    />
  );
}

function MainWindow({ snapshot, busy, notice, onToggle, onDismissNotice }: {
  snapshot: DesktopSnapshot;
  busy: boolean;
  notice?: Notice;
  onToggle: () => void;
  onDismissNotice: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"status" | "logs">("status");
  const running = snapshot.service.phase === "running";
  return (
    <div className="main-window-shell">
      <section className="gateway-control">
        <div className="gateway-copy">
          <span className={`status-dot ${snapshot.service.phase}`} />
          <div>
            <strong>{statusLabels[snapshot.service.phase]}</strong>
            <button
              className="main-endpoint"
              disabled={!snapshot.service.url}
              onClick={() => void navigator.clipboard.writeText(snapshot.service.url ?? "")}
            >
              {snapshot.service.url ?? `127.0.0.1:${snapshot.preferences.port}`}
              <Copy size={12} />
            </button>
          </div>
        </div>
        <button
          className={`main-power-switch ${running ? "on" : ""}`}
          aria-label={running ? "停止服务" : "启动服务"}
          aria-pressed={running}
          disabled={busy}
          onClick={onToggle}
        >
          <span><Power size={14} /></span>
        </button>
      </section>

      <nav className="main-tabs" aria-label="主窗口内容">
        <button className={activeTab === "status" ? "active" : ""} onClick={() => setActiveTab("status")}>
          <Server size={13} />状态
        </button>
        <button className={activeTab === "logs" ? "active" : ""} onClick={() => setActiveTab("logs")}>
          <Activity size={13} />日志
          {snapshot.logs.length > 0 && <span>{snapshot.logs.length}</span>}
        </button>
      </nav>

      {activeTab === "status" ? (
        <main className="connection-overview">
          <ConnectionGroup title="数据库服务器" connections={snapshot.connections.databases} emptyLabel="尚未配置数据库" />
          <ConnectionGroup title="SSH 连接" connections={snapshot.connections.sshServers} emptyLabel="尚未配置 SSH" />
        </main>
      ) : (
        <MainLogView logs={snapshot.logs} />
      )}

      <footer className="main-window-footer">
        <div><ShieldCheck size={13} />仅本机访问</div>
        <button onClick={() => void window.sqlTunnel.openSettings()}><Settings2 size={14} />设置…</button>
      </footer>
      <NoticeToast notice={notice} onDismiss={onDismissNotice} />
    </div>
  );
}

function MainLogView({ logs }: { logs: DesktopSnapshot["logs"] }) {
  const consoleRef = useRef<HTMLTextAreaElement>(null);
  const output = useMemo(() => [...logs]
    .reverse()
    .map((entry) => `${formatLogTimestamp(entry.timestamp)} ${entry.level.toUpperCase().padEnd(7)} ${entry.message}`)
    .join("\n"), [logs]);

  useEffect(() => {
    const consoleElement = consoleRef.current;
    if (consoleElement) {
      consoleElement.scrollTop = consoleElement.scrollHeight;
    }
  }, [output]);

  return (
    <main className="main-log-view">
      <div className="main-log-toolbar">
        <span>运行日志</span>
        <small>{logs.length} 条</small>
      </div>
      <textarea
        ref={consoleRef}
        className="main-log-console"
        aria-label="运行日志"
        readOnly
        spellCheck={false}
        value={output}
        placeholder="服务运行后，日志会显示在这里。"
      />
    </main>
  );
}

function formatLogTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp)).replaceAll("/", "-");
}

function ConnectionGroup({ title, connections, emptyLabel }: {
  title: string;
  connections: ConnectionIndicator[];
  emptyLabel: string;
}) {
  return (
    <section className="connection-group">
      <header><strong>{title}</strong><span>{connections.length}</span></header>
      <div className="connection-list">
        {connections.length === 0 ? (
          <div className="connection-empty">{emptyLabel}</div>
        ) : connections.map((connection) => <ConnectionRow key={connection.id} connection={connection} />)}
      </div>
    </section>
  );
}

function ConnectionRow({ connection }: { connection: ConnectionIndicator }) {
  const labels = {
    disconnected: "未连接",
    ready: "已连接",
    active: "请求中",
    connected: "已连接"
  } as const;
  return (
    <div className="connection-row">
      <span className={`connection-dot ${connection.state}`} />
      <div><strong>{connection.label}</strong><small>{connection.detail}</small></div>
      <span className="connection-label">{labels[connection.state]}</span>
    </div>
  );
}

function SettingsWindow({
  snapshot,
  config,
  preferences,
  section,
  dirty,
  busy,
  notice,
  onSectionChange,
  onConfigChange,
  onPreferencesChange,
  onSave,
  onSaveAndRestart,
  onDismissNotice
}: {
  snapshot: DesktopSnapshot;
  config: GatewayConfig;
  preferences: DesktopPreferences;
  section: Section;
  dirty: boolean;
  busy: boolean;
  notice?: Notice;
  onSectionChange: (section: Section) => void;
  onConfigChange: EditorProps["onChange"];
  onPreferencesChange: (updater: (current: DesktopPreferences) => DesktopPreferences) => void;
  onSave: () => void;
  onSaveAndRestart: () => void;
  onDismissNotice: () => void;
}) {
  const descriptions: Record<Section, string> = {
    databases: "MySQL 与 PostgreSQL",
    ssh: "跳板机与密钥",
    clients: "API Key 与授权",
    settings: "端口与默认限制"
  };
  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-title"><Settings2 size={18} /><strong>设置</strong></div>
        <nav aria-label="设置分类">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => onSectionChange(item.id)}>
                <Icon size={16} />
                <span><strong>{item.label}</strong><small>{descriptions[item.id]}</small></span>
                <ChevronRight size={13} />
              </button>
            );
          })}
        </nav>
        <button className="settings-config-folder" onClick={() => void window.sqlTunnel.openConfigFolder()} title={snapshot.configPath}>
          <FolderOpen size={14} /><span>打开配置目录</span>
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
        <footer className="settings-footer">
          <span>{dirty ? "有尚未保存的更改" : "配置已保存到本机"}</span>
          {dirty && (
            <button className="button primary" disabled={busy} onClick={snapshot.service.phase === "running" ? onSaveAndRestart : onSave}>
              {snapshot.service.phase === "running" ? <RefreshCw size={15} /> : <Save size={15} />}
              {snapshot.service.phase === "running" ? "保存并重启" : "保存更改"}
            </button>
          )}
        </footer>
      </section>
      <NoticeToast notice={notice} onDismiss={onDismissNotice} />
    </div>
  );
}

function NoticeToast({ notice, onDismiss }: { notice?: Notice; onDismiss: () => void }) {
  if (!notice) return null;
  return (
    <div className={`toast ${notice.kind}`} role="status">
      {notice.kind === "success" ? <Check size={17} /> : notice.kind === "error" ? <AlertCircle size={17} /> : <Activity size={17} />}
      <span>{notice.message}</span>
      <button onClick={onDismiss} aria-label="关闭提示"><X size={14} /></button>
    </div>
  );
}

function DatabaseEditor({ config, onChange }: EditorProps) {
  const addDatabase = () => {
    const index = config.dbServers.length + 1;
    const next: DbServerConfig = {
      id: uniqueId("database", config.dbServers.map((item) => item.id), index),
      type: "postgres",
      database: {
        host: "127.0.0.1",
        port: 5432,
        user: "postgres",
        password: "",
        database: "postgres"
      }
    };
    onChange((current) => ({ ...current, dbServers: [...current.dbServers, next] }));
  };

  const update = (index: number, next: DbServerConfig) => {
    onChange((current) => ({
      ...current,
      dbServers: current.dbServers.map((item, itemIndex) => itemIndex === index ? next : item)
    }));
  };

  const remove = (index: number) => {
    const removedId = config.dbServers[index]?.id;
    onChange((current) => ({
      ...current,
      dbServers: current.dbServers.filter((_, itemIndex) => itemIndex !== index),
      clients: current.clients.map((client) => ({
        ...client,
        dbServers: client.dbServers.filter((grant) => grant.serverId !== removedId)
      }))
    }));
  };

  return (
    <div className="page">
      <PageHeading eyebrow="CONNECTIONS" title="数据库连接" description="配置 SQLTunnel 可以访问的 MySQL 与 PostgreSQL 实例。" action={<button className="button primary" onClick={addDatabase}><Plus size={16} />添加数据库</button>} />
      {config.dbServers.length === 0 ? (
        <EmptyState icon={Database} title="还没有数据库连接" description="添加第一个数据库，之后即可为客户端分配只读或读写权限。" actionLabel="添加数据库" onAction={addDatabase} />
      ) : (
        <div className="editor-stack">
          {config.dbServers.map((database, index) => (
            <DatabaseCard key={`${database.id}-${index}`} database={database} sshServers={config.sshServers} onChange={(next) => update(index, next)} onRemove={() => remove(index)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DatabaseCard({ database, sshServers, onChange, onRemove }: { database: DbServerConfig; sshServers: SshServerConfig[]; onChange: (next: DbServerConfig) => void; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const patch = (next: Partial<DbServerConfig>) => onChange({ ...database, ...next });
  const patchDatabase = (next: Partial<DbServerConfig["database"]>) => onChange({ ...database, database: { ...database.database, ...next } });

  return (
    <article className="editor-card">
      <button className="editor-card-header" onClick={() => setExpanded((value) => !value)}>
        <span className={`database-badge ${database.type}`}><Database size={18} /></span>
        <span className="editor-card-title"><strong>{database.id || "未命名数据库"}</strong><small>{database.database.host}:{database.database.port} · {database.database.database || "未指定库"}</small></span>
        {database.sshServerId && <span className="soft-badge"><Network size={12} />SSH</span>}
        <span className={`type-badge ${database.type}`}>{database.type === "postgres" ? "PostgreSQL" : "MySQL"}</span>
        <ChevronRight className={`expand-icon ${expanded ? "expanded" : ""}`} size={17} />
      </button>
      {expanded && (
        <div className="editor-card-body">
          <div className="form-section">
            <FormSectionTitle title="连接标识" description="这个标识会出现在 API 和 MCP 工具中" />
            <div className="form-grid two">
              <Field label="连接 ID" required><input value={database.id} onChange={(event) => patch({ id: event.target.value })} placeholder="prod-postgres" /></Field>
              <Field label="数据库类型" required>
                <SegmentedControl value={database.type} options={[{ value: "postgres", label: "PostgreSQL" }, { value: "mysql", label: "MySQL" }]} onChange={(value) => {
                  const nextType = value as DbServerConfig["type"];
                  patch({ type: nextType, database: { ...database.database, port: nextType === "postgres" ? 5432 : 3306 } });
                }} />
              </Field>
              <Field className="span-two" label="描述" hint="可选，会展示给 MCP 客户端"><input value={database.description ?? ""} onChange={(event) => patch({ description: emptyAsUndefined(event.target.value) })} placeholder="例如：订单与客户数据，只供分析使用" /></Field>
            </div>
          </div>

          <div className="form-section">
            <FormSectionTitle title="数据库凭据" description="保存在本机 gateway.yaml，文件权限为 600" />
            <div className="form-grid three">
              <Field className="span-two" label="主机" required><input value={database.database.host} onChange={(event) => patchDatabase({ host: event.target.value })} placeholder="127.0.0.1" /></Field>
              <Field label="端口" required><NumberInput value={database.database.port} onChange={(value) => patchDatabase({ port: value ?? 0 })} /></Field>
              <Field label="数据库名" required><input value={database.database.database} onChange={(event) => patchDatabase({ database: event.target.value })} placeholder="app" /></Field>
              <Field label="用户名" required><input value={database.database.user} onChange={(event) => patchDatabase({ user: event.target.value })} placeholder="postgres" autoComplete="off" /></Field>
              <Field label="密码" required>
                <div className="secret-input"><input type={showPassword ? "text" : "password"} value={database.database.password ?? ""} onChange={(event) => patchDatabase({ password: event.target.value })} autoComplete="new-password" /><button onClick={() => setShowPassword((value) => !value)} type="button" aria-label="显示或隐藏密码">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
              </Field>
            </div>
          </div>

          <div className="form-section">
            <FormSectionTitle title="网络与限制" description="需要时通过 SSH 跳板访问，并可收紧全局限制" />
            <div className="form-grid four">
              <Field label="SSH 隧道"><select value={database.sshServerId ?? ""} onChange={(event) => patch({ sshServerId: emptyAsUndefined(event.target.value) })}><option value="">直接连接</option>{sshServers.map((ssh) => <option key={ssh.id} value={ssh.id}>{ssh.id}</option>)}</select></Field>
              <Field label="最大行数" hint="留空继承全局"><NumberInput value={database.maxRows} optional onChange={(value) => patch({ maxRows: value })} /></Field>
              <Field label="查询超时 (ms)" hint="留空继承全局"><NumberInput value={database.queryTimeoutMs} optional onChange={(value) => patch({ queryTimeoutMs: value })} /></Field>
              <Field label="连接超时 (ms)" hint="留空继承全局"><NumberInput value={database.connectTimeoutMs} optional onChange={(value) => patch({ connectTimeoutMs: value })} /></Field>
            </div>
          </div>

          <div className="editor-footer"><button className="danger-link" onClick={onRemove}><Trash2 size={14} />删除此数据库</button></div>
        </div>
      )}
    </article>
  );
}

function SshEditor({ config, onChange }: EditorProps) {
  const addSsh = () => {
    const next: SshServerConfig = {
      id: uniqueId("bastion", config.sshServers.map((item) => item.id), config.sshServers.length + 1),
      host: "",
      port: 22,
      username: "",
      idleTimeoutMs: 60_000
    };
    onChange((current) => ({ ...current, sshServers: [...current.sshServers, next] }));
  };

  const update = (index: number, next: SshServerConfig) => onChange((current) => ({ ...current, sshServers: current.sshServers.map((item, itemIndex) => itemIndex === index ? next : item) }));
  const remove = (index: number) => {
    const removedId = config.sshServers[index]?.id;
    onChange((current) => ({
      ...current,
      sshServers: current.sshServers.filter((_, itemIndex) => itemIndex !== index),
      dbServers: current.dbServers.map((db) => db.sshServerId === removedId ? { ...db, sshServerId: undefined } : db)
    }));
  };

  return (
    <div className="page">
      <PageHeading eyebrow="SECURE ROUTES" title="SSH 隧道" description="复用跳板机连接，让数据库无需直接暴露到本机网络。" action={<button className="button primary" onClick={addSsh}><Plus size={16} />添加 SSH</button>} />
      {config.sshServers.length === 0 ? (
        <EmptyState icon={Network} title="没有配置 SSH 隧道" description="如果数据库可以直连，可以跳过此项；否则添加一个跳板机连接。" actionLabel="添加 SSH" onAction={addSsh} />
      ) : (
        <div className="editor-stack">
          {config.sshServers.map((ssh, index) => <SshCard key={`${ssh.id}-${index}`} ssh={ssh} onChange={(next) => update(index, next)} onRemove={() => remove(index)} />)}
        </div>
      )}
      <div className="info-callout"><FileKey2 size={18} /><div><strong>支持原生 SSH 配置</strong><p>填写 SSH Config 路径后，可以直接使用 Host alias、IdentityFile 和 ProxyJump。相对路径基于 gateway.yaml 所在目录。</p></div></div>
    </div>
  );
}

function SshCard({ ssh, onChange, onRemove }: { ssh: SshServerConfig; onChange: (next: SshServerConfig) => void; onRemove: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const patch = (next: Partial<SshServerConfig>) => onChange({ ...ssh, ...next });
  return (
    <article className="editor-card static-card">
      <div className="static-card-heading"><span className="database-badge ssh"><Network size={18} /></span><span><strong>{ssh.id || "未命名 SSH"}</strong><small>{ssh.host || "等待填写主机"}:{ssh.port ?? 22}</small></span><button className="icon-button danger" onClick={onRemove} aria-label="删除 SSH"><Trash2 size={15} /></button></div>
      <div className="editor-card-body visible">
        <div className="form-grid three">
          <Field label="连接 ID" required><input value={ssh.id} onChange={(event) => patch({ id: event.target.value })} placeholder="bastion-prod" /></Field>
          <Field label="主机或 Host alias" required><input value={ssh.host} onChange={(event) => patch({ host: event.target.value })} placeholder="bastion.example.com" /></Field>
          <Field label="端口" required><NumberInput value={ssh.port ?? 22} onChange={(value) => patch({ port: value })} /></Field>
          <Field label="用户名" required><input value={ssh.username ?? ""} onChange={(event) => patch({ username: event.target.value })} placeholder="deploy" /></Field>
          <Field label="密码" hint="可选，优先使用密钥/Agent"><div className="secret-input"><input type={showPassword ? "text" : "password"} value={ssh.password ?? ""} onChange={(event) => patch({ password: emptyAsUndefined(event.target.value) })} autoComplete="new-password" /><button onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></Field>
          <Field label="空闲回收 (ms)"><NumberInput value={ssh.idleTimeoutMs ?? 60_000} onChange={(value) => patch({ idleTimeoutMs: value })} /></Field>
          <Field className="span-two" label="私钥路径" hint="可选；如 ~/.ssh/id_ed25519"><input value={ssh.privateKeyPath ?? ""} onChange={(event) => patch({ privateKeyPath: emptyAsUndefined(event.target.value) })} placeholder="~/.ssh/id_ed25519" /></Field>
          <Field label="私钥口令"><input type="password" value={ssh.passphrase ?? ""} onChange={(event) => patch({ passphrase: emptyAsUndefined(event.target.value) })} autoComplete="new-password" /></Field>
          <Field className="span-three" label="SSH Config 路径" hint="可选；用于解析 Host alias 与 ProxyJump"><input value={ssh.sshConfigPath ?? ""} onChange={(event) => patch({ sshConfigPath: emptyAsUndefined(event.target.value) })} placeholder="~/.ssh/config" /></Field>
        </div>
      </div>
    </article>
  );
}

function ClientEditor({ config, onChange }: EditorProps) {
  const addClient = () => {
    const next: ClientConfig = {
      id: uniqueId("client", config.clients.map((item) => item.id), config.clients.length + 1),
      apiKey: generateApiKey(),
      dbServers: []
    };
    onChange((current) => ({ ...current, clients: [...current.clients, next] }));
  };
  const update = (index: number, next: ClientConfig) => onChange((current) => ({ ...current, clients: current.clients.map((item, itemIndex) => itemIndex === index ? next : item) }));
  const remove = (index: number) => onChange((current) => ({ ...current, clients: current.clients.filter((_, itemIndex) => itemIndex !== index) }));

  return (
    <div className="page">
      <PageHeading eyebrow="ACCESS CONTROL" title="客户端与授权" description="为每个 Agent 或内部工具分配独立 API Key 和最小数据库权限。" action={<button className="button primary" onClick={addClient}><Plus size={16} />添加客户端</button>} />
      {config.clients.length === 0 ? (
        <EmptyState icon={KeyRound} title="还没有授权客户端" description="创建客户端后，调用方使用 Bearer API Key 访问 OpenAPI 或 MCP。" actionLabel="添加客户端" onAction={addClient} />
      ) : (
        <div className="editor-stack">
          {config.clients.map((client, index) => <ClientCard key={`${client.id}-${index}`} client={client} dbServers={config.dbServers} onChange={(next) => update(index, next)} onRemove={() => remove(index)} />)}
        </div>
      )}
    </div>
  );
}

function ClientCard({ client, dbServers, onChange, onRemove }: { client: ClientConfig; dbServers: DbServerConfig[]; onChange: (next: ClientConfig) => void; onRemove: () => void }) {
  const [showKey, setShowKey] = useState(false);
  const patch = (next: Partial<ClientConfig>) => onChange({ ...client, ...next });
  const toggleGrant = (serverId: string, enabled: boolean) => {
    patch({ dbServers: enabled ? [...client.dbServers, { serverId, permission: "read" }] : client.dbServers.filter((grant) => grant.serverId !== serverId) });
  };
  const updateGrant = (serverId: string, next: Partial<ClientConfig["dbServers"][number]>) => {
    patch({ dbServers: client.dbServers.map((grant) => grant.serverId === serverId ? { ...grant, ...next } : grant) });
  };

  return (
    <article className="editor-card static-card client-card">
      <div className="static-card-heading"><span className="database-badge client"><KeyRound size={18} /></span><span><strong>{client.id || "未命名客户端"}</strong><small>{client.dbServers.length} 个数据库授权</small></span><span className="soft-badge"><ShieldCheck size={12} />Bearer</span><button className="icon-button danger" onClick={onRemove}><Trash2 size={15} /></button></div>
      <div className="editor-card-body visible">
        <div className="form-grid three client-identity-grid">
          <Field label="客户端 ID" required><input value={client.id} onChange={(event) => patch({ id: event.target.value })} placeholder="analytics-agent" /></Field>
          <Field className="span-two" label="API Key" required>
            <div className="secret-input key-input"><input type={showKey ? "text" : "password"} value={client.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} autoComplete="off" /><button onClick={() => setShowKey((value) => !value)} type="button">{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button><button className="regenerate" onClick={() => patch({ apiKey: generateApiKey() })} type="button"><RefreshCw size={14} />重新生成</button></div>
          </Field>
        </div>
        <div className="grant-heading"><div><strong>数据库授权</strong><span>默认使用只读权限；仅在确有需要时开放写入。</span></div><span>{client.dbServers.length}/{dbServers.length} 已授权</span></div>
        {dbServers.length === 0 ? (
          <div className="inline-empty"><Database size={17} />请先添加数据库连接，再为该客户端分配权限。</div>
        ) : (
          <div className="grant-list">
            {dbServers.map((db) => {
              const grant = client.dbServers.find((item) => item.serverId === db.id);
              return (
                <div className={`grant-row ${grant ? "enabled" : ""}`} key={db.id}>
                  <label className="grant-toggle"><input type="checkbox" checked={Boolean(grant)} onChange={(event) => toggleGrant(db.id, event.target.checked)} /><span><Check size={12} /></span></label>
                  <span className={`database-badge tiny ${db.type}`}><Database size={14} /></span>
                  <div className="grant-db"><strong>{db.id}</strong><small>{db.type} · {db.database.database}</small></div>
                  {grant ? (
                    <>
                      <select className={`permission-select ${grant.permission}`} value={grant.permission} onChange={(event) => updateGrant(db.id, { permission: event.target.value as "read" | "write" })}><option value="read">只读</option><option value="write">读写</option></select>
                      <NumberInput className="grant-limit" value={grant.maxRows} optional placeholder="行数上限" onChange={(value) => updateGrant(db.id, { maxRows: value })} />
                      <NumberInput className="grant-limit" value={grant.queryTimeoutMs} optional placeholder="超时 ms" onChange={(value) => updateGrant(db.id, { queryTimeoutMs: value })} />
                    </>
                  ) : <span className="grant-disabled">未授权</span>}
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
  const patchDefaults = (next: Partial<GatewayConfig["defaults"]>) => onConfigChange((current) => ({ ...current, defaults: { ...current.defaults, ...next } }));
  return (
    <div className="page settings-page">
      <PageHeading eyebrow="PREFERENCES" title="全局设置" description="控制本地监听端口、启动行为和所有连接的默认安全限制。" />
      <section className="settings-card">
        <PanelTitle icon={Server} title="本地服务" description="服务固定绑定 127.0.0.1，不会暴露到局域网" />
        <div className="settings-row"><div><strong>监听端口</strong><span>OpenAPI 与 MCP 共用该端口</span></div><NumberInput className="settings-number" value={preferences.port} onChange={(value) => onPreferencesChange((current) => ({ ...current, port: value ?? 3000 }))} /></div>
        <ToggleRow label="打开 App 时自动启动" description="进入桌面控制台后立即启动 SQLTunnel" checked={preferences.startOnLaunch} onChange={(checked) => onPreferencesChange((current) => ({ ...current, startOnLaunch: checked }))} />
        <ToggleRow label="登录 macOS 时打开" description="将 SQLTunnel 注册为当前用户的登录项" checked={preferences.launchAtLogin} onChange={(checked) => onPreferencesChange((current) => ({ ...current, launchAtLogin: checked }))} />
      </section>

      <section className="settings-card">
        <PanelTitle icon={SlidersHorizontal} title="默认查询限制" description="数据库或客户端未单独设置时应用这些值" />
        <div className="settings-row"><div><strong>最大返回行数</strong><span>防止一次查询返回过多数据</span></div><NumberInput className="settings-number" value={config.defaults.maxRows} onChange={(value) => patchDefaults({ maxRows: value ?? 1000 })} /></div>
        <div className="settings-row"><div><strong>查询超时</strong><span>单条 SQL 最长执行时间，单位毫秒</span></div><NumberInput className="settings-number" value={config.defaults.queryTimeoutMs} onChange={(value) => patchDefaults({ queryTimeoutMs: value ?? 10_000 })} /></div>
        <div className="settings-row"><div><strong>连接超时</strong><span>数据库和 SSH 建连最长等待时间，单位毫秒</span></div><NumberInput className="settings-number" value={config.defaults.connectTimeoutMs} onChange={(value) => patchDefaults({ connectTimeoutMs: value ?? 10_000 })} /></div>
        <div className="settings-row"><div><strong>Schema 缓存时间</strong><span>单位毫秒；设置为 0 可禁用缓存</span></div><NumberInput className="settings-number" value={config.defaults.schemaCacheTtlMs} allowZero onChange={(value) => patchDefaults({ schemaCacheTtlMs: value ?? 300_000 })} /></div>
      </section>

      <div className="security-banner"><ShieldCheck size={21} /><div><strong>桌面安全边界</strong><p>界面运行在无 Node 权限的隔离 Renderer 中；配置写入与服务控制只能通过白名单 IPC 完成。</p></div></div>
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

function FormSectionTitle({ title, description }: { title: string; description: string }) {
  return <div className="form-section-title"><strong>{title}</strong><span>{description}</span></div>;
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

function SegmentedControl({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <div className="segmented-control">{options.map((option) => <button key={option.value} className={value === option.value ? "active" : ""} type="button" onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="settings-row"><div><strong>{label}</strong><span>{description}</span></div><button className={`toggle ${checked ? "on" : ""}`} type="button" onClick={() => onChange(!checked)} aria-pressed={checked}><span /></button></div>;
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, "");
  }
  return "操作失败，请查看最近活动";
}
