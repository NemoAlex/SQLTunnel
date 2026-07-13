import type { UiLocale } from "../shared/ui-locale.js";

const translations: Record<UiLocale, Record<string, string>> = {
  en: {},
  "zh-CN": {
    "SQLTunnel Settings": "SQLTunnel 设置", "Settings…": "设置…", "File": "文件", "Exit": "退出", "Edit": "编辑", "Window": "窗口",
    "SQLTunnel must be stopped first": "需要先停止 SQLTunnel", "Configuration cannot be changed while the service is running.": "服务运行期间不能修改配置。", "Cancel": "取消", "Stop and Open Settings": "停止并打开设置", "Stop SQLTunnel before changing settings": "请先停止 SQLTunnel 再修改设置",
    "Configuration saved": "配置已保存", "Desktop preferences saved": "桌面偏好已保存", "The listen address cannot be empty or contain spaces": "监听地址不能为空或包含空格", "The port must be an integer between 1 and 65535": "端口必须是 1 到 65535 之间的整数",
    "Desktop console ready": "桌面控制台已就绪", "Starting on {host}:{port}": "正在启动 {host}:{port}", "SQLTunnel is running at {url}": "SQLTunnel 已运行于 {url}", "Startup failed: {message}": "启动失败：{message}", "SQLTunnel stopped": "SQLTunnel 已停止", "Stopping SQLTunnel": "正在停止 SQLTunnel", "SQLTunnel stopped safely": "SQLTunnel 已安全停止", "Failed to stop: {message}": "停止失败：{message}",
    "Accessing database: {id}": "正在访问数据库：{id}", "Database request completed: {id}": "数据库请求完成：{id}", "Database request failed: {id}": "数据库请求失败：{id}", "Testing database connection: {id}": "正在测试数据库连接：{id}", "Database connection succeeded: {id}": "数据库连接测试成功：{id}", "SSH tunnel connected: {id}": "SSH 隧道已连接：{id}", "SSH tunnel disconnected: {id}": "SSH 隧道已断开：{id}", "Unknown error": "未知错误"
  },
  ja: {
    "SQLTunnel Settings": "SQLTunnel 設定", "Settings…": "設定…", "File": "ファイル", "Exit": "終了", "Edit": "編集", "Window": "ウインドウ",
    "SQLTunnel must be stopped first": "先に SQLTunnel を停止してください", "Configuration cannot be changed while the service is running.": "サービスの実行中は設定を変更できません。", "Cancel": "キャンセル", "Stop and Open Settings": "停止して設定を開く", "Stop SQLTunnel before changing settings": "設定を変更する前に SQLTunnel を停止してください",
    "Configuration saved": "設定を保存しました", "Desktop preferences saved": "デスクトップ設定を保存しました", "The listen address cannot be empty or contain spaces": "待機アドレスを空欄にしたり空白を含めたりすることはできません", "The port must be an integer between 1 and 65535": "ポートは 1～65535 の整数にしてください",
    "Desktop console ready": "デスクトップコンソールの準備ができました", "Starting on {host}:{port}": "{host}:{port} で起動しています", "SQLTunnel is running at {url}": "SQLTunnel は {url} で実行中です", "Startup failed: {message}": "起動に失敗しました：{message}", "SQLTunnel stopped": "SQLTunnel を停止しました", "Stopping SQLTunnel": "SQLTunnel を停止しています", "SQLTunnel stopped safely": "SQLTunnel を安全に停止しました", "Failed to stop: {message}": "停止に失敗しました：{message}",
    "Accessing database: {id}": "データベースにアクセスしています：{id}", "Database request completed: {id}": "データベース要求が完了しました：{id}", "Database request failed: {id}": "データベース要求に失敗しました：{id}", "Testing database connection: {id}": "データベース接続をテストしています：{id}", "Database connection succeeded: {id}": "データベース接続テストに成功しました：{id}", "SSH tunnel connected: {id}": "SSH トンネルに接続しました：{id}", "SSH tunnel disconnected: {id}": "SSH トンネルを切断しました：{id}", "Unknown error": "不明なエラー"
  },
  ko: {
    "SQLTunnel Settings": "SQLTunnel 설정", "Settings…": "설정…", "File": "파일", "Exit": "종료", "Edit": "편집", "Window": "윈도우",
    "SQLTunnel must be stopped first": "먼저 SQLTunnel을 중지해야 합니다", "Configuration cannot be changed while the service is running.": "서비스 실행 중에는 설정을 변경할 수 없습니다.", "Cancel": "취소", "Stop and Open Settings": "중지하고 설정 열기", "Stop SQLTunnel before changing settings": "설정을 변경하기 전에 SQLTunnel을 중지하세요",
    "Configuration saved": "설정이 저장되었습니다", "Desktop preferences saved": "데스크톱 환경설정이 저장되었습니다", "The listen address cannot be empty or contain spaces": "수신 주소는 비워 두거나 공백을 포함할 수 없습니다", "The port must be an integer between 1 and 65535": "포트는 1~65535 사이의 정수여야 합니다",
    "Desktop console ready": "데스크톱 콘솔 준비 완료", "Starting on {host}:{port}": "{host}:{port}에서 시작 중", "SQLTunnel is running at {url}": "SQLTunnel이 {url}에서 실행 중입니다", "Startup failed: {message}": "시작 실패: {message}", "SQLTunnel stopped": "SQLTunnel이 중지되었습니다", "Stopping SQLTunnel": "SQLTunnel 중지 중", "SQLTunnel stopped safely": "SQLTunnel이 안전하게 중지되었습니다", "Failed to stop: {message}": "중지 실패: {message}",
    "Accessing database: {id}": "데이터베이스 접근 중: {id}", "Database request completed: {id}": "데이터베이스 요청 완료: {id}", "Database request failed: {id}": "데이터베이스 요청 실패: {id}", "Testing database connection: {id}": "데이터베이스 연결 테스트 중: {id}", "Database connection succeeded: {id}": "데이터베이스 연결 테스트 성공: {id}", "SSH tunnel connected: {id}": "SSH 터널 연결됨: {id}", "SSH tunnel disconnected: {id}": "SSH 터널 연결 해제됨: {id}", "Unknown error": "알 수 없는 오류"
  },
  fr: {
    "SQLTunnel Settings": "Réglages de SQLTunnel", "Settings…": "Réglages…", "File": "Fichier", "Exit": "Quitter", "Edit": "Édition", "Window": "Fenêtre",
    "SQLTunnel must be stopped first": "SQLTunnel doit d’abord être arrêté", "Configuration cannot be changed while the service is running.": "La configuration ne peut pas être modifiée pendant l’exécution du service.", "Cancel": "Annuler", "Stop and Open Settings": "Arrêter et ouvrir les réglages", "Stop SQLTunnel before changing settings": "Arrêtez SQLTunnel avant de modifier les réglages",
    "Configuration saved": "Configuration enregistrée", "Desktop preferences saved": "Préférences enregistrées", "The listen address cannot be empty or contain spaces": "L’adresse d’écoute ne peut pas être vide ni contenir d’espaces", "The port must be an integer between 1 and 65535": "Le port doit être un entier compris entre 1 et 65535",
    "Desktop console ready": "Console prête", "Starting on {host}:{port}": "Démarrage sur {host}:{port}", "SQLTunnel is running at {url}": "SQLTunnel s’exécute sur {url}", "Startup failed: {message}": "Échec du démarrage : {message}", "SQLTunnel stopped": "SQLTunnel est arrêté", "Stopping SQLTunnel": "Arrêt de SQLTunnel", "SQLTunnel stopped safely": "SQLTunnel a été arrêté en toute sécurité", "Failed to stop: {message}": "Échec de l’arrêt : {message}",
    "Accessing database: {id}": "Accès à la base : {id}", "Database request completed: {id}": "Requête terminée : {id}", "Database request failed: {id}": "Échec de la requête : {id}", "Testing database connection: {id}": "Test de la connexion à la base : {id}", "Database connection succeeded: {id}": "Test de connexion réussi : {id}", "SSH tunnel connected: {id}": "Tunnel SSH connecté : {id}", "SSH tunnel disconnected: {id}": "Tunnel SSH déconnecté : {id}", "Unknown error": "Erreur inconnue"
  },
  de: {
    "SQLTunnel Settings": "SQLTunnel-Einstellungen", "Settings…": "Einstellungen…", "File": "Datei", "Exit": "Beenden", "Edit": "Bearbeiten", "Window": "Fenster",
    "SQLTunnel must be stopped first": "SQLTunnel muss zuerst gestoppt werden", "Configuration cannot be changed while the service is running.": "Die Konfiguration kann bei laufendem Dienst nicht geändert werden.", "Cancel": "Abbrechen", "Stop and Open Settings": "Stoppen und Einstellungen öffnen", "Stop SQLTunnel before changing settings": "Stoppen Sie SQLTunnel, bevor Sie Einstellungen ändern",
    "Configuration saved": "Konfiguration gespeichert", "Desktop preferences saved": "Desktop-Einstellungen gespeichert", "The listen address cannot be empty or contain spaces": "Die Listen-Adresse darf nicht leer sein oder Leerzeichen enthalten", "The port must be an integer between 1 and 65535": "Der Port muss eine Ganzzahl zwischen 1 und 65535 sein",
    "Desktop console ready": "Desktop-Konsole ist bereit", "Starting on {host}:{port}": "Start auf {host}:{port}", "SQLTunnel is running at {url}": "SQLTunnel läuft unter {url}", "Startup failed: {message}": "Start fehlgeschlagen: {message}", "SQLTunnel stopped": "SQLTunnel wurde gestoppt", "Stopping SQLTunnel": "SQLTunnel wird gestoppt", "SQLTunnel stopped safely": "SQLTunnel wurde sicher gestoppt", "Failed to stop: {message}": "Stoppen fehlgeschlagen: {message}",
    "Accessing database: {id}": "Datenbankzugriff: {id}", "Database request completed: {id}": "Datenbankanfrage abgeschlossen: {id}", "Database request failed: {id}": "Datenbankanfrage fehlgeschlagen: {id}", "Testing database connection: {id}": "Datenbankverbindung wird getestet: {id}", "Database connection succeeded: {id}": "Verbindungstest erfolgreich: {id}", "SSH tunnel connected: {id}": "SSH-Tunnel verbunden: {id}", "SSH tunnel disconnected: {id}": "SSH-Tunnel getrennt: {id}", "Unknown error": "Unbekannter Fehler"
  }
};

export function text(locale: UiLocale, message: string, values: Record<string, string | number> = {}): string {
  const template = translations[locale][message] ?? message;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}
