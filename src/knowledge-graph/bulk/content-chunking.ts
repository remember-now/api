import { EpisodeType } from '../models/nodes/node.types';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CHUNK_TOKEN_SIZE = 3000;
export const CHUNK_OVERLAP_TOKENS = 200;
export const CHUNK_MIN_TOKENS = 1000;
export const CHUNK_DENSITY_THRESHOLD = 0.15; // entities per token

// TODO: For accurate token counting matching Python's tiktoken, install
// `js-tiktoken` (npm) and use `cl100k_base` encoding.
// This implementation uses a chars-per-token approximation (4 chars ≈ 1 token),
// which is sufficient for chunking decisions but not exact for model billing.
const CHARS_PER_TOKEN = 4;

// ─── Token estimation ─────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── shouldChunk ─────────────────────────────────────────────────────────────

export function shouldChunk(content: string): boolean {
  return estimateTokens(content) > CHUNK_TOKEN_SIZE;
}

// ─── chunkText ────────────────────────────────────────────────────────────────

/**
 * Splits text into overlapping chunks on sentence boundaries.
 * Falls back to hard character splits when no sentence boundary is found.
 */
export function chunkText(
  text: string,
  chunkSize = CHUNK_TOKEN_SIZE,
  overlap = CHUNK_OVERLAP_TOKENS,
): string[] {
  if (estimateTokens(text) <= chunkSize) return [text];

  const chunkChars = chunkSize * CHARS_PER_TOKEN;
  const overlapChars = overlap * CHARS_PER_TOKEN;

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkChars, text.length);
    let chunkEnd = end;

    // Try to break on a sentence boundary (.  !  ?) within the last 20% of the chunk
    if (end < text.length) {
      const searchStart = start + Math.floor(chunkChars * 0.8);
      const sentenceEnd = findSentenceBoundary(text, searchStart, end);
      if (sentenceEnd !== -1) {
        chunkEnd = sentenceEnd;
      }
    }

    const chunk = text.slice(start, chunkEnd).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (chunkEnd >= text.length) break;

    // Move start forward, backing off by overlap
    start = Math.max(chunkEnd - overlapChars, start + 1);
  }

  return chunks;
}

function findSentenceBoundary(
  text: string,
  searchStart: number,
  searchEnd: number,
): number {
  for (let i = searchEnd - 1; i >= searchStart; i--) {
    if (
      (text[i] === '.' || text[i] === '!' || text[i] === '?') &&
      i + 1 < text.length &&
      text[i + 1] === ' '
    ) {
      return i + 1;
    }
  }
  return -1;
}

// ─── chunkJson ────────────────────────────────────────────────────────────────

/**
 * Splits a JSON array string into token-budget chunks.
 * If the content is not a valid JSON array, falls back to chunkText.
 */
export function chunkJson(
  json: string,
  chunkSize = CHUNK_TOKEN_SIZE,
): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return chunkText(json, chunkSize);
  }

  if (!Array.isArray(parsed)) {
    // For objects, just use text chunking
    return chunkText(json, chunkSize);
  }

  if (estimateTokens(json) <= chunkSize) return [json];

  const chunks: string[] = [];
  let currentItems: unknown[] = [];
  let currentTokens = 0;

  for (const item of parsed) {
    const itemStr = JSON.stringify(item);
    const itemTokens = estimateTokens(itemStr);

    if (currentTokens + itemTokens > chunkSize && currentItems.length > 0) {
      chunks.push(JSON.stringify(currentItems));
      currentItems = [];
      currentTokens = 0;
    }

    currentItems.push(item);
    currentTokens += itemTokens;
  }

  if (currentItems.length > 0) {
    chunks.push(JSON.stringify(currentItems));
  }

  return chunks.length > 0 ? chunks : [json];
}

// ─── chunkContent ─────────────────────────────────────────────────────────────

/**
 * Dispatcher: routes content to the appropriate chunker based on episode type.
 */
export function chunkContent(content: string, source: EpisodeType): string[] {
  if (source === EpisodeType.json) {
    return chunkJson(content);
  }
  // text and message types use sentence-boundary text chunking
  return chunkText(content);
}
