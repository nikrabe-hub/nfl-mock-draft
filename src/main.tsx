import { render } from 'preact';
import { dataStore, loadData } from './data/loader';
import { initInstallPrompt, initPwa } from './pwa';
import { applySettings, loadSettings, settingsStore } from './storage/settings';
import './styles/main.css';
import { App } from './ui/App';

// Sofort zeichnen (mit Standardwerten), gespeicherte Einstellungen danach nachladen.
applySettings(settingsStore.get());
render(<App />, document.getElementById('app')!);
void loadSettings();
// Datenfehler dürfen die App nie lahmlegen: im Notfall läuft sie ohne Spielerdaten weiter.
void loadData().catch(() => dataStore.set({ ...dataStore.get(), loaded: true }));
initInstallPrompt();
initPwa();
