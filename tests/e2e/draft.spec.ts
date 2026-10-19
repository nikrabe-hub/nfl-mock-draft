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

async function showBoard(page: Page) {
  const sw = page.getByTestId('view-board');
  if (await sw.isVisible()) await sw.click();
}

async function showPick(page: Page) {
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
    await expect(page.getByTestId('pick-row')).toHaveCount(2);
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
