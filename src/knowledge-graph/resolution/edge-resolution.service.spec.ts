import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

import { createEntityEdge, EntityEdge } from '../models/edges';
import { createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { EntityEdgeRepository } from '../neo4j/repositories';
import { EdgeResolutionService } from './edge-resolution.service';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice joined Acme Corp as CEO.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

const referenceTime = new Date('2024-01-01T12:00:00Z');
const HIGH_SIM = [1, 0, 0];
const NEAR_HIGH_SIM = [0.9999, 0.001, 0];

function makeEdge(
  overrides: Partial<EntityEdge> & { name: string },
): EntityEdge {
  return createEntityEdge({
    sourceNodeUuid: 'src-uuid',
    targetNodeUuid: 'tgt-uuid',
    groupId: 'group-1',
    ...overrides,
  });
}

describe('EdgeResolutionService', () => {
  let service: EdgeResolutionService;
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };
  let mockEdgeRepo: DeepMockProxy<EntityEdgeRepository>;

  beforeEach(() => {
    mockEdgeRepo = mockDeep<EntityEdgeRepository>();
    mockEdgeRepo.searchByFact.mockResolvedValue([]);
    service = new EdgeResolutionService(mockEdgeRepo);
    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  it('should collapse intra-batch exact duplicate to 1 edge', async () => {
    const edge1 = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
      episodes: ['ep-1'],
    });
    const edge2 = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme', // same fact
      factEmbedding: HIGH_SIM,
      episodes: ['ep-2'],
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge1, edge2],
      [],
      new Map(),
      referenceTime,
    );

    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.resolvedEdges[0].episodes).toContain('ep-1');
    expect(result.resolvedEdges[0].episodes).toContain('ep-2');
  });

  it('should remap source/target uuids via uuidMap', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
      sourceNodeUuid: 'old-src-uuid',
      targetNodeUuid: 'old-tgt-uuid',
    });

    const uuidMap = new Map([
      ['old-src-uuid', 'new-src-uuid'],
      ['old-tgt-uuid', 'new-tgt-uuid'],
    ]);

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      uuidMap,
      referenceTime,
    );

    expect(result.resolvedEdges[0].sourceNodeUuid).toBe('new-src-uuid');
    expect(result.resolvedEdges[0].targetNodeUuid).toBe('new-tgt-uuid');
  });

  it('should add edge to resolvedEdges when no candidates exist', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      new Map(),
      referenceTime,
    );

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.resolvedEdges).toHaveLength(1);
  });

  it('should drop edge from resolvedEdges when LLM returns it as duplicate (idx in endpoint range)', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
    });
    const existingEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme Corp',
      factEmbedding: NEAR_HIGH_SIM,
    });
    existingEdge.uuid = 'exist-edge-uuid';

    // idx 0 is in endpoint range (1 endpoint edge)
    mockRunnable.invoke.mockResolvedValue({
      duplicate_facts: [0],
      contradicted_facts: [],
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [existingEdge],
      new Map(),
      referenceTime,
    );

    // The existing edge is returned in resolvedEdges with the episode UUID appended
    // so it can be re-persisted with the updated episodes array.
    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.resolvedEdges[0].uuid).toBe('exist-edge-uuid');
    expect(result.resolvedEdges[0].episodes).toContain(baseEpisode.uuid);
    expect(result.invalidatedEdges).toHaveLength(0);
  });

  it('should add existing edge to invalidatedEdges with invalidAt and expiredAt set when LLM returns contradiction', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is now CEO at Acme',
      factEmbedding: HIGH_SIM,
    });
    const existingEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice was an engineer at Acme',
      factEmbedding: NEAR_HIGH_SIM,
    });
    existingEdge.uuid = 'old-edge-uuid';

    // idx 0 is the endpoint edge
    mockRunnable.invoke.mockResolvedValue({
      duplicate_facts: [],
      contradicted_facts: [0],
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [existingEdge],
      new Map(),
      referenceTime,
    );

    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.invalidatedEdges).toHaveLength(1);
    expect(result.invalidatedEdges[0].uuid).toBe('old-edge-uuid');
    expect(result.invalidatedEdges[0].invalidAt).toEqual(referenceTime);
    expect(result.invalidatedEdges[0].expiredAt).toBeInstanceOf(Date);
  });

  it('should not treat edge as duplicate when duplicate_facts index is in similar range only', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
    });
    const endpointEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is employed at Acme Corp',
      factEmbedding: HIGH_SIM,
      sourceNodeUuid: 'src-uuid',
      targetNodeUuid: 'tgt-uuid',
    });
    endpointEdge.uuid = 'endpoint-uuid';
    const similarEdge = makeEdge({
      name: 'EMPLOYED_AT',
      fact: 'Alice has a job at Acme',
      factEmbedding: NEAR_HIGH_SIM,
      sourceNodeUuid: 'other-src',
      targetNodeUuid: 'other-tgt',
    });
    similarEdge.uuid = 'similar-uuid';

    // idx 0 = endpoint edge, idx 1 = similar edge
    // duplicate_facts = [1] (similar range idx) → should NOT trigger isDuplicate
    mockRunnable.invoke.mockResolvedValue({
      duplicate_facts: [1],
      contradicted_facts: [],
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [endpointEdge, similarEdge],
      new Map(),
      referenceTime,
    );

    // Similar range idx in duplicate_facts does NOT mark as duplicate
    expect(result.resolvedEdges).toHaveLength(1);
  });

  it('should set factEmbedding on resolved edges', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      new Map(),
      referenceTime,
    );

    expect(result.resolvedEdges[0].factEmbedding).toEqual(HIGH_SIM);
  });

  it('should include keyword-only edge in similar candidates when no factEmbedding', async () => {
    const edge = makeEdge({ name: 'WORKS_AT', fact: 'Alice works at Acme' });
    // edge has no factEmbedding → cosine path skipped, but keyword path should find this
    const keywordEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is employed at Acme',
      factEmbedding: null,
      sourceNodeUuid: 'other-src',
      targetNodeUuid: 'other-tgt',
    });
    keywordEdge.uuid = 'keyword-uuid';

    mockEdgeRepo.searchByFact.mockResolvedValue([keywordEdge]);
    mockRunnable.invoke.mockResolvedValue({
      duplicate_facts: [],
      contradicted_facts: [],
    });

    await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      new Map(),
      referenceTime,
    );

    // LLM should have been called with the keyword edge as a candidate
    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
  });

  it('should not include keyword result that is already an endpoint edge', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
    });
    const endpointEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is at Acme',
      factEmbedding: null,
    });
    endpointEdge.uuid = 'endpoint-uuid';

    // keyword search returns the endpoint edge — should be excluded from similarEdges
    mockEdgeRepo.searchByFact.mockResolvedValue([endpointEdge]);
    mockRunnable.invoke.mockResolvedValue({
      duplicate_facts: [],
      contradicted_facts: [],
    });

    // existingEdges contains the endpoint edge (same src/tgt as `edge`)
    await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [endpointEdge],
      new Map(),
      referenceTime,
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
  });
});
