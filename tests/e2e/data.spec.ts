import { expect, test, type Page } from '@playwright/test';

async function openSettings(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('team-grid')).toBeVisible();
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('import-text')).toBeVisible();
}

const CSV = 'Name,Pos,College,Rank\nTest Alpha,QB,Texas,1\nTest Beta,ED,Ohio State,2\nTest Gamma,XX,Utah,3\nTest Delta,WR,,4';

test.describe('Daten und Import', () => {
  test('zeigt den Datenstand an, ohne abzustürzen, auch wenn keine Dateien vorhanden sind', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByTestId('data-sources')).toBeVisible();
    await expect(page.getByTestId('source-big-board')).toBeVisible();
    await expect(page.getByTestId('source-draft-order')).toBeVisible();
  });

  test('liefert Startdaten mit: 162 Spieler, 257 Picks, Quelle und Datum – auch offline nach Neuladen', async ({ page, context }) => {
    await openSettings(page);
    await expect(page.getByTestId('source-big-board')).toContainText('162 Spieler');
    await expect(page.getByTestId('source-big-board')).toContainText('Tankathon');
    await expect(page.getByTestId('source-draft-order')).toContainText('257 Picks');
    await expect(page.getByTestId('source-college-stats')).toContainText('132 Spieler mit Werten');
    await page.getByTestId('tab-home').click();
    await expect(page.getByTestId('home-data')).toContainText('162 Spieler');
    await expect(page.getByTestId('home-data')).toContainText('257 Picks');

    // einmal komplett geladen (Service Worker aktiv) -> auch ohne Internet vorhanden
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('tab-home').click();
    await expect(page.getByTestId('home-data')).toContainText('162 Spieler');
    await context.setOffline(false);
  });

  test('Import: Vorschau zeigt gute und abgelehnte Zeilen, gespeichert wird erst nach Bestätigung', async ({ page }) => {
    await openSettings(page);
    await page.getByTestId('import-text').fill(CSV);
    await page.getByTestId('import-check').click();
    const preview = page.getByTestId('import-preview');
    await expect(preview).toBeVisible();
    await expect(page.getByTestId('import-count-added')).toContainText('2');
    await expect(page.getByTestId('import-count-rejected')).toContainText('2');
    await expect(page.getByTestId('import-rejected')).toContainText('Test Gamma');
    await expect(page.getByTestId('import-rejected')).toContainText('Test Delta');
    // Abbrechen speichert nichts
    await page.getByTestId('import-cancel').click();
    await expect(page.getByTestId('source-overlay')).toHaveCount(0);

    await page.getByTestId('import-check').click();
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-message')).toContainText('2 neu');
    await expect(page.getByTestId('source-overlay')).toContainText('2 Spieler');

    // bleibt nach Neuladen erhalten
    await page.reload();
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('source-overlay')).toContainText('2 Spieler');
    await page.getByTestId('tab-home').click();
    await expect(page.getByTestId('home-data')).toContainText('164 Spieler');

    // zurücksetzen
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('import-reset').click();
    await expect(page.getByTestId('source-overlay')).toHaveCount(0);
  });

  test('Import: Datei hochladen', async ({ page }) => {
    await openSettings(page);
    await page.getByTestId('import-file').setInputFiles({ name: 'spieler.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await expect(page.getByTestId('import-preview')).toBeVisible();
    await expect(page.getByTestId('import-count-added')).toContainText('2');
  });

  test('Import: unbrauchbare Eingaben zeigen eine verständliche Meldung und verändern nichts', async ({ page }) => {
    await openSettings(page);
    for (const bad of ['{kaputt', 'nur ein Wort', '[]']) {
      await page.getByTestId('import-text').fill(bad);
      await page.getByTestId('import-check').click();
      await expect(page.getByTestId('import-message')).toBeVisible();
      await expect(page.getByTestId('import-preview')).toHaveCount(0);
    }
    await page.getByTestId('import-file').setInputFiles({ name: 'bild.json', mimeType: 'application/json', buffer: Buffer.from('\u0000\u0001\u0002 kein json') });
    await expect(page.getByTestId('import-message')).toBeVisible();
    await expect(page.getByTestId('source-overlay')).toHaveCount(0);
    // App läuft weiter
    await page.getByTestId('tab-home').click();
    await expect(page.getByTestId('team-tile')).toHaveCount(32);
  });

  test('Import ist offline möglich', async ({ page, context }) => {
    await openSettings(page);
    await context.setOffline(true);
    await page.getByTestId('import-text').fill(CSV);
    await page.getByTestId('import-check').click();
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('source-overlay')).toContainText('2 Spieler');
    await context.setOffline(false);
  });
});
