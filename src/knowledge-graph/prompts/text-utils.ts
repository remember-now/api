import { EpisodicNode } from '../models';

export const MAX_SUMMARY_CHARS = 1000;

const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'etc',
  'vs',
  'mr',
  'mrs',
  'dr',
  'prof',
  'sr',
  'jr',
]);

function isSentenceEnd(text: string, pos: number): boolean {
  const ch = text[pos];
  if (ch !== '.' && ch !== '!' && ch !== '?') return false;

  // Decimal numbers: digit.digit
  if (ch === '.' && pos > 0 && pos + 1 < text.length) {
    if (/\d/.test(text[pos - 1]) && /\d/.test(text[pos + 1])) return false;
  }

  // Abbreviation check: word ending with .
  if (ch === '.') {
    let start = pos - 1;
    while (start >= 0 && /[a-zA-Z]/.test(text[start])) start--;
    const word = text.slice(start + 1, pos).toLowerCase();
    if (ABBREVIATIONS.has(word)) return false;
  }

  // Must be followed by whitespace or end-of-string
  if (pos + 1 < text.length && !/\s/.test(text[pos + 1])) return false;

  return true;
}

export function truncateAtSentence(text: string, maxChars = MAX_SUMMARY_CHARS): string {
  if (text.length <= maxChars) return text;

  let lastBoundary = -1;
  for (let i = 0; i < maxChars; i++) {
    if (isSentenceEnd(text, i)) lastBoundary = i + 1;
  }

  if (lastBoundary > 0) return text.slice(0, lastBoundary).trimEnd();
  return text.slice(0, maxChars).trimEnd();
}

export function concatenateEpisodes(episodes: EpisodicNode[]): string {
  return episodes
    .map((ep, i) => `[Episode ${i}] (${ep.validAt.toISOString()})\n${ep.content}`)
    .join('\n\n');
}

export function formatPreviousEpisodes(episodes: EpisodicNode[]): string {
  if (episodes.length === 0) return 'None';
  return episodes
    .map((e) => `- [${e.name}] (${e.validAt.toISOString()}): ${e.content}`)
    .join('\n');
}
