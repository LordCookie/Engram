import { isNewerStamp } from '../domain/dataBundle';
import { loadIngestedCorpus } from './coplayCorpus';
import { storedBundleStamp } from './dataStore';
import { loadedBundle } from './overrides';

/**
 * Stand der Daten (Korpus + Meta-Decks), die die App gerade nutzt — mitgeliefert oder
 * nachgeladen. Damit vergleichen die Update-Prüfung in der App und der tägliche Blick im
 * Hintergrund das Datenpaket bei GitHub. Format „YYYY-MM-DDTHH:MM:SSZ" (wie das Asset-Label).
 */
export async function activeDataStamp(): Promise<string | undefined> {
  const corpus = await loadIngestedCorpus();
  const candidates = [corpus.generated, loadedBundle()?.created, await storedBundleStamp()];
  const best = candidates.reduce<string | undefined>((b, s) => (isNewerStamp(s, b) ? s : b), undefined);
  if (!best) return undefined;
  const d = new Date(best);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
