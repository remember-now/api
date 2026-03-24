import { EpisodeType } from '../models/nodes/node.types';
import {
  CHUNK_TOKEN_SIZE,
  chunkContent,
  chunkJson,
  chunkText,
  shouldChunk,
} from './content-chunking';

describe('shouldChunk', () => {
  it('returns false for content below the token threshold', () => {
    const short = 'a'.repeat(100);
    expect(shouldChunk(short)).toBe(false);
  });

  it('returns true for content above the token threshold', () => {
    // CHUNK_TOKEN_SIZE tokens × 4 chars/token + 1 char pushes over the limit
    const long = 'a'.repeat(CHUNK_TOKEN_SIZE * 4 + 1);
    expect(shouldChunk(long)).toBe(true);
  });

  it('returns false for content exactly at the token threshold', () => {
    const exact = 'a'.repeat(CHUNK_TOKEN_SIZE * 4);
    expect(shouldChunk(exact)).toBe(false);
  });
});

describe('chunkText', () => {
  it('returns the original text in a single-element array when below threshold', async () => {
    const text = 'Short text.';
    const result = await chunkText(text);
    expect(result).toEqual([text]);
  });

  it('splits long text into multiple chunks', async () => {
    // 3000 tokens × 4 chars/token = 12000 chars; use 20000 chars to ensure splitting
    const sentence = 'This is a sentence. ';
    const long = sentence.repeat(1000); // ~20000 chars ≈ 5000 tokens
    const result = await chunkText(long);
    expect(result.length).toBeGreaterThan(1);
  });

  it('each chunk is non-empty', async () => {
    // 20000 chars ≈ 5000 tokens, well above 3000 threshold
    const sentence = 'Word '.repeat(500);
    const long = sentence.repeat(10);
    const result = await chunkText(long);
    for (const chunk of result) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it('respects a custom chunkSize', async () => {
    // chunkSize=10 tokens = 40 chars; content of 200 chars must split
    const text = 'x'.repeat(200);
    const result = await chunkText(text, 10, 0);
    expect(result.length).toBeGreaterThan(1);
  });
});

describe('chunkJson', () => {
  it('returns the original JSON string when it is below the token threshold', async () => {
    const json = JSON.stringify([{ a: 1 }, { b: 2 }]);
    const result = await chunkJson(json);
    expect(result).toEqual([json]);
  });

  it('splits a large JSON array into multiple chunks', async () => {
    // Each item ≈ 50 chars; 1000 items ≈ 50000 chars ≈ 12500 tokens → above 3000
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      value: 'some_data_here',
    }));
    const json = JSON.stringify(items);
    const result = await chunkJson(json);
    expect(result.length).toBeGreaterThan(1);
    // Each chunk must be valid JSON
    for (const chunk of result) {
      expect(() => JSON.parse(chunk) as unknown).not.toThrow();
    }
  });

  it('falls back to text chunking for non-array JSON', async () => {
    const json = JSON.stringify({ key: 'a'.repeat(20000) });
    const result = await chunkJson(json);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to text chunking for invalid JSON', async () => {
    const notJson = 'not json at all ' + 'x'.repeat(20000);
    const result = await chunkJson(notJson);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('chunkContent', () => {
  it('dispatches to chunkJson for EpisodeType.json', async () => {
    const json = JSON.stringify([{ id: 1 }]);
    const result = await chunkContent(json, EpisodeType.json);
    expect(result).toEqual([json]);
  });

  it('dispatches to chunkText for EpisodeType.text', async () => {
    const text = 'Hello world.';
    const result = await chunkContent(text, EpisodeType.text);
    expect(result).toEqual([text]);
  });

  it('dispatches to chunkText for EpisodeType.message', async () => {
    const msg = 'Hello.';
    const result = await chunkContent(msg, EpisodeType.message);
    expect(result).toEqual([msg]);
  });
});
