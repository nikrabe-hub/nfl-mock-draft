import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('team-grid')).toBeVisible();
}

test.describe('Grundgerüst', () => {
  test('zeigt alle 32 Teams mit Logo', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('team-tile')).toHaveCount(32);
    // Alle Logos müssen wirklich geladen sein (kein kaputtes Bild)
    await expect.poll(async () =>
      page.$$eval('img.logo', (imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length),
    ).toBe(32);
    await expect(page.locator('.badge')).toHaveCount(0);
  });

  test('hat kein horizontales Scrollen und Touch-Flächen von mind. 44 px', async ({ page }) => {
    await open(page);
    for (const tab of ['tab-home', 'tab-settings']) {
      await page.getByTestId(tab).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontaler Überhang auf ${tab}`).toBeLessThanOrEqual(0);

      const small = await page.$$eval('button', (btns) =>
        btns
          .map((b) => {
            const r = b.getBoundingClientRect();
            return { text: b.textContent?.trim(), w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
          })
          .filter((b) => b.visible && (b.h < 44 || b.w < 44)),
      );
      expect(small, 'zu kleine Buttons').toEqual([]);
    }
  });

  test('zeigt bei fehlendem Logo ein Farb-Badge statt eines kaputten Bildes', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route(/\/logos\/CAR\.(png|svg|webp)$/, (route) => route.fulfill({ status: 404, body: 'nicht da' }));
    await open(page);
    const badge = page.getByTestId('logo-badge-CAR');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('CAR');
    await expect(page.getByTestId('logo-img-CAR')).toHaveCount(0);
    // Die übrigen 31 Logos bleiben normal
    await expect(page.locator('img.logo')).toHaveCount(31);
    await context.close();
  });

  test('speichert Design und Sprache dauerhaft (Neuladen)', async ({ page }) => {
    await open(page);
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('theme-dark').click();
    await page.getByTestId('lang-en').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('tab-settings')).toHaveText('Settings');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('tab-home')).toHaveText('Start');
    await expect(page.getByTestId('tab-settings')).toHaveText('Settings');
    await expect(page.getByTestId('storage-status')).toContainText('IndexedDB');
  });

  test('läuft nach dem ersten Laden komplett offline', async ({ page, context }) => {
    await open(page);
    await expect(page.getByTestId('offline-status')).toHaveText(/Offline bereit/);
    // Service Worker muss die Seite kontrollieren, bevor wir offline gehen
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('team-tile')).toHaveCount(32);
    await expect.poll(async () =>
      page.$$eval('img.logo', (imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length),
    ).toBe(32);
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('backup-export')).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('Backup', () => {
  test('lehnt ungültige Dateien mit klarer Meldung ab und ändert nichts', async ({ page }) => {
    await open(page);
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('theme-dark').click();

    await page.getByTestId('backup-file').setInputFiles({
      name: 'kaputt.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{das ist kein json'),
    });
    await expect(page.getByTestId('backup-message')).toContainText('keine gültige JSON-Datei');
    await expect(page.getByTestId('backup-message')).toContainText('nichts verändert');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByTestId('backup-file').setInputFiles({
      name: 'fremd.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ irgendwas: 1 })),
    });
    await expect(page.getByTestId('backup-message')).toContainText('keine Backup-Datei');
    await expect(page.getByTestId('backup-restore')).toHaveCount(0);
  });

  test('exportiert ein Backup und stellt es wieder her', async ({ page }) => {
    await open(page);
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('theme-dark').click();
    await page.getByTestId('lang-en').click();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()]);
    expect(download.suggestedFilename()).toMatch(/^nfl-mock-draft-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const file = Buffer.concat(chunks);
    const parsed = JSON.parse(file.toString('utf8'));
    expect(parsed.format).toBe('nfl-mock-draft-backup');
    expect(parsed.data.settings).toEqual({ theme: 'dark', lang: 'en' });

    // Einstellungen ändern, dann aus dem Backup zurückholen
    await page.getByTestId('theme-light').click();
    await page.getByTestId('lang-de').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByTestId('backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: file });
    await expect(page.getByTestId('backup-preview')).toBeVisible();
    await page.getByTestId('backup-restore').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('backup-message')).toContainText('1');
  });
});
