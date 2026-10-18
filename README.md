# NFL Mock Draft Simulator 2027

Ein Mock-Draft-Simulator für den NFL Draft 2027. Er läuft im Browser auf PC und Handy, lässt sich wie eine App installieren und funktioniert nach dem ersten Laden **komplett offline**.

> Stand: **Phase 2 (Grundgerüst)**. Teams, Logos, Speicherung, Backup, Dark Mode, DE/EN und Offline-Betrieb sind fertig.
> Spieler, Draft-Board und KI-Picks folgen in den Phasen 3–5.

## Die App öffnen und aufs Handy holen

Die Adresse lautet `https://<dein-github-name>.github.io/nfl-mock-draft/`.

- **Android (Chrome):** Seite öffnen, Menü (⋮) → „App installieren“ oder „Zum Startbildschirm hinzufügen“.
- **iPhone (Safari):** Seite öffnen, „Teilen“ → „Zum Home-Bildschirm“.
- **Offline-Test:** Einmal mit Internet öffnen, dann Flugmodus an und die App starten. Die Anzeige „Offline bereit“ auf der Startseite bestätigt, dass alles gespeichert ist.

## Logos einfügen oder austauschen

1. Lege die Logo-Datei in den Ordner `public/logos/`.
2. Der Dateiname ist das **Teamkürzel**, z.B. `CAR.png` (auch `.svg` und `.webp` funktionieren).
3. Veröffentliche eine neue Version (siehe unten).

Fehlt ein Logo, zeigt die App automatisch ein Badge in der Teamfarbe mit dem Kürzel. Es erscheint nie ein kaputtes Bild.

Die 32 Kürzel: ARI, ATL, BAL, BUF, CAR, CHI, CIN, CLE, DAL, DEN, DET, GB, HOU, IND, JAX, KC, LAC, LAR, LV, MIA, MIN, NE, NO, NYG, NYJ, PHI, PIT, SEA, SF, TB, TEN, WAS.

Der Ordner `Logos/` im Projekt enthält deine Originaldateien. Die App benutzt nur `public/logos/`.

## Eine neue Version veröffentlichen

Mit GitHub Desktop:

1. Öffne GitHub Desktop. Links siehst du alle geänderten Dateien.
2. Schreibe unten links eine kurze Beschreibung, z.B. „Logo ausgetauscht“.
3. Klicke auf **Commit to main**.
4. Klicke oben auf **Push origin**.
5. Auf GitHub im Reiter **Actions** läuft jetzt automatisch der Test. Nach etwa 3–5 Minuten ist die neue Version online, erkennbar am grünen Haken.

Schlägt ein Test fehl (roter Haken), wird **nichts** veröffentlicht. Die alte Version bleibt online.

## Backup: Daten vom PC aufs Handy

1. Am PC: **Einstellungen → Backup exportieren**. Eine Datei `nfl-mock-draft-backup-<Datum>.json` wird gespeichert.
2. Schicke die Datei aufs Handy (E-Mail, Cloud, WhatsApp an dich selbst).
3. Am Handy: **Einstellungen → Backup importieren**, Datei wählen, dann **Wiederherstellen**.

Ist die Datei ungültig, zeigt die App eine verständliche Meldung und ändert nichts.

## Für Entwickler (optional)

Du brauchst das nur, wenn du lokal testen willst. Dafür muss [Node.js](https://nodejs.org) (Version 22) installiert sein.

```
npm install          # einmalig
npm run dev          # Entwicklungsserver
npm test             # Unit-Tests
npm run test:e2e     # Browser-Tests (vorher einmalig: npx playwright install chromium)
npm run build        # fertige App im Ordner dist/
```

## Projektstruktur

```
public/logos/       Team-Logos (<KÜRZEL>.png)
public/icons/       App-Icons (erzeugt mit scripts/make-icons.py)
src/data/           Teams, Teamfarben
src/storage/        Speicher (IndexedDB mit Ersatz), Backup, Einstellungen
src/i18n/           Texte Deutsch/Englisch
src/ui/             Oberfläche
tests/unit/         Unit-Tests (Vitest)
tests/e2e/          Browser-Tests (Playwright, Handy 360 px und Desktop)
.github/workflows/  Tests und Veröffentlichung auf GitHub Pages
```
