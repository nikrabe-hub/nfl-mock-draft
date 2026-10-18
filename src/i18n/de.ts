// Football-Begriffe (Pick, Trade, ADP, On the clock, Big Board) bleiben in beiden Sprachen englisch.
export const de = {
  'app.title': 'NFL Mock Draft Simulator 2027',
  'app.short': 'Mock Draft',
  'nav.start': 'Start',
  'nav.settings': 'Einstellungen',
  'nav.main': 'Hauptnavigation',

  'home.subtitle': 'Dein Mock Draft für den NFL Draft 2027 – auf PC und Handy, auch ohne Internet.',
  'home.wip.title': 'Grundgerüst steht',
  'home.wip.body': 'Teams, Logos, Speicherung, Backup und Offline-Betrieb sind eingebaut. Spieler, Draft-Board und KI-Picks folgen in den nächsten Phasen.',
  'home.teams': '32 Teams',
  'home.teams.hint': 'Fehlt ein Logo in public/logos/, erscheint ein Badge in Teamfarbe.',

  'status.offlineReady': 'Offline bereit',
  'status.offlinePending': 'Offline-Modus wird vorbereitet …',
  'status.storage': 'Speicher',
  'status.storage.indexeddb': 'IndexedDB',
  'status.storage.localstorage': 'localStorage (Ersatz)',
  'status.storage.memory': 'nur Arbeitsspeicher – geht beim Schließen verloren',

  'pwa.update': 'Neue Version verfügbar.',
  'pwa.update.button': 'Jetzt aktualisieren',

  'header.theme': 'Darstellung wechseln',
  'header.lang': 'Sprache wechseln',

  'settings.title': 'Einstellungen',
  'settings.appearance': 'Darstellung',
  'settings.theme': 'Design',
  'settings.theme.system': 'System',
  'settings.theme.light': 'Hell',
  'settings.theme.dark': 'Dunkel',
  'settings.language': 'Sprache',

  'settings.data.title': 'Datenstand',
  'settings.data.none': 'Noch keine Spielerdaten geladen. Sie kommen in Phase 3.',

  'settings.storage.title': 'Speicher',
  'settings.storage.persistent': 'Dauerhaft gesichert',
  'settings.storage.persistent.yes': 'Ja – der Browser löscht die Daten nicht von selbst.',
  'settings.storage.persistent.no': 'Nicht zugesagt – exportiere regelmäßig ein Backup.',
  'settings.storage.persistent.unknown': 'Unbekannt',

  'settings.backup.title': 'Backup',
  'settings.backup.hint': 'Alle eigenen Daten (Mocks, Watchlist, Einstellungen) als Datei sichern – z.B. für die Übertragung vom PC aufs Handy.',
  'settings.backup.export': 'Backup exportieren',
  'settings.backup.exported': 'Backup gespeichert: {name}',
  'settings.backup.import': 'Backup importieren',
  'settings.backup.preview': 'Backup vom {date} mit {count} Einträgen. Beim Wiederherstellen werden gleichnamige Einträge überschrieben.',
  'settings.backup.preview.nodate': 'unbekanntem Datum',
  'settings.backup.restore': 'Wiederherstellen',
  'settings.backup.cancel': 'Abbrechen',
  'settings.backup.restored': 'Fertig: {count} Einträge wiederhergestellt.',
  'settings.backup.failed': 'Das Wiederherstellen ist fehlgeschlagen. Dein bisheriger Stand wurde nicht verändert.',
  'backup.error.not_json': 'Die Datei ist keine gültige JSON-Datei. Es wurde nichts verändert.',
  'backup.error.wrong_format': 'Das ist keine Backup-Datei dieser App. Es wurde nichts verändert.',
  'backup.error.newer_version': 'Das Backup stammt aus einer neueren App-Version. Bitte aktualisiere die App. Es wurde nichts verändert.',
  'backup.error.bad_data': 'Die Backup-Datei ist beschädigt. Es wurde nichts verändert.',
  'backup.error.bad_key': 'Die Backup-Datei enthält einen ungültigen Eintrag ({detail}). Es wurde nichts verändert.',
  'backup.error.too_large': 'Die Datei ist zu groß für ein Backup. Es wurde nichts verändert.',
  'backup.error.read': 'Die Datei konnte nicht gelesen werden. Es wurde nichts verändert.',

  'settings.install.title': 'Als App installieren',
  'settings.install.button': 'App installieren',
  'settings.install.installed': 'Die App läuft bereits als installierte App.',
  'settings.install.ios': 'iPhone/iPad: Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“.',
  'settings.install.android': 'Android: Öffne das Browser-Menü (⋮) und wähle „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.',

  'settings.about.title': 'Über die App',
  'settings.about.version': 'Version',
  'settings.about.sources': 'Datenquellen',
  'settings.about.sources.none': 'Folgen mit den Daten in Phase 3.',
} as const;

export type MessageKey = keyof typeof de;
