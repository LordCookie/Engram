import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initLang } from './ui/lang';
import { initBackButton } from './ui/backButton';
import './index.css';
import './effects.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root-Element #root nicht gefunden');

// Erst die Sprache (Dexie/Gerät), dann rendern — sonst blitzt kurz Deutsch auf.
void initLang().finally(() =>
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
void initBackButton(); // Android-Zurück schließt offene Vollbild-Fenster (Scanner, Binder …)
