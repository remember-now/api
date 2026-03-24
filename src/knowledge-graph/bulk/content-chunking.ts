import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { EpisodeType } from '../models/nodes/node.types';

export const CHUNK_TOKEN_SIZE = 3000;
export const CHUNK_OVERLAP_TOKENS = 200;
export const CHUNK_MIN_TOKENS = 1000;
export const CHUNK_DENSITY_THRESHOLD = 0.15; // entities per token

// TODO: For accurate token counting matching Python's tiktoken, install
// `js-tiktoken` (npm) and use `cl100k_base` encoding.
// This implementation uses a chars-per-token approximation (4 chars ≈ 1 token),
// which is sufficient for chunking decisions but not exact for model billing.
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function shouldChunk(content: string): boolean {
  return estimateTokens(content) > CHUNK_TOKEN_SIZE;
}

/**
 * Splits text into overlapping chunks using LangChain's RecursiveCharacterTextSplitter.
 * Respects paragraph → sentence → word → character boundaries in that order.
 */
export async function chunkText(
  text: string,
  chunkSize = CHUNK_TOKEN_SIZE,
  overlap = CHUNK_OVERLAP_TOKENS,
): Promise<string[]> {
  if (estimateTokens(text) <= chunkSize) return [text];

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: chunkSize * CHARS_PER_TOKEN,
    chunkOverlap: overlap * CHARS_PER_TOKEN,
    separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
  });

  const docs = await splitter.createDocuments([text]);
  return docs.map((d) => d.pageContent);
}

/**
 * Splits a JSON array string into token-budget chunks.
 * If the content is not a valid JSON array, falls back to chunkText.
 */
export async function chunkJson(
  json: string,
  chunkSize = CHUNK_TOKEN_SIZE,
): Promise<string[]> {
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

/**
 * Dispatcher: routes content to the appropriate chunker based on episode type.
 */
export async function chunkContent(
  content: string,
  source: EpisodeType,
): Promise<string[]> {
  if (source === EpisodeType.json) {
    return chunkJson(content);
  }
  // text and message types use recursive character text chunking
  return chunkText(content);
}
