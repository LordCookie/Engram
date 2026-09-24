import { useEffect, useState } from 'react';
import { feedbackAdded, getVibration, initFeedbackPrefs, setVibration } from '../native/feedback';

/** Einstellung unter „Mehr": Vibration beim Scannen (Karte im Korb, Knöpfe im Scanner). */
export function FeedbackPanel() {
  const [on, setOn] = useState(getVibration());

  useEffect(() => {
    void initFeedbackPrefs().then(() => setOn(getVibration()));
  }, []);

  function toggle() {
    const next = !on;
    setVibration(next);
    setOn(next);
    if (next) feedbackAdded(); // gleich spüren, wie es sich anfühlt
  }

  return (
    <section className="rounded-lg bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-mono text-lg">Vibration beim Scannen</h2>
          <p className="text-xs text-muted">
            Kurzes Vibrieren, wenn eine Karte in den Scan-Korb geht, und ein leichtes Tippen
            bei den Scanner-Knöpfen.
          </p>
        </div>
        <button
          onClick={toggle}
          role="switch"
          aria-checked={on}
          className={`shrink-0 rounded-md px-4 py-2 font-mono text-sm ${
            on ? 'bg-accent text-on-accent' : 'border border-white/10 text-muted hover:border-accent'
          }`}
        >
          {on ? 'An' : 'Aus'}
        </button>
      </div>
    </section>
  );
}
