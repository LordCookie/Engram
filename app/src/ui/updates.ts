import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { catalog } from '../data/catalog';
import { loadIngestedCorpus } from '../data/coplayCorpus';
import { saveDataBundle, saveExtraCards, storedBundleStamp } from '../data/dataStore';
import { loadNetdeckList } from '../data/netdeck';
import { extraCards, extraLinks, loadedBundle } from '../data/overrides';
import { db } from '../db/db';
import { newCardsFromNetdeck } from '../domain/cardImport';
import { DATA_TAG, findDataAsset, isNewerStamp, shouldCheck, type DataAsset } from '../domain/dataBundle';
import { isNewer, pickLatestRelease, type LatestRelease, type ReleaseInfo } from '../domain/semver';
import { t, tk } from '../i18n';
import { EngramUpdate, nativeUpdates } from '../native/engramUpdate';
import { APP_VERSION } from '../version';

/**
 * Updates aus GitHub und neue Daten — ein gemeinsamer Zustand für die Hinweisleiste oben
 * (`UpdateBanner`) und das Panel unter „Mehr" (`UpdatesPanel`).
 *
 * - **Prüfen**: beim Start, beim Zurückholen der App und stündlich, solange sie offen ist —
 *   höchstens einmal pro Stunde (`shouldCheck`, letzte Prüfung in Dexie). Zwei öffentliche
 *   GETs an die GitHub-API (Release-Liste + Release „data"), keine Nutzerdaten. Neue Karten
 *   erkennt die App an der NetDeck-Liste, die sie für die Bilder ohnehin lädt.
 * - **App-Update** (nur nativ): APK laden → prüfen → Android-Installer (ein Tipp).
 * - **Daten aktualisieren** (Knopf): neue Karten von NetDeck + Datenpaket (Korpus, Meta-Decks),
 *   gespeichert in Dexie, wirksam nach dem Neuladen.
 *
 * Meldungen stehen als deutsche Schlüssel im Zustand und werden erst beim Anzeigen übersetzt.
 */
const REPO = 'LordCookie/Engram';
const CHECK_KEY = 'updateCheck';
const API = `https://api.github.com/repos/${REPO}`;

export interface Msg {
  key: string;
  vars?: Record<string, string | number>;
}

/** Meldung in der aktuellen Sprache. */
export const msgText = (m: Msg): string => t(m.key, m.vars);

export type AppPhase = 'idle' | 'downloading' | 'needsPermission' | 'installing' | 'error';
export type DataPhase = 'idle' | 'loading' | 'done' | 'error';

export interface UpdateState {
  checking: boolean;
  checkedAt?: number;
  /** Neuere App-Version mit APK-Link, falls vorhanden. */
  appUpdate?: LatestRelease;
  dataAsset?: DataAsset;
  /** Datenpaket bei GitHub ist neuer als das, was die App gerade nutzt. */
  dataNew: boolean;
  /** Karten bei NetDeck, die die App noch nicht kennt. */
  newCards: number;
  checkError?: Msg;
  appPhase: AppPhase;
  progress?: { done: number; total: number };
  appMsg?: Msg;
  dataPhase: DataPhase;
  /** Ergebnis von „Daten aktualisieren" (je Zeile eine Meldung). */
  dataMsgs: Msg[];
  /** Es wurde etwas Neues gespeichert → Neuladen wendet es an. */
  needsReload: boolean;
}

let state: UpdateState = { checking: false, dataNew: false, newCards: 0, appPhase: 'idle', dataPhase: 'idle', dataMsgs: [], needsReload: false };
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useUpdates(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// --- Prüfen ------------------------------------------------------------------------

interface StoredCheck {
  checkedAt: number;
  latest: LatestRelease | null;
  dataAsset: DataAsset | null;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Stand der Daten, die die App gerade nutzt (mitgeliefert oder nachgeladen). */
async function activeDataStamp(): Promise<string | undefined> {
  const corpus = await loadIngestedCorpus();
  const candidates = [corpus.generated, loadedBundle()?.created, await storedBundleStamp()];
  return candidates.reduce<string | undefined>((best, s) => (isNewerStamp(s, best) ? s : best), undefined);
}

async function applyCheck(c: StoredCheck): Promise<void> {
  const appUpdate = c.latest && isNewer(c.latest.tag, APP_VERSION) ? c.latest : undefined;
  const dataAsset = c.dataAsset ?? undefined;
  const dataNew = !!dataAsset && isNewerStamp(dataAsset.created, await activeDataStamp());
  set({ checkedAt: c.checkedAt, appUpdate, dataAsset, dataNew });
}

/** Neue Karten bei NetDeck zählen (Liste ist meist schon für die Bilder geladen). */
async function countNewCards(): Promise<void> {
  const list = await loadNetdeckList();
  if (!list.complete) return;
  const known = new Set(catalog.map((c) => c.id));
  set({ newCards: newCardsFromNetdeck(list.items, known).cards.length });
}

/** Nach Updates suchen — ohne `force` höchstens einmal pro Stunde. */
export async function checkForUpdates(force = false): Promise<void> {
  if (state.checking) return;
  void countNewCards();
  let prev: StoredCheck | undefined;
  try {
    prev = (await db.meta.get(CHECK_KEY))?.value as StoredCheck | undefined;
  } catch {
    prev = undefined;
  }
  if (!force && prev && !shouldCheck(Date.now(), prev.checkedAt)) {
    await applyCheck(prev);
    return;
  }
  set({ checking: true, checkError: undefined });
  try {
    // Liste statt `releases/latest`: die APKs erscheinen als Pre-Release, und `latest`
    // überspringt Pre-Releases. Das Daten-Release „data" wird eigens abgefragt.
    const [releases, dataRelease] = await Promise.all([
      getJson<ReleaseInfo[]>(`${API}/releases?per_page=20`),
      getJson<Parameters<typeof findDataAsset>[0]>(`${API}/releases/tags/${DATA_TAG}`),
    ]);
    const c: StoredCheck = {
      checkedAt: Date.now(),
      latest: pickLatestRelease(releases ?? []),
      dataAsset: findDataAsset(dataRelease),
    };
    await db.meta.put({ key: CHECK_KEY, value: c });
    await applyCheck(c);
  } catch {
    if (prev) await applyCheck(prev);
    set({ checkError: { key: tk('GitHub nicht erreichbar — später noch einmal.') } });
  } finally {
    set({ checking: false });
  }
}

let started = false;

/** Einmal beim Start: prüfen, und erneut beim Zurückholen sowie alle 10 Minuten (max. 1×/Std.). */
export function initUpdateChecks(): void {
  if (started) return;
  started = true;
  void checkForUpdates();
  window.setInterval(() => void checkForUpdates(), 10 * 60 * 1000);
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('resume', () => {
        void checkForUpdates();
        // Zurück aus den Einstellungen „Unbekannte Apps installieren" → weiter mit dem Update.
        if (state.appPhase === 'needsPermission') void continueInstall();
      }),
    );
  } else {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void checkForUpdates();
    });
  }
}

// --- App-Update --------------------------------------------------------------------

/** „Jetzt aktualisieren": APK laden, prüfen, Installer öffnen (nur nativ). */
export async function startAppUpdate(): Promise<void> {
  const up = state.appUpdate;
  if (!up) return;
  if (!nativeUpdates() || !up.apk) {
    window.open(up.url, '_blank', 'noopener');
    return;
  }
  set({ appPhase: 'downloading', progress: { done: 0, total: up.apk.size }, appMsg: undefined });
  const sub = await EngramUpdate.addListener('progress', (p) =>
    set({ progress: { done: p.done, total: p.total > 0 ? p.total : (up.apk?.size ?? 0) } }),
  );
  try {
    const info = await EngramUpdate.download({ url: up.apk.url });
    if (!info.samePackage) return fail(tk('Die geladene Datei ist keine engram-App.'));
    if (!info.newer) return fail(tk('Diese Version ist schon installiert.'));
    if (info.sameSigner === false)
      return fail(
        tk(
          'Die neue Version ist mit einem anderen Schlüssel signiert, Android installiert sie nicht über die alte. Erst ein Komplett-Backup machen, dann die App deinstallieren, die neue installieren und das Backup wiederherstellen.',
        ),
      );
    await continueInstall();
  } catch {
    fail(tk('Download fehlgeschlagen — Verbindung prüfen und noch einmal versuchen.'));
  } finally {
    void sub.remove();
  }
}

function fail(key: string): void {
  set({ appPhase: 'error', appMsg: { key } });
}

/** Installer öffnen — vorher ggf. die Erlaubnis „Apps installieren" einholen. */
export async function continueInstall(): Promise<void> {
  try {
    const { allowed } = await EngramUpdate.canInstall();
    if (!allowed) {
      set({ appPhase: 'needsPermission' });
      return;
    }
    set({ appPhase: 'installing' });
    await EngramUpdate.install();
  } catch {
    fail(tk('Der Android-Installer ließ sich nicht öffnen.'));
  }
}

export async function openInstallSettings(): Promise<void> {
  await EngramUpdate.openInstallSettings();
}

// --- Daten aktualisieren -------------------------------------------------------------

/** „Daten aktualisieren": neue Karten von NetDeck + Datenpaket (Korpus, Meta-Decks). */
export async function updateData(): Promise<void> {
  if (state.dataPhase === 'loading') return;
  set({ dataPhase: 'loading', dataMsgs: [] });
  const msgs: Msg[] = [];
  let saved = false;
  let failed = false;

  // 1. Karten direkt von NetDeck (nur neue, bekannte bleiben unverändert)
  const list = await loadNetdeckList(true);
  if (!list.complete) {
    failed = true;
    msgs.push({ key: tk('NetDeck nicht erreichbar — Kartendaten unverändert.') });
  } else {
    const known = new Set(catalog.map((c) => c.id));
    const r = newCardsFromNetdeck(list.items, known);
    if (r.cards.length > 0) {
      await saveExtraCards([...extraCards(), ...r.cards], [...extraLinks(), ...r.links]);
      saved = true;
      msgs.push({ key: tk('{n} neue Karten von NetDeck übernommen.'), vars: { n: r.cards.length } });
    } else {
      msgs.push({ key: tk('Keine neuen Karten — alle {n} sind schon da.'), vars: { n: list.items.length } });
    }
    if (r.skipped.length > 0)
      msgs.push({ key: tk('{n} neue Karten mit unbekanntem Typ übersprungen.'), vars: { n: r.skipped.length } });
    set({ newCards: 0 });
  }

  // 2. Datenpaket aus dem Release „data" (Korpus + Meta-Decks)
  await checkForUpdates(true);
  const asset = state.dataAsset;
  if (!asset) {
    msgs.push({ key: tk('Kein Datenpaket bei GitHub gefunden.') });
  } else if (!state.dataNew) {
    msgs.push({ key: tk('Korpus und Meta-Decks sind aktuell.') });
  } else if (!nativeUpdates()) {
    msgs.push({ key: tk('Korpus und Meta-Decks lassen sich nur in der App nachladen.') });
  } else {
    try {
      const { text } = await EngramUpdate.fetchText({ url: asset.url });
      await saveDataBundle(JSON.parse(text) as unknown, asset.updatedAt);
      saved = true;
      set({ dataNew: false });
      msgs.push({ key: tk('Korpus und Meta-Decks geladen.') });
    } catch {
      failed = true;
      msgs.push({ key: tk('Datenpaket ließ sich nicht laden.') });
    }
  }

  set({ dataPhase: failed && !saved ? 'error' : 'done', dataMsgs: msgs, needsReload: state.needsReload || saved });
}

/** Neu laden, damit Katalog, Korpus und Meta-Decks die nachgeladenen Daten übernehmen. */
export function applyData(): void {
  window.location.reload();
}
