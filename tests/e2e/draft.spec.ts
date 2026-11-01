import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('team-grid')).toBeVisible();
  await expect(page.getByTestId('home-data')).toContainText('162 Spieler');
}

async function choose(page: Page, teams: string[], rounds: number, tempo: 'slow' | 'normal' | 'instant' = 'instant') {
  for (const t of teams) await page.locator(`[data-testid=team-tile][data-team=${t}]`).click();
  await page.getByTestId(`opt-rounds-${rounds}`).click();
  await page.getByTestId(`opt-tempo-${tempo}`).click();
}

// Erst warten, bis die Draft-Ansicht wirklich gezeichnet ist: Auf langsamen Rechnern (CI) wäre der
// Umschalter sonst noch nicht sichtbar, und der Klick würde stillschweigend übersprungen.
async function showBoard(page: Page) {
  await page.getByTestId('draft-progress').waitFor();
  const sw = page.getByTestId('view-board');
  if (await sw.isVisible()) await sw.click();
}

async function showPick(page: Page) {
  await page.getByTestId('draft-progress').waitFor();
  const sw = page.getByTestId('view-pick');
  if (await sw.isVisible()) await sw.click();
}

async function noOverflowAndBigTargets(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontaler Überhang: ${where}`).toBeLessThanOrEqual(0);
  const small = await page.$$eval('button', (btns) =>
    btns
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent?.trim(), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
      })
      .filter((b) => b.visible && (b.h < 44 || b.w < 44)),
  );
  expect(small, `zu kleine Buttons: ${where}`).toEqual([]);
}

test.describe('Handy-Bildschirm', () => {
  test('das Board passt über dem Menü auf den Bildschirm, ohne dass die Seite scrollen muss', async ({ page }) => {
    await openApp(page);
    await choose(page, ['NYJ'], 1);
    await page.getByTestId('start-draft').click();
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    const width = page.viewportSize()!.width;
    if (width >= 900) return;
    await showBoard(page);
    const box = (await page.getByTestId('board-scroll').boundingBox())!;
    const tabbar = (await page.locator('nav.tabbar').boundingBox())!;
    expect(box.y + box.height, 'Board endet über dem Menü').toBeLessThanOrEqual(tabbar.y + 1);
    expect(box.height, 'Board ist hoch genug, um mehrere Picks zu zeigen').toBeGreaterThan(280);
  });

  test('Schrift und Touch-Flächen sind auf großen Handys größer', async ({ page }) => {
    await openApp(page);
    const width = page.viewportSize()!.width;
    const btn = await page.getByTestId('start-draft').boundingBox();
    const tile = await page.getByTestId('team-tile').first().boundingBox();
    if (width > 400 && width < 900) {
      expect(btn!.height).toBeGreaterThanOrEqual(56);
      expect(tile!.height).toBeGreaterThanOrEqual(72);
      const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
      expect(fs).toBeGreaterThanOrEqual(17);
    } else {
      expect(btn!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('Teamauswahl', () => {
  test('sortiert nach dem ersten Pick, hat einen All-Schalter und startet nur mit Auswahl', async ({ page }) => {
    await openApp(page);
    const tiles = page.getByTestId('team-tile');
    await expect(tiles).toHaveCount(32);
    await expect(tiles.nth(0)).toHaveAttribute('data-team', 'LAC');
    await expect(tiles.nth(0)).toContainText('Pick 1');
    await expect(tiles.nth(1)).toHaveAttribute('data-team', 'MIA');
    await expect(tiles.nth(2)).toHaveAttribute('data-team', 'TEN');

    await expect(page.getByTestId('start-draft')).toBeDisabled();
    await page.getByTestId('team-all').click();
    await expect(page.getByTestId('team-count')).toContainText('32 von 32');
    await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('team-all').click();
    await expect(page.getByTestId('team-count')).toContainText('0 von 32');

    await tiles.nth(5).click();
    await tiles.nth(9).click();
    await expect(page.getByTestId('team-count')).toContainText('2 von 32');
    await expect(page.getByTestId('start-draft')).toBeEnabled();
  });

  test('warnt ehrlich, wenn das Big Board weniger Spieler hat als Picks', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('opt-rounds-1').click();
    await expect(page.getByTestId('setup-pool-short')).toHaveCount(0);
    await page.getByTestId('opt-rounds-7').click();
    await expect(page.getByTestId('setup-pool-short')).toContainText('162');
    await expect(page.getByTestId('setup-pool-short')).toContainText('257');
    await expect(page.getByTestId('setup-pool-short')).toContainText('95');
  });

  test('merkt sich Auswahl und Optionen nach dem Neuladen', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-testid=team-tile][data-team=NYJ]').click();
    await page.getByTestId('opt-rounds-3').click();
    await page.getByTestId('opt-random-chaos').click();
    await page.getByTestId('opt-tempo-slow').click();
    await page.reload();
    await expect(page.getByTestId('team-grid')).toBeVisible();
    await expect(page.locator('[data-testid=team-tile][data-team=NYJ]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('opt-rounds-3')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('opt-random-chaos')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('opt-tempo-slow')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Draft', () => {
  test('eigener Pick, Spielerdetails, Board, Your Picks und Fortsetzen nach Neuladen', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 2);
    await page.getByTestId('start-draft').click();

    // LAC hat Pick 1 -> sofort "You're on the clock"
    const clock = page.getByTestId('clock-panel');
    await expect(clock).toBeVisible();
    await expect(clock).toContainText("You're on the clock");
    await expect(page.getByTestId('clock-pick')).toContainText('Pick 1');
    await expect(page.getByTestId('need-chips')).toContainText('OT');

    // Suche + Details (Größe, Gewicht, College-Statistik)
    await page.getByTestId('player-search').fill('Jeremiah Smith');
    const rows = page.getByTestId('player-row');
    await expect(rows).toHaveCount(1);
    await rows.first().getByTestId('player-more').click();
    const details = rows.first().getByTestId('player-details');
    await expect(details).toContainText('6\'4"');
    await expect(details).toContainText('222 lbs');
    await expect(details).toContainText('984');
    await expect(details).toContainText('–'); // fehlende Angaben (Profil, ADP) bleiben leer, nie erfunden

    // Draft braucht eine Bestätigung
    await rows.first().getByTestId('player-draft').click();
    await expect(page.getByTestId('draft-confirm')).toBeVisible();
    await page.getByTestId('draft-confirm').click();

    // Die KI zieht Pick 2–32 sofort, dann ist LAC bei Pick 33 wieder dran
    await expect(page.getByTestId('clock-pick')).toContainText('Pick 33');
    await expect(page.getByTestId('draft-progress')).toContainText('Pick 32 von 64');

    await showBoard(page);
    await expect(page.locator('[data-testid=pick-row][data-pick="1"]')).toContainText('Jeremiah Smith');
    await expect(page.locator('[data-testid=pick-row][data-pick="2"] [data-testid=picked-name]')).toBeVisible();
    await expect(page.locator('[data-testid=pick-row][data-pick="33"]')).toContainText('On the clock');
    await expect(page.locator('[data-testid=pick-row][data-pick="40"]')).toContainText('Upcoming');
    await expect(page.getByTestId('round-head')).toHaveCount(2);

    // Your Picks zeigt nur die eigenen Slots
    await page.getByTestId('board-tab-mine').click();
    await expect(page.locator('[data-testid=pick-row]:visible')).toHaveCount(2);
    await expect(page.locator('[data-testid=pick-row][data-pick="1"]')).toContainText('Jeremiah Smith');
    await page.getByTestId('board-tab-full').click();

    // Neuladen: genau derselbe Stand, derselbe Pick
    await page.reload();
    await expect(page.getByTestId('draft-progress')).toContainText('Pick 32 von 64');
    await showPick(page);
    await expect(page.getByTestId('clock-pick')).toContainText('Pick 33');
    await showBoard(page);
    await expect(page.locator('[data-testid=pick-row][data-pick="1"]')).toContainText('Jeremiah Smith');

    // Auto-Pick für das eigene Team, dann ist der Draft zu Ende
    await showPick(page);
    await page.getByTestId('auto-pick').click();
    await expect(page.getByTestId('finished-panel')).toBeVisible();
    await expect(page.getByTestId('finished-panel')).toContainText('Alle 64 Picks');
    await expect(page.getByTestId('finished-panel')).toContainText('Jeremiah Smith');
  });

  test('ein Draft mit allen 32 Teams und 7 Runden läuft ohne Fehler bis zum Ende (Tempo sofort)', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openApp(page);
    await page.getByTestId('team-all').click();
    await page.getByTestId('opt-rounds-7').click();
    await page.getByTestId('opt-tempo-instant').click();
    await page.getByTestId('start-draft').click();
    await showPick(page);

    const finished = page.getByTestId('finished-panel');
    for (let guard = 0; guard < 400 && !(await finished.isVisible()); guard++) {
      await page.getByTestId('auto-pick').click({ timeout: 3000 }).catch(() => {});
    }
    await expect(finished).toBeVisible();
    // Das Big Board hat 162 Spieler: Der Draft endet ehrlich nach dem letzten Spieler, ohne Spieler zu erfinden
    await expect(finished).toContainText('Der Pool ist leer: 162 Spieler');
    await expect(page.getByTestId('draft-progress')).toContainText('Pick 162 von 257');
    expect(errors).toEqual([]);

    // Beendeter Draft bleibt nach Neuladen sichtbar und lässt sich verwerfen
    await page.reload();
    await expect(page.getByTestId('resume-info')).toContainText('Beendet');
    await page.getByTestId('resume-new').click();
    await page.getByTestId('resume-discard').click();
    await expect(page.getByTestId('team-grid')).toBeVisible();
    await expect(page.getByTestId('resume-card')).toHaveCount(0);
  });

  test('Computer-Teams ziehen bis zu meinem Pick, Tempo-Regler wirkt auch mitten im Draft', async ({ page }) => {
    await openApp(page);
    await choose(page, ['KC'], 1, 'slow');
    await page.getByTestId('start-draft').click();
    await showPick(page);
    await expect(page.getByTestId('waiting-panel')).toBeVisible();
    const progress = page.getByTestId('draft-progress');
    await expect(progress).toContainText('Pick 0 von 32');
    await page.getByTestId('opt-tempo-instant').click();
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await expect(page.getByTestId('clock-pick')).toContainText('Pick 31');
    await expect(progress).toContainText('Pick 30 von 32');
  });

  test('funktioniert im Flugmodus', async ({ page, context }) => {
    await openApp(page);
    await context.setOffline(true);
    await choose(page, ['LAC'], 1);
    await page.getByTestId('start-draft').click();
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await page.getByTestId('auto-pick').click();
    await expect(page.getByTestId('finished-panel')).toBeVisible();
    await context.setOffline(false);
  });

  test('ein beschädigter gespeicherter Draft wird gemeldet und ignoriert', async ({ page }) => {
    await openApp(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('nfl-mock-draft');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(JSON.stringify({ format: 'nfl-mock-draft-session', version: 1, kaputt: true }), 'activeDraft');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await expect(page.getByTestId('draft-invalid')).toBeVisible();
    await expect(page.getByTestId('team-tile')).toHaveCount(32);
    await choose(page, ['LAC'], 1);
    await page.getByTestId('start-draft').click();
    await expect(page.getByTestId('clock-panel')).toBeVisible();
  });

  test('Draft verwerfen führt zurück zur Teamauswahl', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1);
    await page.getByTestId('start-draft').click();
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await page.getByTestId('draft-discard').click();
    await page.getByTestId('draft-discard-yes').click();
    await expect(page.getByTestId('team-grid')).toBeVisible();
    await expect(page.getByTestId('tab-draft')).toHaveCount(0);
  });

  test('Layout: Handy einspaltig, PC zweispaltig, nichts läuft über, Touch-Flächen ≥ 44 px, DE/EN', async ({ page }) => {
    await openApp(page);
    await noOverflowAndBigTargets(page, 'Teamauswahl');
    await choose(page, ['LAC'], 1);
    await page.getByTestId('start-draft').click();
    await expect(page.getByTestId('clock-panel')).toBeVisible();

    const width = page.viewportSize()!.width;
    const board = page.getByTestId('board-scroll');
    const panel = page.getByTestId('clock-panel');
    if (width >= 900) {
      await expect(board).toBeVisible();
      const b = (await board.boundingBox())!;
      const p = (await panel.boundingBox())!;
      expect(p.x).toBeGreaterThan(b.x + b.width - 2); // Board links, Pick-Bereich rechts
    } else {
      await expect(board).toBeHidden();
      await expect(page.getByTestId('view-board')).toBeVisible();
    }

    await page.getByTestId('player-more').first().click();
    await noOverflowAndBigTargets(page, 'Pick-Bereich');
    await showBoard(page);
    await noOverflowAndBigTargets(page, 'Board');
    await page.getByTestId('board-tab-mine').click();
    await noOverflowAndBigTargets(page, 'Your Picks');

    await page.getByTestId('quick-lang').click();
    await showPick(page);
    await expect(page.getByTestId('clock-panel')).toContainText("You're on the clock");
    await expect(page.getByTestId('clock-panel')).toContainText('Remaining picks: 1');
    await noOverflowAndBigTargets(page, 'Pick-Bereich EN');
    await page.getByTestId('quick-theme').click();
    await noOverflowAndBigTargets(page, 'Hell/Dunkel');
  });
});

test.describe('Noten und PNG-Export', () => {
  test('nach dem Draft: Noten sichtbar, PNG wird als gültige Datei geladen', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1, 'instant');
    await page.getByTestId('start-draft').click();
    await showPick(page);
    const finished = page.getByTestId('finished-panel');
    for (let i = 0; i < 40 && !(await finished.isVisible()); i++) {
      const auto = page.getByTestId('auto-pick');
      if (await auto.isVisible()) await auto.click();
      await page.waitForTimeout(100);
    }
    await expect(finished).toBeVisible();
    await expect(page.getByTestId('grade-team-LAC')).toHaveText(/^[A-DF][+-]?$/);
    await expect(page.getByTestId('result-grade').first()).toHaveText(/^[A-DF][+-]?$/);
    await expect(page.getByTestId('grade-explain')).toContainText('60 %');
    await page.getByTestId('all-grades').locator('summary').click();
    // Nur Teams mit mindestens einem Pick in Runde 1 erscheinen.
    expect(await page.getByTestId('all-grade-row').count()).toBeGreaterThanOrEqual(20);

    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png-LAC').click()]);
    expect(dl.suggestedFilename()).toBe('mock-draft-2027-LAC.png');
    const path = await dl.path();
    const { readFileSync } = await import('node:fs');
    const buf = readFileSync(path!);
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buf.readUInt32BE(16)).toBe(1080); // Breite
    expect(buf.readUInt32BE(20)).toBeGreaterThan(400); // Höhe
  });

  test('Board zeigt Noten an gemachten Picks', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1, 'instant');
    await page.getByTestId('start-draft').click();
    await showPick(page);
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await page.getByTestId('auto-pick').click();
    await showBoard(page);
    await expect(page.getByTestId('pick-grade').first()).toBeVisible();
  });
});

test.describe('Watchlist, Auto-Pick, Verlauf', () => {
  test('Watchlist: Stern setzen, filtern und nach Neuladen noch da', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1);
    await page.getByTestId('start-draft').click();
    await showPick(page);
    await expect(page.getByTestId('clock-panel')).toBeVisible();

    await page.getByTestId('pos-WATCH').click();
    await expect(page.getByText('Noch keine Spieler auf der Watchlist')).toBeVisible();
    await page.getByTestId('pos-ALL').click();
    const star = page.getByTestId('player-star').first();
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pos-WATCH')).toContainText('(1)');
    await page.getByTestId('pos-WATCH').click();
    await expect(page.getByTestId('player-row')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await expect(page.getByTestId('pos-WATCH')).toContainText('(1)');
  });

  test('Auto-Pick-Schalter lässt die KI auch für mein Team ziehen; Mock landet im Verlauf', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1);
    await page.getByTestId('start-draft').click();
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await page.getByTestId('auto-toggle').click();
    await expect(page.getByTestId('finished-panel')).toBeVisible();
    await expect(page.getByTestId('steals-reaches')).toBeVisible();
    await expect(page.getByTestId('history-note')).toBeVisible();

    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-item')).toHaveCount(1);
    await page.getByTestId('history-open').click();
    await expect(page.getByTestId('history-detail')).toBeVisible();
    await expect(page.getByTestId('grade-team-LAC')).toHaveText(/^[A-DF][+-]?$/);
    // Der PNG-Export funktioniert auch aus dem Verlauf
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png-LAC').click()]);
    expect(dl.suggestedFilename()).toBe('mock-draft-2027-LAC.png');
    await page.getByTestId('history-back').click();
    await expect(page.getByTestId('history-list')).toBeVisible();

    // Löschen mit Rückfrage
    await page.getByTestId('history-delete').click();
    await page.getByTestId('history-delete-yes').click();
    await expect(page.getByTestId('history-empty')).toBeVisible();
  });

  test('Zwei Mocks vergleichen', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1);
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('start-draft').click();
      await expect(page.getByTestId('clock-panel')).toBeVisible();
      await page.getByTestId('auto-toggle').click();
      await expect(page.getByTestId('finished-panel')).toBeVisible();
      await page.getByTestId('finished-new').click();
      await expect(page.getByTestId('team-grid')).toBeVisible();
    }
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-item')).toHaveCount(2);
    await page.getByTestId('history-select').nth(0).check();
    await page.getByTestId('history-select').nth(1).check();
    await page.getByTestId('history-compare-go').click();
    await expect(page.getByTestId('history-compare')).toBeVisible();
    await expect(page.getByTestId('compare-col')).toHaveCount(2);
    await expect(page.getByTestId('compare-pick').first()).toBeVisible();
  });

  test('Verlauf: kein horizontales Scrollen, große Touch-Flächen', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1);
    await page.getByTestId('start-draft').click();
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await page.getByTestId('auto-toggle').click();
    await expect(page.getByTestId('finished-panel')).toBeVisible();
    await noOverflowAndBigTargets(page, 'Abschluss');
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-item')).toHaveCount(1);
    await noOverflowAndBigTargets(page, 'Verlauf');
  });
});

test.describe('Trades', () => {
  test('Trade mit Live-Wert: Ablehnung bei zu wenig Wert, Annahme bei fairem Tausch, Board zeigt Herkunft', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 3);
    await page.getByTestId('start-draft').click();
    await showPick(page);
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await expect(page.getByTestId('clock-pick')).toContainText('Pick 1');

    await page.getByTestId('panel-tab-trade').click();
    await expect(page.getByTestId('trade-panel')).toBeVisible();
    await expect(page.getByTestId('trade-chart-note')).toContainText('Näherung');
    await page.getByTestId('trade-partner').selectOption('MIA');

    // Zu wenig Wert: mein später Pick gegen Pick 2
    await page.getByTestId('trade-give-p65').check();
    await page.getByTestId('trade-get-p2').check();
    await expect(page.getByTestId('trade-verdict')).toContainText('lehnt ab');
    await expect(page.getByTestId('trade-execute')).toBeDisabled();
    await page.getByTestId('trade-give-p65').uncheck();

    // Fair: Pick 1 gegen Pick 2 (+ Folgejahr-Pick von Miami als Zugabe)
    await page.getByTestId('trade-give-p1').check();
    await expect(page.getByTestId('trade-verdict')).toContainText('würde annehmen');
    const give = Number(await page.getByTestId('trade-value-give').textContent());
    const get = Number(await page.getByTestId('trade-value-get').textContent());
    expect(give).toBeGreaterThanOrEqual(get);
    await page.getByTestId('trade-execute').click();
    await page.getByTestId('trade-confirm').click();

    // Pick 1 gehört jetzt Miami, ich bin bei Pick 2 dran
    await expect(page.getByTestId('clock-pick')).toContainText('Pick 2');
    await showBoard(page);
    const row1 = page.locator('[data-testid=pick-row][data-pick="1"]');
    await expect(row1).toContainText('MIA');
    await expect(row1).toContainText('LAC'); // Herkunft "↔ LAC"
  });

  test('Computer-Team bietet einen Trade an, der sich annehmen lässt', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1);
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      await page.getByTestId('start-draft').click();
      await showPick(page);
      await expect(page.getByTestId('clock-panel')).toBeVisible();
      if (await page.getByTestId('trade-offer').isVisible()) {
        found = true;
        break;
      }
      await page.getByTestId('draft-discard').click();
      await page.getByTestId('draft-discard-yes').click();
      await expect(page.getByTestId('team-grid')).toBeVisible();
    }
    expect(found, 'in 30 Drafts kam nie ein Angebot').toBe(true);
    const card = page.getByTestId('trade-offer');
    await expect(card).toContainText('bietet');
    const firstOffer = await card.innerText();
    await page.getByTestId('offer-accept').click();
    // Das angenommene Angebot ist weg. Am neu erhaltenen Pick darf ein NEUES Angebot erscheinen,
    // aber nie dasselbe wieder.
    await expect(async () => {
      const offers = page.getByTestId('trade-offer');
      if ((await offers.count()) > 0) expect(await offers.innerText()).not.toBe(firstOffer);
    }).toPass();
    // Pick 1 ist weg: Das Computer-Team zieht, ich warte auf meinen nächsten Pick
    await expect(page.getByTestId('waiting-panel').or(page.getByTestId('clock-panel')).first()).toBeVisible();
    await showBoard(page);
    await expect(page.locator('[data-testid=pick-row][data-pick="1"]')).toContainText('↔ LAC');
  });

  test('Angebote lassen sich ablehnen und abschalten', async ({ page }) => {
    await openApp(page);
    await choose(page, ['LAC'], 1);
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('settings-offers').uncheck();
    await page.getByTestId('tab-home').click();
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('start-draft').click();
      await showPick(page);
      await expect(page.getByTestId('clock-panel')).toBeVisible();
      await expect(page.getByTestId('trade-offer')).toHaveCount(0);
      await page.getByTestId('draft-discard').click();
      await page.getByTestId('draft-discard-yes').click();
      await expect(page.getByTestId('team-grid')).toBeVisible();
    }
  });

  test('Wertchart einfügen: gültige Tabelle wird übernommen, fehlerhafte abgelehnt', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('chart-status')).toContainText('Näherung');
    await page.getByTestId('chart-text').fill('1 100\n2 50');
    await page.getByTestId('chart-import-go').click();
    await expect(page.getByTestId('chart-msg')).toContainText('Zu wenige Picks');
    const lines = Array.from({ length: 230 }, (_, i) => `${i + 1} ${Math.max(1, 1000 - i * 4)}`).join('\n');
    await page.getByTestId('chart-text').fill(lines);
    await page.getByTestId('chart-import-go').click();
    await expect(page.getByTestId('chart-status')).toContainText('eigene Tabelle');
    await page.reload();
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('chart-status')).toContainText('eigene Tabelle');
    await page.getByTestId('chart-reset').click();
    await expect(page.getByTestId('chart-status')).toContainText('Näherung');
  });
});

test.describe('Needs und Pick-Besitzer bearbeiten', () => {
  test('geänderte Needs und Pick-Besitzer gelten im nächsten Draft und bleiben nach Neuladen', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('tab-settings').click();

    // Needs von LAC ändern
    await page.getByTestId('needs-team').selectOption('LAC');
    await page.getByTestId('needs-slot-1').selectOption('QB');
    await page.getByTestId('needs-slot-2').selectOption('QB');
    await page.getByTestId('needs-save').click();
    await expect(page.getByTestId('needs-msg')).toContainText('nur einmal');
    await page.getByTestId('needs-slot-2').selectOption('S');
    await page.getByTestId('needs-slot-3').selectOption('LB');
    await page.getByTestId('needs-slot-4').selectOption('');
    await page.getByTestId('needs-slot-5').selectOption('');
    await page.getByTestId('needs-save').click();
    await expect(page.getByTestId('needs-msg')).toContainText('gespeichert');

    // Pick 3 gehört jetzt LAC
    await page.getByTestId('order-owner-3').selectOption('LAC');
    await expect(page.locator('[data-testid=order-row][data-pick="3"]')).toContainText('laut Daten');

    await page.reload();
    await page.getByTestId('tab-settings').click();
    await expect(page.locator('[data-testid=order-row][data-pick="3"]')).toContainText('laut Daten');
    await page.getByTestId('needs-team').selectOption('LAC');
    await expect(page.getByTestId('needs-default')).toContainText('Von dir geändert');

    await page.getByTestId('tab-home').click();
    await expect(page.getByTestId('setup-overrides')).toContainText('1 Team-Needs, 1 Pick-Besitzer');
    await choose(page, ['LAC'], 1);
    await page.getByTestId('start-draft').click();
    await showPick(page);
    await expect(page.getByTestId('clock-panel')).toBeVisible();
    await expect(page.getByTestId('need-chips')).toContainText('QB');
    await expect(page.getByTestId('need-chips')).toContainText('LB');
    await expect(page.getByTestId('need-chips')).not.toContainText('OT');
    await expect(page.getByTestId('clock-panel')).toContainText('Verbleibende Picks: 2');
    await showBoard(page);
    await expect(page.locator('[data-testid=pick-row][data-pick="3"]')).toContainText('LAC');

    // Zurücksetzen
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('order-reset-all').click();
    await page.getByTestId('order-reset-all-yes').click();
    await expect(page.locator('[data-testid=order-row][data-pick="3"]')).not.toContainText('laut Daten');
    await page.getByTestId('needs-team').selectOption('LAC');
    await page.getByTestId('needs-reset').click();
    await expect(page.getByTestId('needs-default')).toContainText('Standard-Schätzung');
  });

  test('Einstellungen bleiben bei 360 px ohne Überlauf mit großen Touch-Flächen', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('needs-editor')).toBeVisible();
    await noOverflowAndBigTargets(page, 'Einstellungen');
  });
});
