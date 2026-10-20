import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initLang } from './ui/lang';
import './index.css';

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
