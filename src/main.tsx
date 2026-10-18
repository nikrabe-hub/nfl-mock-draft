import { render } from 'preact';
import { initInstallPrompt, initPwa } from './pwa';
import { applySettings, loadSettings, settingsStore } from './storage/settings';
import './styles/main.css';
import { App } from './ui/App';

// Sofort zeichnen (mit Standardwerten), gespeicherte Einstellungen danach nachladen.
applySettings(settingsStore.get());
render(<App />, document.getElementById('app')!);
void loadSettings();
initInstallPrompt();
initPwa();
