import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { EntityNodeRepository } from '../neo4j/repositories';
import { Uuid } from '../neo4j/types';
import { DEFAULT_MMR_LAMBDA } from './types';

// ─── RRF ─────────────────────────────────────────────────────────────────────

/**
 * Reciprocal rank fusion across multiple ranked UUID lists.
 * rank_const = 1 (matching the graphiti Python implementation).
 */
export function rrf<T extends string = Uuid>(
  resultUuidLists: T[][],
  minScore = 0,
): [T[], number[]] {
  const scores = new Map<T, number>();

  for (const list of resultUuidLists) {
    for (let i = 0; i < list.length; i++) {
      const uuid = list[i];
      scores.set(uuid, (scores.get(uuid) ?? 0) + 1 / (i + 1));
    }
  }

  const sorted = [...scores.entries()]
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1]);

  return [sorted.map(([uuid]) => uuid), sorted.map(([, score]) => score)];
}

// ─── MMR ─────────────────────────────────────────────────────────────────────

function l2Normalize(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (mag === 0) return v;
  return v.map((x) => x / mag);
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Maximal marginal relevance reranker.
 *
 * Candidates are L2-normalized; the query vector is used as-is (matching Python).
 * mmr_score = lambda * dot(queryVec, normCandidate) + (lambda-1) * maxPairwiseSim
 */
export function mmr<T extends string = Uuid>(
  queryVector: number[],
  uuidVectorPairs: Map<T, number[]>,
  lambda = DEFAULT_MMR_LAMBDA,
  minScore = -2.0,
): [T[], number[]] {
  if (uuidVectorPairs.size === 0) return [[], []];

  const uuids = [...uuidVectorPairs.keys()];
  const normalized = uuids.map((uuid) => l2Normalize(uuidVectorPairs.get(uuid)!));

  // Build full pairwise similarity matrix
  const simMatrix: number[][] = Array.from({ length: uuids.length }, () =>
    Array.from<number>({ length: uuids.length }).fill(0),
  );
  for (let i = 0; i < uuids.length; i++) {
    for (let j = 0; j < i; j++) {
      const sim = dotProduct(normalized[i], normalized[j]);
      simMatrix[i][j] = sim;
      simMatrix[j][i] = sim;
    }
  }

  const mmrScores = uuids.map((_, i) => {
    const maxSim = simMatrix[i].reduce((m, v) => (v > m ? v : m), -Infinity);
    return lambda * dotProduct(queryVector, normalized[i]) + (lambda - 1) * maxSim;
  });

  const scored = uuids
    .map((uuid, i) => [uuid, mmrScores[i]] as [T, number])
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1]);

  return [scored.map(([uuid]) => uuid), scored.map(([, score]) => score)];
}

// ─── Node distance reranker ───────────────────────────────────────────────────

/**
 * Ranks nodes by their graph distance to a center node.
 * Nodes directly connected to the center get score=1; others get Infinity.
 * Returns 1/score so closer nodes rank higher.
 */
export async function nodeDistanceReranker(
  repo: EntityNodeRepository,
  nodeUuids: Uuid[],
  centerNodeUuid: Uuid,
  minScore = 0,
): Promise<[Uuid[], number[]]> {
  const filteredUuids = nodeUuids.filter((uuid) => uuid !== centerNodeUuid);
  const scores = new Map<Uuid, number>();

  if (filteredUuids.length > 0) {
    const results = await repo.getNodeDistanceScores(filteredUuids, centerNodeUuid);
    for (const row of results) {
      scores.set(row.uuid, row.score);
    }
  }

  for (const uuid of filteredUuids) {
    if (!scores.has(uuid)) scores.set(uuid, Infinity);
  }

  filteredUuids.sort((a, b) => scores.get(a)! - scores.get(b)!);

  // Re-insert center node at front if it was in the original list
  const orderedUuids = nodeUuids.includes(centerNodeUuid)
    ? [centerNodeUuid, ...filteredUuids]
    : filteredUuids;

  if (nodeUuids.includes(centerNodeUuid)) {
    scores.set(centerNodeUuid, 0.1);
  }

  const result = orderedUuids
    .map((uuid) => {
      const s = scores.get(uuid) ?? Infinity;
      return [uuid, s === Infinity ? 0 : 1 / s] as [Uuid, number];
    })
    .filter(([, invScore]) => invScore >= minScore);

  return [result.map(([uuid]) => uuid), result.map(([, score]) => score)];
}

// ─── Episode mentions reranker ────────────────────────────────────────────────

/**
 * Reranks node UUIDs by the number of episodic mentions.
 * Uses RRF as a preliminary ranker, then sorts descending by mention count
 * so the most-mentioned nodes rank highest.
 */
export async function episodeMentionsReranker(
  repo: EntityNodeRepository,
  nodeUuidLists: Uuid[][],
  minScore = 0,
): Promise<[Uuid[], number[]]> {
  const [sortedUuids] = rrf<Uuid>(nodeUuidLists);
  const scores = new Map<Uuid, number>();

  if (sortedUuids.length > 0) {
    const results = await repo.getEpisodeMentionCounts(sortedUuids);
    for (const row of results) {
      scores.set(row.uuid, Number(row.score));
    }
  }

  for (const uuid of sortedUuids) {
    if (!scores.has(uuid)) scores.set(uuid, 0);
  }
  sortedUuids.sort((a, b) => scores.get(b)! - scores.get(a)!);

  const result = sortedUuids
    .map((uuid) => [uuid, scores.get(uuid)!] as [Uuid, number])
    .filter(([, score]) => score >= minScore);

  return [result.map(([uuid]) => uuid), result.map(([, score]) => score)];
}

// ─── Cross-encoder reranker ───────────────────────────────────────────────────

// TODO: This LLM-based scorer is a placeholder. Python Graphiti uses a real
// neural cross-encoder model (graphiti_core/cross_encoder/) for higher-quality
// relevance scoring at lower latency. Replace with a dedicated cross-encoder
// inference endpoint when available.
const CrossEncoderScoreSchema = z.object({
  score: z.number().min(0).max(100),
});

/**
 * LLM-based cross-encoder reranker. Scores each item 0–100 for relevance to
 * the query and normalizes to [0, 1].
 */
export async function crossEncoderReranker(
  model: BaseChatModel,
  query: string,
  items: Array<{ uuid: Uuid; text: string }>,
  minScore = 0,
): Promise<[Uuid[], number[]]> {
  if (items.length === 0) return [[], []];

  const scoredModel = model.withStructuredOutput(z.toJSONSchema(CrossEncoderScoreSchema));

  const rawScores = await Promise.all(
    items.map((item) =>
      scoredModel.invoke([
        // TOOD: Is this the best way to do this? how is withStructuredOutput populating the prompt?
        new SystemMessage(
          'Rate the relevance of the text to the query from 0 to 100. Respond with only a JSON object containing "score".',
        ),
        new HumanMessage(`Query: ${query}\n\nText: ${item.text}`),
      ]),
    ),
  );

  const scored = items
    .map((item, i) => {
      const raw = rawScores[i] as { score: number };
      const normalized = (raw.score ?? 0) / 100;
      return [item.uuid, normalized] as [Uuid, number];
    })
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1]);

  return [scored.map(([uuid]) => uuid), scored.map(([, score]) => score)];
}
