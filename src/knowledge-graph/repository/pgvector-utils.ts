// pgvector wire format is the text representation '[0.1,0.2,...]'. Prisma's
// $queryRaw / $executeRaw must serialize embeddings to this format on write
// and parse them back from `name_embedding::text` projections on read.

export const toPgVector = (v: readonly number[] | null): string | null =>
  v === null ? null : `[${v.join(',')}]`;

export const fromPgVector = (s: string | null | undefined): number[] | null => {
  if (s === null || s === undefined) return null;
  return JSON.parse(s) as number[];
};
