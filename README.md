# NFL Mock Draft Simulator 2027

Ein Mock-Draft-Simulator für den NFL Draft 2027. Er läuft im Browser auf PC und Handy, lässt sich wie eine App installieren und funktioniert nach dem ersten Laden **komplett offline**.

> Stand: **Phase 4 (Draft-Kern)**. Teams, Logos, Speicherung, Backup, Dark Mode, DE/EN, Offline-Betrieb, Daten und der Draft selbst
> (Teamauswahl, Board, eigene Picks, KI-Picks, Autosave) sind fertig. Trades, Watchlist, Analyse-Noten, PNG-Export und Mock-Verlauf folgen in Phase 5.

## Die App öffnen und aufs Handy holen

Die Adresse lautet `https://<dein-github-name>.github.io/nfl-mock-draft/`.

- **Android (Chrome):** Seite öffnen, Menü (⋮) → „App installieren“ oder „Zum Startbildschirm hinzufügen“.
- **iPhone (Safari):** Seite öffnen, „Teilen“ → „Zum Home-Bildschirm“.
- **Offline-Test:** Einmal mit Internet öffnen, dann Flugmodus an und die App starten. Die Anzeige „Offline bereit“ auf der Startseite bestätigt, dass alles gespeichert ist.

## Einen Mock Draft spielen

1. Auf der Startseite ein oder mehrere Teams antippen (sortiert nach dem ersten Pick). Der Schalter **All** wählt alle 32.
2. Runden (1–7), Tempo und Zufallsgrad wählen und **Draft starten** tippen.
3. Die Computer-Teams ziehen automatisch. Bist du dran, erscheint **You're on the clock** mit Team, Needs und der Spielerliste (Suche, Positionsfilter, **Show More** für Details, **Draft** mit Bestätigung). **Auto-Pick** lässt die KI für dich wählen.
4. Das **Board** zeigt „Full Draft“ und „Your Picks“. Auf dem Handy wechselst du oben zwischen „Pick“ und „Board“, am PC stehen beide nebeneinander.
5. Der Draft wird **nach jedem Pick automatisch gespeichert**. Nach dem Neuladen oder Schließen geht es genau beim selben Pick weiter.

Tempo: *Langsam* und *Normal* lassen die Computer-Teams mit kleiner Pause ziehen, *Sofort* ohne Pause bis zu deinem nächsten Pick. Den Tempo-Regler kannst du auch mitten im Draft ändern.

**Wie die KI wählt:** Jeder verfügbare Spieler bekommt einen Score aus Big-Board-Wert (Rank, mit ADP gemischt, falls vorhanden), Team-Need (das wichtigste Need zählt am meisten und sinkt, sobald die Position besetzt ist), Positionswert (Kicker/Punter fallen nicht früh) und einem Zufallsanteil. Der Zufallsgrad hat die Stufen *Vorhersehbar*, *Realistisch* (Standard) und *Chaos*. Der Zufall hängt an einem Seed, dadurch sind Drafts reproduzierbar und Tests stabil.

### Wichtige Hinweise (ehrlich, keine stillen Annahmen)

- **Zu wenige Spieler:** Das Tankathon Big Board liefert aktuell nur **162 Spieler**, ein 7-Runden-Draft hat aber 257 Picks. Die App erfindet keine Spieler: Der Draft endet nach dem letzten Spieler, die übrigen Picks bleiben leer. Vor dem Start zeigt die App eine Warnung. Mehr Spieler kannst du in den Einstellungen importieren (siehe unten).
- **Team-Needs sind Schätzungen:** Es gibt keine abrufbare Quelle für Needs. Die eingebauten Needs (`src/draft/needs.ts`) sind meine groben Schätzungen vom Sommer 2026 und in der App als „geschätzt“ gekennzeichnet. Das Bearbeiten in der App folgt in Phase 5.
- **Fehlende Angaben** (ADP, Scouting-Profil, Alter, Klasse) bleiben leer und erscheinen als „–“.

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

## Daten: woher sie kommen und wie sie aktuell bleiben

Die App selbst ruft **nie** fremde Webseiten ab. Das erledigt allein der geplante Job `Daten-Update` auf GitHub (Reiter **Actions**):

| Quelle | Datei | Zeitpunkt (deutsche Zeit) |
|---|---|---|
| Tankathon „Full Draft“ | `public/data/draft-order.json` | dienstags 08:00 |
| Tankathon „Big Board“ (inkl. College-Statistiken) | `public/data/big-board.json` und `public/data/college-stats.json` | dienstags 08:20 |

Der Job ist höflich: eine Seite nach der anderen, 15–45 Sekunden Pause, `robots.txt` wird bei jedem Lauf gelesen, ehrlicher User-Agent, bei Fehlern (429, 403, 5xx, Captcha) wird sofort abgebrochen. Vor dem Speichern wird geprüft (32 Teams, alle 7 Runden, keine doppelten Picks bzw. mindestens 200 Spieler, eindeutige Ranks …). Besteht eine Prüfung nicht, bleibt die alte Datei unverändert und der Lauf wird rot – GitHub schickt dir dann eine E-Mail. Nach einem erfolgreichen Lauf wird die App automatisch neu veröffentlicht.

**Jetzt sofort aktualisieren (höchstens 1× pro Tag und Quelle):** GitHub → Actions → „Daten-Update“ → „Run workflow“ → Quelle wählen → „Run workflow“.

**Den Stand sehen:** In der App unter *Einstellungen → Datenstand* (Herkunft, Abrufdatum, Anzahl je Quelle).

**Eigene Daten ergänzen:** *Einstellungen → Spielerdaten importieren* (JSON, CSV oder eingefügter Text, z. B. aus Excel). Du siehst zuerst eine Vorschau; gespeichert wird erst nach „Importieren“. Eigene Importe überschreiben die Online-Daten und bleiben bei Updates erhalten; „Eigene Importe löschen“ setzt sie zurück. Fehlende Werte bleiben leer und erscheinen als „–“ – es werden keine Werte erfunden.

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
src/data/           Teams, Datenformate, Prüfregeln, Import, Laden der Daten
scripts/data-update/ Daten-Job (höfliches Abrufen, Zeitsteuerung, Prüfen, Speichern)
public/data/        Daten-Dateien (draft-order, big-board, college-stats)
data-state/         Merkzettel des Daten-Jobs (ETag, letzter Lauf)
src/draft/          Draft-Kern: Engine (KI, Ablauf), Needs, Autosave, Steuerung
src/storage/        Speicher (IndexedDB mit Ersatz), Backup, Einstellungen
src/i18n/           Texte Deutsch/Englisch
src/ui/             Oberfläche
tests/unit/         Unit-Tests (Vitest)
tests/e2e/          Browser-Tests (Playwright, Handy 360 px und Desktop)
.github/workflows/  Tests und Veröffentlichung auf GitHub Pages
```
