# SQLTunnel Konfigurationsreferenz

[Zurück zur README](README.md) | [API-Referenz](api.md) | [Dify-Einrichtungsanleitung](dify.md)

## Konfiguration

Der Headless-Dienst verwendet `gateway.yaml` für die Gateway-Konfiguration.

Die Konfiguration hat drei Hauptabschnitte:

- `sshServers`: Wiederverwendbare SSH-Tunnel-Einträge mit Unterstützung für `~/.ssh/config` und `ProxyJump`.
- `dbServers`: Datenbankserver einschließlich Datenbanktyp, Adresse, Anmeldedaten und optionalen SSH-Zugriff.
- `clients`: API-Clients, ihre API-Schlüssel und die Datenbankserver, auf die jeder Client zugreifen darf.

Optionale globale Standardeinstellungen:

- `defaults.maxRows`: Standard-Maximum an Zeilen. Standard: `1000`.
- `defaults.queryTimeoutMs`: Standard-Datenbankabfrage-Timeout. Standard: `10000`.
- `defaults.connectTimeoutMs`: Standard-Timeout für SSH-Tunnel und Datenbankverbindung. Standard: `10000`.
- `defaults.schemaCacheTtlMs`: TTL für den In-Memory-Cache der Datenbankschema-Metadaten. Standard: `300000` (5 Minuten). Auf `0` setzen, um Caching zu deaktivieren.

### Konfigurationsdatei und Pfade

Empfohlenes Layout:

```text
config/
  gateway.yaml
  gateway.example.yaml
  ssh/                 # Optional
    config             # SSH-Host-Aliase, Benutzer, Ports, ProxyJump und zugehörige Einstellungen
    id_rsa             # Privatschlüssel für schlüsselbasierte Authentifizierung
```

Die Standarddatei ist `config/gateway.yaml`. Setzen Sie `SQLTUNNEL_CONFIG=/path/to/gateway.yaml`, um sie von einem anderen Ort zu laden.

Relative Werte für `sshConfigPath` und `privateKeyPath` werden aus dem Verzeichnis heraus aufgelöst, das `gateway.yaml` enthält. Dadurch kann das vollständige `config`-Verzeichnis direkt in Docker unter `/app/config` gemountet werden.

`gateway.yaml` kann Datenbankpasswörter, Client-API-Schlüssel, SSH-Passwörter und Privatschlüsselpfade enthalten. Übertragen Sie keine echte Konfiguration in die Versionskontrolle. Schränken Sie die Dateiberechtigungen ein und gewähren Sie jedem Client nur die Datenbanken und den `read`- oder `write`-Zugriff, den er benötigt.

### SSH-Server

`sshServers` definieren wiederverwendbare SSH-Tunnel-Einträge. Ein Datenbankserver verweist mit `sshServerId` auf einen solchen Eintrag.

```yaml
sshServers:
  - id: bastion-prod
    sshConfigPath: ssh/config
    host: db-prod
    port: 22
    username: deploy
    password: optional-password
    privateKeyPath: ssh/id_rsa
    passphrase: optional-key-passphrase
    idleTimeoutMs: 60000
```

Felder:

- `id`: Erforderlich. SSH-Server-ID, die von `dbServers[].sshServerId` verwendet wird.
- `host`: Erforderlich. Echter SSH-Host oder ein Host-Alias aus der SSH-Config.
- `sshConfigPath`: Optional. Pfad zur SSH-Config. Relative Pfade werden aus dem Verzeichnis aufgelöst, das `gateway.yaml` enthält. Wenn ausgelassen, liest SQLTunnel die `~/.ssh/config` des aktuellen Benutzers.
- `port`: Optional. SSH-Port. Standard: `22`.
- `username`: Optional. SSH-Benutzername. Standard: aktueller Ausführungsbenutzer.
- `password`: Optional. SSH-Passwort für die Passwortauthentifizierung.
- `privateKeyPath`: Optional. Privatschlüsselpfad. Relative Pfade werden aus dem Verzeichnis aufgelöst, das `gateway.yaml` enthält. Wenn ausgelassen, kann SQLTunnel den `IdentityFile` der SSH-Config oder gängige Standard-Privatschlüssel des aktuellen Benutzers verwenden.
- `passphrase`: Optional. Passphrase für einen verschlüsselten Privatschlüssel.
- `idleTimeoutMs`: Optional. Wie lange eine im Leerlauf befindliche SSH-Verbindung geöffnet bleibt. Standard: `60000`.
- `proxyJumps`: Optional. ProxyJump-Kette. In den meisten Fällen wird ProxyJump in die SSH-Config eingetragen und SQLTunnel liest ihn von dort.

Unterstützte SSH-Config-Felder:

- `Host`
- `HostName`
- `User`
- `Port`
- `IdentityFile`
- `ProxyJump`

SQLTunnel implementiert nur die oben aufgeführten SSH-Config-Felder. Andere OpenSSH-Optionen werden ignoriert, einschließlich:

- `ProxyCommand`
- `Include`
- `HostKeyAlias`
- `LocalForward`
- `RemoteForward`
- `DynamicForward`

Wenn `host` ein Host-Alias ist, kann SQLTunnel den echten Host, Benutzer, Port, Privatschlüssel und ProxyJump aus der SSH-Config ergänzen.

Docker-freundliches SSH-Config-Beispiel:

```yaml
sshServers:
  - id: db-prod
    sshConfigPath: ssh/config
    host: db-prod
```

Zugehörige SSH-Config:

```sshconfig
Host bastion-prod
  HostName bastion.example.com
  User deploy
  Port 22
  IdentityFile ~/.ssh/id_rsa

Host db-prod
  HostName 10.0.8.12
  User deploy
  ProxyJump bastion-prod
```

SQLTunnel wiederverwendet SSH-Verbindungen nach SSH-Server-ID. Jede Abfrage öffnet einen neuen Weiterleitungskanal. Im Leerlauf befindliche SSH-Verbindungen werden nach `idleTimeoutMs` geschlossen.

Bei lokalen Ausführungen wird `SSH_AUTH_SOCK` verwendet, wenn ein ssh-agent verfügbar ist. In Docker mounten Sie den Agent-Socket selbst, wenn Sie ssh-agent verwenden möchten; andernfalls konfigurieren Sie einen im Container lesbaren Privatschlüssel.

### DB-Server

`dbServers` definieren Datenbanken, auf die SQLTunnel zugreifen kann. Clients erhalten Zugriff anhand der Datenbankserver-ID.

```yaml
dbServers:
  - id: reporting-mysql
    description: E-Commerce-Analysedatenbank mit täglichen Umsätzen, Produktleistung und Conversion-Kennzahlen
    type: mysql
    sshServerId: bastion-prod
    maxRows: 1000
    queryTimeoutMs: 10000
    connectTimeoutMs: 10000
    database:
      host: 127.0.0.1
      port: 3306
      user: app
      password: mysql-password
      database: app
```

Felder:

- `id`: Erforderlich. Datenbankserver-ID, die von `clients[].dbServers[].serverId` und im Abfragefeld `dbServerId` verwendet wird.
- `description`: Optional. Beschreibt Zweck und Hauptdaten der Datenbank. Wird von `list_db_servers` und der `list_databases`-Operation von `POST /schema` an Clients zurückgegeben.
- `type`: Erforderlich. Datenbanktyp: `mysql` oder `postgres`.
- `sshServerId`: Optional. Verweist auf `sshServers[].id`. Wenn ausgelassen, verbindet SQLTunnel sich direkt mit der Datenbank.
- `maxRows`: Optional. Standardmäßige maximale Zeilenanzahl für diesen Datenbankserver. Wenn ausgelassen, wird `defaults.maxRows` verwendet.
- `queryTimeoutMs`: Optional. Standard-Abfrage-Timeout für diesen Datenbankserver. Wenn ausgelassen, wird `defaults.queryTimeoutMs` verwendet.
- `connectTimeoutMs`: Optional. Timeout für SSH-Tunnel und Datenbankverbindung für diesen Datenbankserver. Wenn ausgelassen, wird `defaults.connectTimeoutMs` verwendet. Standard: `10000`.
- `database.host`: Erforderlich. Datenbankhost. Bei Verwendung eines SSH-Tunnels wird diese Adresse von der SSH-Server-Seite aufgelöst.
- `database.port`: Erforderlich. Datenbankport.
- `database.user`: Erforderlich. Datenbankbenutzername.
- `database.password`: Erforderlich. Datenbankpasswort, direkt in der Konfigurationsdatei gespeichert.
- `database.database`: Erforderlich. Datenbankname.

### Clients

`clients` definieren externe Anwendungen, die SQLTunnel aufrufen können, und die Datenbankserver, auf die sie zugreifen dürfen.

```yaml
clients:
  - id: analytics-app
    apiKey: dev-read-key
    dbServers:
      - serverId: prod-postgres
        permission: read
        maxRows: 500
        queryTimeoutMs: 5000
      - serverId: reporting-mysql
```

Felder:

- `id`: Erforderlich. Client-ID zur Identifizierung des Aufrufers.
- `apiKey`: Erforderlich. API-Schlüssel, den der Aufrufer als `Authorization: Bearer <SQLTUNNEL_API_KEY>`-Token sendet.
- `dbServers`: Erforderlich. Liste der Datenbankserver, auf die dieser Client zugreifen kann.
- `dbServers[].serverId`: Erforderlich. Verweist auf `dbServers[].id`.
- `dbServers[].permission`: Optional. Berechtigung: `read` oder `write`. Standard: `read`. `read` erlaubt schreibgeschütztes SQL; `write` erlaubt sowohl Lese- als auch Schreib-SQL.
- `dbServers[].maxRows`: Optional. Maximale Zeilenanzahl für diesen Client auf diesem Datenbankserver. Wenn ausgelassen, werden die Standardwerte des Datenbankservers oder die globalen Standardwerte verwendet.
- `dbServers[].queryTimeoutMs`: Optional. Abfrage-Timeout für diesen Client auf diesem Datenbankserver. Wenn ausgelassen, werden die Standardwerte des Datenbankservers oder die globalen Standardwerte verwendet.
