import { useState } from 'preact/hooks';
import { useT } from '../i18n';
import { applyUpdate, pwaState } from '../pwa';
import { settingsStore, updateSettings, type Theme } from '../storage/settings';
import { useStore } from '../store';
import { Home } from './Home';
import { Settings } from './Settings';

type Tab = 'home' | 'settings';

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

/** Eigene SVG-Symbole: funktionieren auf jedem Gerät und offline, unabhängig von Schriftarten. */
function ThemeIcon({ theme }: { theme: Theme }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' as const, 'aria-hidden': true };
  if (theme === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (theme === 'dark')
    return (
      <svg {...common}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  );
}

export function App() {
  const t = useT();
  const settings = useStore(settingsStore);
  const pwa = useStore(pwaState);
  const [tab, setTab] = useState<Tab>('home');

  return (
    <div class="app">
      <header class="topbar">
        <span class="brand">{t('app.short')} 2027</span>
        <div class="topbar-actions">
          <button
            type="button"
            class="icon-btn"
            data-testid="quick-lang"
            aria-label={t('header.lang')}
            onClick={() => void updateSettings({ lang: settings.lang === 'de' ? 'en' : 'de' })}
          >
            {settings.lang.toUpperCase()}
          </button>
          <button
            type="button"
            class="icon-btn"
            data-testid="quick-theme"
            aria-label={`${t('header.theme')} (${t(`settings.theme.${settings.theme}`)})`}
            onClick={() => void updateSettings({ theme: NEXT_THEME[settings.theme] })}
          >
            <ThemeIcon theme={settings.theme} />
          </button>
        </div>
      </header>

      {pwa.needRefresh && (
        <div class="update-banner" role="status" data-testid="update-banner">
          <span>{t('pwa.update')}</span>
          <button type="button" class="btn btn-small" onClick={applyUpdate}>
            {t('pwa.update.button')}
          </button>
        </div>
      )}

      <main class="content">{tab === 'home' ? <Home /> : <Settings />}</main>

      <nav class="tabbar" aria-label={t('nav.main')}>
        <button type="button" class={tab === 'home' ? 'tab active' : 'tab'} aria-current={tab === 'home' ? 'page' : undefined} data-testid="tab-home" onClick={() => setTab('home')}>
          {t('nav.start')}
        </button>
        <button type="button" class={tab === 'settings' ? 'tab active' : 'tab'} aria-current={tab === 'settings' ? 'page' : undefined} data-testid="tab-settings" onClick={() => setTab('settings')}>
          {t('nav.settings')}
        </button>
      </nav>
    </div>
  );
}
