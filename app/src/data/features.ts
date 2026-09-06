import featuresJson from './features.json';
import type { CardFeatures, FeatureDB } from '../domain/synergy';

/**
 * Lädt die Synergie-Merkmale (PLAN.md § 12). Generiert von
 * `pipeline/bootstrap_features.py` (v1) bzw. später `extract_features.py` (LLM).
 * `features.json` ist gitignored — wie `cards.json` per Pipeline erzeugt.
 */
const raw = (featuresJson as { cards?: Record<string, CardFeatures> }).cards ?? {};

export const featureDB: FeatureDB = new Map(Object.entries(raw));
export const hasFeatures = featureDB.size > 0;
