# Prompt: NFL Mock Draft Simulator 2027

> In Claude Code im Ordner `C:\Claude Ai\Claude Code\nfl-mock-draft` einfügen.

---

## Rolle & Arbeitsweise

Du bist ein erfahrener Web-Entwickler. Baue mit mir einen NFL Mock Draft Simulator. Ich bin technisch Einsteiger: Erkläre Schritte, die ich selbst ausführen muss (GitHub, Installation, Einstellungen), einfach und nummeriert.

Arbeite in Phasen und zeige mir nach jeder Phase, was fertig ist und wie ich es teste:

1. **Plan:** Lege Projektstruktur, Datenformate und Phasen kurz dar und warte auf mein OK.
2. **Grundgerüst:** Projekt, PWA, Offline-Betrieb, Speicherung, Tests, Deployment auf GitHub Pages.
3. **Daten:** Startdatensatz recherchieren und einbauen, Import, Tankathon-Job.
4. **Draft-Kern:** Teamauswahl, Draft-Board, eigener Pick, KI-Picks.
5. **Erweiterungen:** Trades, Watchlist, Auto-Pick, Analyse, Verlauf, Export.
6. **Feinschliff:** Design, Dark Mode, DE/EN, Mobile-Test, Abnahme.

Triff bei Unklarheiten keine stillen Annahmen. Frag nach oder schreib die Annahme ausdrücklich dazu.

---

## 1. Ziel & Plattform

- NFL Mock Draft Simulator für den **NFL Draft 2027** als **Progressive Web App (PWA)**.
- Läuft im Browser auf Windows-PC und Smartphone und lässt sich auf dem Handy wie eine App installieren.
- Funktioniert nach dem ersten Laden **vollständig offline**, ohne externe API und ohne eigenen Server.
- Der Nutzer wählt vor dem Start die Rundenzahl (**1–7**).
- Die Gestaltung orientiert sich am PFF/NFL Mock Draft Simulator. Screenshots als Referenz liegen im Ordner `referenz/`.

## 2. Zuverlässigkeit (oberste Priorität)

- Alle Daten, Skripte, Schriften und Icons sind lokal enthalten. Ohne Internet darf nichts fehlen.
- Der Draft-Fortschritt wird **nach jedem Pick automatisch gespeichert** (IndexedDB, Fallback localStorage). Nach dem Neuladen oder Schließen geht es an derselben Stelle weiter.
- Ein Draft läuft immer bis zum letzten Pick durch, ohne Hänger. Gehen einem Team die Spieler einer Position aus, wählt es den besten Verfügbaren.
- Fehlerhafte Daten (Import, Update) bringen die App nie zum Absturz. Sie werden geprüft, verworfen und klar gemeldet, und der letzte gültige Stand bleibt.
- **Backup:** Alle eigenen Daten (Mocks, Watchlist, geänderte Needs und Reihenfolge, Einstellungen) lassen sich als Datei exportieren und wieder importieren, z.B. für die Übertragung vom PC aufs Handy.

## 3. Daten

### Spieler (ca. 260+ für 7 Runden)
Je Spieler: Name, Position, Position-Rank (z.B. QB2), College, Rank, ADP, Größe, Gewicht, Alter, Klasse (Jahrgang) sowie ein kurzes Scouting-Profil mit Stärken, Schwächen und Vergleichsspieler.

- Der **Startdatensatz** kommt aus den Quellen in Abschnitt 3a (Tankathon Big Board, ergänzt um FootballDB-Statistiken). Fehlende Felder wie ADP oder das Scouting-Profil recherchierst du beim Bauen aus öffentlichen Big Boards für 2027 und vermerkst den Datenstand. Erfinde keine Werte. Fehlende Angaben bleiben leer und werden als „–“ angezeigt.
- **College-Statistik 2026** (aus FootballDB) erscheint in der Detailansicht des Spielers, nur wenn sie eindeutig zugeordnet werden konnte (siehe 3a).
- **Import** zur Aktualisierung per JSON- oder CSV-Datei oder durch Einfügen von Text, mit Validierung und Vorschau vor dem Übernehmen. Der Datenstand ist in der App sichtbar.

### Draft-Reihenfolge
- Alle 7 Runden inklusive getradeter Picks mit Herkunft (z.B. „↔ DAL“). Die Reihenfolge ist eingebaut und in den Einstellungen editierbar (Pick-Besitzer ändern).
- Die Reihenfolge wird automatisch aktualisiert, siehe Abschnitt 3a.
- Manuelle Änderungen des Nutzers werden nicht ohne Rückfrage überschrieben.

### Team-Needs
- Pro Team 3–5 Positionen nach Priorität, eingebaut und editierbar.

### Logos
- Die App lädt Logo-Dateien aus `public/logos/` (z.B. `CAR.png`), die ich selbst einfüge. Fehlt ein Logo, erscheint ein Badge in Teamfarbe mit Teamkürzel. Kaputte Bilder dürfen nie zu sehen sein. Hinterlege eine Liste aller 32 Kürzel und Teamfarben.

## 3a. Datenquellen & automatischer Abruf

Die App selbst ruft **nie** fremde Seiten ab. Das übernimmt ausschließlich ein geplanter GitHub-Action-Job (`data-update`). Er erzeugt geprüfte JSON-Dateien, die mit der App veröffentlicht werden. Ist die App online, lädt sie neuere Dateien und nutzt sie danach offline.

### Quellen

| Quelle | URL | Liefert | Datei | Rhythmus (deutsche Zeit) |
|---|---|---|---|---|
| Tankathon Full Draft | https://www.tankathon.com/nfl/full-draft | Reihenfolge aller 7 Runden inkl. getradeter Picks & Herkunft | `draft-order.json` | Dienstag 08:00 |
| Tankathon Big Board | https://www.tankathon.com/nfl/big-board | Rank, Name, Position, College, Größe, Gewicht, Klasse (soweit vorhanden) | `big-board.json` | Dienstag 08:20 |
| FootballDB FBS Stat Leaders | https://www.footballdb.com/college-football/stats/index.html | College-Statistiken der Saison 2026 (Passing, Rushing, Receiving, Defense …) | `college-stats.json` | Montag 09:00, nur während der College-Saison (Ende August bis Mitte Januar); außerhalb einmal pro Monat |

Sommer- und Winterzeit beim Cron beachten (GitHub-Cron läuft in UTC).

### Abrufregeln: wie ein rücksichtsvoller einzelner Besucher
- **Ein Request nach dem anderen**, nie parallel, und zwischen zwei Seitenaufrufen eine zufällige Pause von **15–45 Sekunden**.
- **Nur die nötigen Seiten**: pro Lauf höchstens ca. 10 Seiten je Quelle (z.B. die Hauptseite plus die Statistik-Kategorien bei FootballDB). Keine Spielerdetailseiten massenhaft abrufen und nichts crawlen, was nicht gebraucht wird.
- **robots.txt** jeder Domain wird bei jedem Lauf geprüft und eingehalten. Ist ein Pfad gesperrt, wird diese Quelle übersprungen und das im Log gemeldet.
- **Ehrlicher User-Agent**, der wie ein normaler Browser aufgebaut ist und den Projektnamen enthält (z.B. `Mozilla/5.0 (compatible; NFL-Mock-Draft-Hobbyprojekt/1.0; +<GitHub-Repo-URL>)`). Es gibt keine Verschleierung und keine Umgehung von Bot-Schutz, Captchas oder Logins.
- **Caching:** `ETag`/`Last-Modified` werden gespeichert und bei der nächsten Anfrage mitgeschickt (`If-None-Match`/`If-Modified-Since`). Bei `304` wird nichts neu verarbeitet.
- **Bei Gegenwind sofort aufhören:** Bei `429`, `403`, `5xx` oder einem Captcha gibt es keine Wiederholung. Der Lauf endet für diese Quelle, die letzten gültigen Daten bleiben, und es geht erst beim nächsten planmäßigen Termin weiter. Ein `Retry-After` wird beachtet.
- **Timeouts** von 30 s pro Request. Ein Lauf dauert insgesamt höchstens 15 Minuten.
- Die Zeitpläne sind gegeneinander versetzt, sodass nie zwei Quellen gleichzeitig abgerufen werden.
- Ein **manueller Start** (`workflow_dispatch`) ist möglich, aber höchstens einmal pro Tag je Quelle. Die Sperre wird über den letzten Zeitstempel geprüft.

### Verarbeitung & Absicherung
- Jeder Parser hat Tests mit gespeicherten Beispiel-HTML-Dateien.
- **Plausibilitätsprüfungen vor dem Speichern:**
  - Reihenfolge: genau 32 Teams, alle Picks der Runden 1–7 vorhanden, keine doppelten Picknummern
  - Big Board: mindestens 200 Spieler, eindeutige Ränge, gültige Positionen
  - Statistiken: Zahlen sind numerisch und in sinnvollen Bereichen
- Schlägt eine Prüfung fehl, bleibt die alte Datei unverändert, und die Action schlägt sichtbar fehl, damit ich eine GitHub-Mail bekomme. Die anderen Quellen werden trotzdem normal verarbeitet.
- **Zusammenführen:** Neue Big-Board-Daten aktualisieren Rank und Stammdaten. Felder, die die Quelle nicht liefert (ADP, Scouting-Profil, manuelle Korrekturen), bleiben erhalten. Neue Spieler werden ergänzt, verschwundene als „nicht mehr gelistet“ markiert statt gelöscht.
- **Zuordnung FootballDB → Spieler:** über normalisierten Namen plus College. Nur eindeutige Treffer werden übernommen, unsichere landen in einer Liste `unmatched-stats.json` zur manuellen Prüfung.
- Jede Datei enthält `quelle`, `abgerufenAm` und `version`. Die App zeigt den Datenstand je Quelle in den Einstellungen an, z.B. „Big Board: Tankathon, 20.10.2026“.
- Die Rohdaten werden nur verarbeitet, nicht als HTML-Kopie veröffentlicht. Quellenangaben stehen in der App unter „Datenquellen“.

## 4. KI-Logik der Computer-Teams

- Score je verfügbarem Spieler aus **Big-Board-Wert** (Rank/ADP), **Team-Need** (Priorität gewichtet) und **Zufallsanteil**. Positionswerte fließen ein, damit z.B. Kicker und Punter nicht früh fallen.
- Der **Zufallsregler** in den Einstellungen hat die Stufen *Vorhersehbar – Realistisch – Chaos*. Standard ist *Realistisch*.
- Ist eine Position besetzt, sinkt ihr Need, damit Teams nicht mehrfach dieselbe Position ziehen, solange das nicht sinnvoll ist.
- **Trade-Angebote an den Nutzer:** Computer-Teams bieten gelegentlich realistische Trades für Nutzer-Picks an, auf Basis einer bekannten Trade-Value-Chart (z.B. Rich Hill). Der Nutzer kann annehmen oder ablehnen. Computer-Teams traden **nicht** untereinander.
- Der Zufall nutzt einen Seed, damit Tests reproduzierbar sind.

## 5. Funktionen

- **Start:** Raster mit allen 32 Teams, sortiert nach ihrem ersten Pick. Der Nutzer wählt **beliebig viele Teams** (Schalter „All“ für alle 32). Danach legt er Rundenzahl, Tempo und Zufallsgrad fest.
- **Draft-Board** mit den Tabs „Full Draft“ und „Your Picks“: Runden-Überschriften, Pick-Nummer, Team, Status (On the clock / Upcoming / gewählter Spieler mit Position und College), Top-Needs und Trade-Herkunft.
- **Eigener Pick:** Header „You're on the clock“ mit Runde/Pick, Team, Needs und verbleibenden Picks. Tabs: *Draft a Player / Trade / Analysis*. Spielerliste mit Rank, ADP, Position, College, Positionsfilter, Suche, „Show More“ (Profil) und „Draft“-Button.
- **Watchlist:** Spieler markieren und als eigene Ansicht filtern.
- **Tempo-Regler:** langsam / normal / sofort bis zum nächsten eigenen Pick.
- **Auto-Pick:** Auf Wunsch wählt die KI für ein eigenes Team.
- **Eigene Trades:** Picks gegen Picks tauschen, auch Picks 2028, mit **Live-Wertanzeige**, ob das Computer-Team annehmen würde.
- **Analyse nach dem Draft:**
  - Draft-Grade A+ bis F pro Team (aus Value und Need-Abdeckung)
  - die größten **Steals & Reaches** (Abweichung vom Big Board)
  - **Export der eigenen Picks als PNG** zum Teilen (WhatsApp/Social Media)
- **Mock-Verlauf:** Abgeschlossene Mocks werden lokal gespeichert und lassen sich ansehen und vergleichen.

## 6. Design & Bedienung

- **Hell und dunkel:** Folgt der Systemeinstellung, manuell umschaltbar. Der helle Stil ist clean (weiß/grau, Navy-Akzente) wie das Vorbild, der dunkle wirkt wie ein TV-Draft-Broadcast.
- **Sprache DE/EN umschaltbar.** Football-Begriffe (Pick, Trade, ADP, On the clock, Big Board) bleiben in beiden Sprachen englisch.
- **Mobile first:** fehlerfrei ab 360 px Breite, kein horizontales Scrollen, Touch-Flächen mind. 44 px, wichtige Buttons mit dem Daumen erreichbar.
- **PC/Tablet:** Zwei Spalten, links das Draft-Board, rechts der Pick-Bereich. Darunter eine Spalte mit Tabs.
- Kurze, flüssige Animationen bei neuen Picks, die die Bedienung nie blockieren.

## 7. Technik

- **Vite + TypeScript**, PWA über `vite-plugin-pwa` (Service Worker, Manifest, App-Icons, Offline-Cache).
- Keine Laufzeitabhängigkeit von externen Diensten.
- **Tests:**
  - Unit-Tests (Vitest) für KI-Score, Trade-Werte, Draft-Grades, Import-Validierung und Tankathon-Parser (mit gespeicherter Beispiel-HTML)
  - mindestens ein End-to-End-Test (Playwright) für einen kompletten 7-Runden-Draft, einmal auf Handy- und einmal auf Desktop-Größe
- **GitHub Actions:** (1) Tests und Build bei jedem Push, Deploy auf **GitHub Pages**; (2) Daten-Job `data-update` mit Zeitplänen und Abrufregeln aus Abschnitt 3a. Ein erfolgreicher Daten-Lauf löst ein neues Deployment aus.
- **Projektordner:** `C:\Claude Ai\Claude Code\nfl-mock-draft`
- Ich habe noch **kein GitHub-Repository**. Leite mich Schritt für Schritt an, bis die App unter einer GitHub-Pages-Adresse läuft und ich sie auf dem Handy installiert habe.
- Eine kurze `README.md` auf Deutsch erklärt, wie ich Daten aktualisiere, Logos einfüge und eine neue Version veröffentliche.

## 8. Abnahmekriterien (fertig, wenn …)

- [ ] Die App lässt sich auf Android/iPhone installieren und funktioniert im Flugmodus vollständig.
- [ ] Ein 7-Runden-Draft mit allen 32 Teams läuft ohne Fehler bis zum Ende, auch mit Tempo „sofort“.
- [ ] Nach dem Neuladen mitten im Draft geht es exakt beim selben Pick weiter.
- [ ] Ein ungültiger Import zeigt eine verständliche Meldung und ändert nichts.
- [ ] Ein fehlendes Logo zeigt ein Farb-Badge statt eines kaputten Bildes.
- [ ] Der Daten-Job ruft alle drei Quellen zu den festgelegten Zeiten ab, einzeln und mit Pausen. Bei einem Parser-Fehler, `429` oder `403` bleiben die alten Daten erhalten, und ich bekomme eine Mail.
- [ ] Die App zeigt in den Einstellungen den Datenstand je Quelle an.
- [ ] Keine horizontale Scrollleiste bei 360 px, Zwei-Spalten-Layout auf dem PC.
- [ ] Dark Mode und DE/EN funktionieren auf allen Seiten.
- [ ] Alle Tests sind grün, und Export/Import des Backups überträgt alles vom PC aufs Handy.
