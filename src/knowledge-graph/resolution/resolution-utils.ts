// NOTE: Python Graphiti uses MinHash + LSH (graphiti_core/utils/maintenance/dedup_helpers.py)
// for O(n) approximate candidate detection before cosine similarity.
// This port uses direct cosine similarity (O(n×d)) instead, which is simpler
// and leverages embeddings already computed. For very large node sets, adding
// MinHash pre-filtering would improve resolution performance.
export const COSINE_SIMILARITY_THRESHOLD = 0.9;
export const FACT_SIMILARITY_THRESHOLD = 0.85;
export const LOW_ENTROPY_THRESHOLD = 1.5;
export const MAX_CANDIDATES = 10;
export const MAX_KEYWORD_CANDIDATES = 10;

export function normalizeString(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Mirrors Python's _normalize_name_for_fuzzy (dedup_helpers.py:45-49).
// Strips characters outside [a-z0-9' ] before entropy computation so that
// punctuation and special chars do not inflate the entropy score.
export function normalizeNameForEntropy(name: string): string {
  return normalizeString(name)
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '');
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const ch of s) {
    freq[ch] = (freq[ch] ?? 0) + 1;
  }
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
