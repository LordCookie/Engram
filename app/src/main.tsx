import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initLang } from './ui/lang';
import { initBackButton } from './ui/backButton';
import { initDataOverrides } from './data/dataStore';
import './index.css';
import './effects.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root-Element #root nicht gefunden');

// Erst Sprache und nachgeladene Daten (Dexie), dann die App laden und rendern: sonst
// blitzt kurz Deutsch auf, und der Katalog würde ohne die nachgeladenen Karten gebaut.
// Deshalb wird die App erst danach importiert.
void Promise.allSettled([initLang(), initDataOverrides()]).then(async () => {
  const { default: App } = await import('./App');
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
void initBackButton(); // Android-Zurück schließt offene Vollbild-Fenster (Scanner, Binder …)
