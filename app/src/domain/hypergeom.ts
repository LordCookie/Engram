/**
 * Hypergeometrische Wahrscheinlichkeiten fürs Deckbau-Werkzeug „Zieh-Chancen":
 * Wie wahrscheinlich ist es, aus einem Deck von `population` Karten (davon
 * `successes` „Treffer") bei `draws` gezogenen Karten mindestens `atLeast` Treffer
 * zu ziehen? Rein/getestet. Über Log-Fakultäten stabil (keine Overflow-Probleme
 * bei den kleinen Deckgrößen ~40–50).
 */

const LN_FACT: number[] = [0];
function lnFact(n: number): number {
  for (let i = LN_FACT.length; i <= n; i++) LN_FACT[i] = LN_FACT[i - 1] + Math.log(i);
  return LN_FACT[n];
}
function lnC(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return -Infinity;
  return lnFact(n) - lnFact(k) - lnFact(n - k);
}

/** P(X ≥ atLeast), X ~ Hypergeometrisch(population, successes, draws). 0..1. */
export function hypergeomAtLeast(
  population: number,
  successes: number,
  draws: number,
  atLeast = 1,
): number {
  if (atLeast <= 0) return 1;
  const N = population;
  const K = successes;
  const n = Math.min(Math.max(0, draws), N);
  if (N <= 0 || K <= 0 || n <= 0) return 0;
  const lo = Math.max(atLeast, Math.max(0, n - (N - K)));
  const hi = Math.min(n, K);
  if (lo > hi) return 0;
  const denom = lnC(N, n);
  let p = 0;
  for (let i = lo; i <= hi; i++) p += Math.exp(lnC(K, i) + lnC(N - K, n - i) - denom);
  return Math.min(1, Math.max(0, p));
}
