import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { Uuid } from '@/common/schemas';
import { NoOpLlmTracer } from '@/observability';
import {
  KG_DIFF_EMBEDDING,
  KG_HIGH_SIM_EMBEDDING,
  KG_NEAR_SAME_EMBEDDING,
  KG_TEST_GRAPH_ID,
  KgNodeFactory,
} from '@/test/factories';

import { EntityNode } from '../models';
import { NodeResolutionService } from './node-resolution.service';

const u = (s: string) => s as Uuid;

const baseEpisode = KgNodeFactory.createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp.',
  graphId: KG_TEST_GRAPH_ID,
});

function makeNode(name: string, embedding: number[] | null = null): EntityNode {
  return KgNodeFactory.createEntityNode({
    name,
    graphId: KG_TEST_GRAPH_ID,
    nameEmbedding: embedding,
  });
}

describe('NodeResolutionService', () => {
  let service: NodeResolutionService;
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    service = new NodeResolutionService(new NoOpLlmTracer());
    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  it('should resolve exact name match without LLM call', async () => {
    const extracted = [makeNode('Alice', KG_HIGH_SIM_EMBEDDING)];
    const existing = [makeNode('alice', KG_HIGH_SIM_EMBEDDING)]; // normalizes to same
    existing[0].id = u('existing-id');

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.idMap.get(extracted[0].id)).toBe('existing-id');
    expect(result.resolvedNodes).toHaveLength(0);
  });

  it('should add duplicate pair for exact name match', async () => {
    const extracted = [makeNode('Alice', KG_HIGH_SIM_EMBEDDING)];
    const existing = [makeNode('alice', KG_HIGH_SIM_EMBEDDING)];
    existing[0].id = u('existing-id');

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(result.duplicatePairs).toHaveLength(1);
    expect(result.duplicatePairs[0]).toEqual({
      extractedId: extracted[0].id,
      canonicalId: u('existing-id'),
    });
  });

  it('should escalate single cosine candidate to LLM', async () => {
    const extracted = [makeNode('Alice Johnson', KG_HIGH_SIM_EMBEDDING)];
    const existing = [makeNode('Alice J.', KG_NEAR_SAME_EMBEDDING)];
    existing[0].id = u('cosine-id');

    mockRunnable.invoke.mockResolvedValue({
      entityResolutions: [{ id: 0, name: 'Alice Johnson', duplicateCandidateId: 0 }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
    expect(result.idMap.get(extracted[0].id)).toBe('cosine-id');
    expect(result.resolvedNodes).toHaveLength(0);
  });

  it('should add as new node when LLM rejects single cosine candidate', async () => {
    const extracted = [makeNode('Alice Johnson', KG_HIGH_SIM_EMBEDDING)];
    const existing = [makeNode('Alice J.', KG_NEAR_SAME_EMBEDDING)];
    existing[0].id = u('cosine-id');

    mockRunnable.invoke.mockResolvedValue({
      entityResolutions: [{ id: 0, name: 'Alice Johnson', duplicateCandidateId: -1 }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
    expect(result.idMap.has(extracted[0].id)).toBe(false);
    expect(result.resolvedNodes).toHaveLength(1);
  });

  it('should escalate multiple cosine candidates to LLM', async () => {
    const extracted = [makeNode('Alice', KG_HIGH_SIM_EMBEDDING)];
    const existing = [
      {
        ...makeNode('Alice Smith', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-1'),
      },
      {
        ...makeNode('Alice Jones', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-2'),
      },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entityResolutions: [{ id: 0, name: 'Alice', duplicateCandidateId: 0 }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
    expect(result.idMap.get(extracted[0].id)).toBe('exist-1');
  });

  it('should add duplicate pair when LLM returns a duplicate_name match', async () => {
    const extracted = [makeNode('Alice', KG_HIGH_SIM_EMBEDDING)];
    const existing = [
      {
        ...makeNode('Alice Smith', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-1'),
      },
      {
        ...makeNode('Alice Jones', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-2'),
      },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entityResolutions: [{ id: 0, name: 'Alice', duplicateCandidateId: 0 }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(result.duplicatePairs).toHaveLength(1);
    expect(result.duplicatePairs[0]).toEqual({
      extractedId: extracted[0].id,
      canonicalId: 'exist-1',
    });
  });

  it('should add node to resolvedNodes when LLM returns empty duplicate_name', async () => {
    const extracted = [makeNode('Alice', KG_HIGH_SIM_EMBEDDING)];
    const existing = [
      {
        ...makeNode('Alice Smith', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-1'),
      },
      {
        ...makeNode('Alice Jones', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-2'),
      },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entityResolutions: [{ id: 0, name: 'Alice', duplicateCandidateId: -1 }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(result.idMap.has(extracted[0].id)).toBe(false);
    expect(result.resolvedNodes).toContainEqual(
      expect.objectContaining({ id: extracted[0].id }),
    );
    expect(result.duplicatePairs).toHaveLength(0);
  });

  it('should map id when LLM returns duplicate_name matching an existing node', async () => {
    const extracted = [makeNode('Alice', KG_HIGH_SIM_EMBEDDING)];
    const existing = [
      {
        ...makeNode('Alice Smith', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-1'),
      },
      {
        ...makeNode('Alice Jones', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-2'),
      },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entityResolutions: [{ id: 0, name: 'Alice', duplicateCandidateId: 0 }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(result.idMap.get(extracted[0].id)).toBe('exist-1');
  });

  it('should apply canonical name from LLM when different from extracted name', async () => {
    const extracted = [makeNode('alice', KG_HIGH_SIM_EMBEDDING)];
    const existing = [
      {
        ...makeNode('Alice Smith', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-1'),
      },
      {
        ...makeNode('Alice Jones', KG_NEAR_SAME_EMBEDDING),
        id: u('exist-2'),
      },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entityResolutions: [{ id: 0, name: 'Alice', duplicateCandidateId: -1 }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(result.resolvedNodes[0].name).toBe('Alice');
  });

  it('should bypass cosine for low-entropy names and go to LLM', async () => {
    // "bob" entropy ≈ 0.918 (b:2, o:1) - below the 1.5 threshold → skips cosine
    const extracted = [makeNode('bob', KG_HIGH_SIM_EMBEDDING)];
    const existing = [
      {
        ...makeNode('Bobby', KG_DIFF_EMBEDDING),
        id: u('bob-exist'),
      },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entityResolutions: [{ id: 0, name: 'bob', duplicateCandidateId: 0 }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
    expect(result.idMap.get(extracted[0].id)).toBe('bob-exist');
  });

  it('should use cosine for names with entropy above threshold (e.g. "alice")', async () => {
    // "alice" entropy ≈ 2.32 (a,l,i,c,e - all distinct) - above the 1.5 threshold → cosine path.
    // Existing node "alicia" does not exact-match "alice" after normalizeString, so the
    // cosine scan runs. With KG_DIFF_EMBEDDING the cosine score is below threshold, so
    // no candidate is found and alice is added as a new node without any LLM call.
    // Under the old threshold of 3.0 this name would have bypassed cosine and called the LLM.
    const extracted = [makeNode('alice', KG_HIGH_SIM_EMBEDDING)];
    const existing = [
      {
        ...makeNode('alicia', KG_DIFF_EMBEDDING),
        id: u('alicia-exist'),
      },
    ];

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    // No LLM call: cosine found no candidates above threshold → alice is a new node.
    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.resolvedNodes).toHaveLength(1);
    expect(result.resolvedNodes[0].name).toBe('alice');
  });

  it('should return all as new nodes with empty idMap when no existing nodes', async () => {
    const extracted = [
      makeNode('Alice', KG_HIGH_SIM_EMBEDDING),
      makeNode('Bob', KG_HIGH_SIM_EMBEDDING),
    ];

    const result = await service.resolveNodes(mockModel, baseEpisode, extracted, []);

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.resolvedNodes).toHaveLength(2);
    expect(result.idMap.size).toBe(0);
    expect(result.duplicatePairs).toHaveLength(0);
  });
});
