# NFL Mock Draft Simulator 2027

Ein Mock-Draft-Simulator für den NFL Draft 2027. Er läuft im Browser auf PC und Handy, lässt sich wie eine App installieren und funktioniert nach dem ersten Laden **komplett offline**.

> Stand: **Phase 5 (Erweiterungen)**. Teams, Logos, Speicherung, Backup, Dark Mode, DE/EN, Offline-Betrieb, Daten und der Draft selbst
> (Teamauswahl, Board, eigene Picks, KI-Picks, Autosave) sind fertig. Trades, Watchlist, Auto-Pick, Noten, PNG-Export, Mock-Verlauf und das Bearbeiten von Needs und Pick-Besitzern sind ebenfalls fertig (Phase 5).

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
- **Team-Needs sind Schätzungen:** Es gibt keine abrufbare Quelle für Needs. Die eingebauten Needs (`src/draft/needs.ts`) sind meine groben Schätzungen vom Sommer 2026 und in der App als „geschätzt“ gekennzeichnet. Du kannst sie in den Einstellungen unter „Team-Needs bearbeiten“ ändern.
- **Fehlende Angaben** (ADP, Scouting-Profil, Alter, Klasse) bleiben leer und erscheinen als „–“.

## Noten und PNG-Übersicht

Jeder Pick bekommt eine Note von **A+ bis F-** (15 Stufen), ebenso jedes Team. Die Noten stehen live im Board und am Ende im Abschluss-Fenster.

- **60 % Needs:** Hat der Pick ein Need des Teams abgedeckt? Das 1. Need zählt am meisten (100 Punkte), das 5. Need 60. Ein Spieler auf einer Position, die das Team schon besetzt hat, zählt weniger (55 bzw. 35). Eine Position ohne Need ergibt 50.
- **40 % Value:** Verhältnis von Spieler-Rank zur Pick-Nummer. Rank = Pick ergibt 82 Punkte, ein „Steal“ (Spieler war besser eingestuft) bis 100, ein „Reach“ deutlich weniger.
- **Team-Note:** Durchschnitt der Pick-Werte; frühe Runden zählen stärker.

Die Grenzen der Noten sind mit simulierten Drafts geprüft: Der Durchschnitt liegt bei etwa B-/B, extreme Noten (A+ und F) sind selten. **Die Needs sind eigene Schätzungen, nicht aus einer Quelle** – die Noten sind deshalb eine Orientierung, kein Urteil.

Nach dem Draft gibt es pro eigenem Team den Knopf **„Als PNG speichern“** (1080 px breit, funktioniert auch offline). Auf Handys mit Teilen-Funktion erscheint zusätzlich **„Teilen“**.

## Performance und Handy-Layout

- Die Spielerliste lädt in Portionen und zeichnet nur geänderte Zeilen neu, das Board nur geänderte Picks.
- Das Layout ist für große Handys (z. B. Galaxy S24 Ultra, 412 px Breite) mit größerer Schrift und mindestens 44 px großen Tippflächen ausgelegt; automatische Tests prüfen 360 px, 412 px und PC-Breite.
- Logos werden beim Einfügen auf höchstens 150 KB geprüft (ein 4K-Logo würde die Liste verlangsamen).

## Watchlist, Auto-Pick und Verlauf

- **Watchlist:** In der Spielerliste markierst du Spieler mit dem Stern. Der Filter „★ Watchlist“ zeigt nur diese. Die Liste wird automatisch gespeichert und ist Teil des Backups.
- **Auto-Pick:** Der Schalter „Auto-Pick“ im Draft lässt die KI auch für deine Teams wählen (z. B. um schnell durchzuspielen). Jeder neue Draft startet wieder ohne Auto-Pick.
- **Steals & Reaches:** Nach dem Draft siehst du die fünf größten Steals und Reaches. Die Abweichung ist Pick-Nr. minus Rank im Big Board.
- **Mock-Verlauf:** Jeder beendete Draft wird automatisch gespeichert (die letzten 25). Im Tab „Verlauf“ kannst du Mocks ansehen, das PNG daraus erzeugen, löschen und zwei Mocks vergleichen. Auch der Verlauf ist im Backup.

## Trades

- Im Tab „Trade“ (wenn du am Pick bist) wählst du ein Computer-Team und tauschst Picks gegen Picks, auch Picks 2028. Die Live-Anzeige zeigt, ob das Team annehmen würde. Computer-Teams tauschen nie untereinander.
- **Computer-Angebote:** Gelegentlich bietet ein Computer-Team an, nach oben zu tauschen: seine späteren Picks (plus ggf. 2028-Picks) für deinen aktuellen Pick. Die Chance ist in Runde 1 am größten. Ausschalten kannst du das im Trade-Tab oder in den Einstellungen.
- **Wertchart (ehrlich):** Die Original-Tabelle des Rich-Hill-Modells konnte nicht abgerufen werden (die Seite verbietet automatische Abrufe, das wird respektiert). Die App nutzt deshalb eine **Näherung**: Sie geht durch geprüfte Werte der Chart 2026 (Pick 13 = 336, Pick 61 = 86, Pick 93 = 42, Pick 207 = 4, Pick 251 = 1) und nimmt für Pick 1 den Wert 1000 an (Annahme, nicht geprüft). Dazwischen wird interpoliert. Die echte Tabelle kannst du in den Einstellungen unter „Trade-Wertchart“ einfügen (Zeilen „Pick Wert“); sie ersetzt dann die Näherung.
- **Annahmen:** Das Computer-Team nimmt an, wenn es mindestens so viel Wert bekommt wie es abgibt. Ein Pick 2028 zählt wie der mittlere Pick der Runde mit 20 % Abschlag.

## Needs und Pick-Besitzer ändern

In den Einstellungen änderst du die Needs eines Teams (3–5 Positionen, wichtigste zuerst) und den Besitzer einzelner Picks. Beides wird getrennt von den Daten gespeichert: Ein Daten-Update überschreibt deine Änderungen nie, sie gelten, bis du sie zurücksetzt. Auf der Startseite steht, wie viele eigene Änderungen aktiv sind.

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
src/draft/          Draft-Kern: Engine (KI, Ablauf), Needs, Noten, Autosave, Steuerung
src/export/         Picks-Übersicht: Datenmodell und PNG-Zeichnung
src/storage/        Speicher (IndexedDB mit Ersatz), Backup, Einstellungen
src/i18n/           Texte Deutsch/Englisch
src/ui/             Oberfläche
tests/unit/         Unit-Tests (Vitest)
tests/e2e/          Browser-Tests (Playwright, Handy 360 px, S24 Ultra 412 px und Desktop)
.github/workflows/  Tests und Veröffentlichung auf GitHub Pages
```
