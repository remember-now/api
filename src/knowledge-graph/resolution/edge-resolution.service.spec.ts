import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Test, TestingModule } from '@nestjs/testing';

import { Uuid } from '@/common/schemas';
import {
  KG_HIGH_SIM_EMBEDDING,
  KG_NEAR_SAME_EMBEDDING,
  KG_REFERENCE_TIME,
  KG_TEST_GROUP_ID,
  KgEdgeFactory,
  KgNodeFactory,
} from '@/test/factories';

import { EntityEdge } from '../models';
import { EntityEdgeRepository } from '../neo4j/repositories';
import { EdgeResolutionService } from './edge-resolution.service';

const u = (s: string) => s as Uuid;

// Stable test UUIDs so intra-batch dedup and endpoint matching reliably fire
// across edges constructed by `makeEdge` without explicit overrides.
const DEFAULT_SRC = u('src-uuid');
const DEFAULT_TGT = u('tgt-uuid');

const baseEpisode = KgNodeFactory.createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice joined Acme Corp as CEO.',
  groupId: KG_TEST_GROUP_ID,
});

function makeEdge(
  overrides: { name: string; fact: string } & Omit<Partial<EntityEdge>, 'name'>,
): EntityEdge {
  return KgEdgeFactory.createEntityEdge({
    sourceNodeUuid: DEFAULT_SRC,
    targetNodeUuid: DEFAULT_TGT,
    ...overrides,
  });
}

describe('EdgeResolutionService', () => {
  let service: EdgeResolutionService;
  let mockModel: DeepMocked<BaseChatModel>;
  let mockRunnable: { invoke: jest.Mock };
  let mockEdgeRepo: DeepMocked<EntityEdgeRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EdgeResolutionService],
    })
      .useMocker(createMock)
      .compile();

    service = module.get(EdgeResolutionService);
    mockEdgeRepo = module.get(EntityEdgeRepository);

    mockEdgeRepo.searchByFact.mockResolvedValue([]);

    mockModel = createMock<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  it('should collapse intra-batch exact duplicate to 1 edge', async () => {
    const edge1 = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
      episodes: [u('ep-1')],
    });
    const edge2 = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme', // same fact
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
      episodes: [u('ep-2')],
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge1, edge2],
      [],
      new Map(),
      KG_REFERENCE_TIME,
    );

    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.resolvedEdges[0].episodes).toContain(u('ep-1'));
    expect(result.resolvedEdges[0].episodes).toContain(u('ep-2'));
  });

  it('should remap source/target uuids via uuidMap', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
      sourceNodeUuid: u('old-src-uuid'),
      targetNodeUuid: u('old-tgt-uuid'),
    });

    const uuidMap = new Map<Uuid, Uuid>([
      [u('old-src-uuid'), u('new-src-uuid')],
      [u('old-tgt-uuid'), u('new-tgt-uuid')],
    ]);

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      uuidMap,
      KG_REFERENCE_TIME,
    );

    expect(result.resolvedEdges[0].sourceNodeUuid).toBe('new-src-uuid');
    expect(result.resolvedEdges[0].targetNodeUuid).toBe('new-tgt-uuid');
  });

  it('should add edge to resolvedEdges when no candidates exist', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      new Map(),
      KG_REFERENCE_TIME,
    );

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.resolvedEdges).toHaveLength(1);
  });

  it('should drop edge from resolvedEdges when LLM returns it as duplicate (idx in endpoint range)', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
    });
    const existingEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme Corp',
      factEmbedding: KG_NEAR_SAME_EMBEDDING,
    });
    existingEdge.uuid = u('exist-edge-uuid');

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
      KG_REFERENCE_TIME,
    );

    // The existing edge is returned in resolvedEdges with the episode UUID appended
    // so it can be re-persisted with the updated episodes array.
    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.resolvedEdges[0].uuid).toBe('exist-edge-uuid');
    expect(result.resolvedEdges[0].episodes).toContain(baseEpisode.uuid);
    expect(result.invalidatedEdges).toHaveLength(0);
  });

  it('should not invalidate contradicted edges when both lack validAt (no temporal overlap computable)', async () => {
    // Python resolve_edge_contradictions skips invalidation when validAt is null on
    // either side — temporal guards require both dates to be present.
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is now CEO at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
    });
    const existingEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice was an engineer at Acme',
      factEmbedding: KG_NEAR_SAME_EMBEDDING,
    });
    existingEdge.uuid = u('old-edge-uuid');

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
      KG_REFERENCE_TIME,
    );

    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.invalidatedEdges).toHaveLength(0);
  });

  it('should invalidate contradicted edge when new edge has later validAt', async () => {
    // B1: existing edge predates new edge → invalidate with new edge's validAt
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is now CEO at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
      validAt: new Date('2024-06-01'),
    });
    const existingEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice was an engineer at Acme',
      factEmbedding: KG_NEAR_SAME_EMBEDDING,
      validAt: new Date('2023-01-01'),
    });
    existingEdge.uuid = u('old-edge-uuid');

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
      KG_REFERENCE_TIME,
    );

    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.invalidatedEdges).toHaveLength(1);
    expect(result.invalidatedEdges[0].uuid).toBe('old-edge-uuid');
    expect(result.invalidatedEdges[0].invalidAt).toEqual(new Date('2024-06-01'));
    expect(result.invalidatedEdges[0].expiredAt).toBeInstanceOf(Date);
  });

  it('should not treat edge as duplicate when duplicate_facts index is in similar range only', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
    });
    const endpointEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is employed at Acme Corp',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
      sourceNodeUuid: u('src-uuid'),
      targetNodeUuid: u('tgt-uuid'),
    });
    endpointEdge.uuid = u('endpoint-uuid');
    const similarEdge = makeEdge({
      name: 'EMPLOYED_AT',
      fact: 'Alice has a job at Acme',
      factEmbedding: KG_NEAR_SAME_EMBEDDING,
      sourceNodeUuid: u('other-src'),
      targetNodeUuid: u('other-tgt'),
    });
    similarEdge.uuid = u('similar-uuid');

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
      KG_REFERENCE_TIME,
    );

    // Similar range idx in duplicate_facts does NOT mark as duplicate
    expect(result.resolvedEdges).toHaveLength(1);
  });

  it('should set factEmbedding on resolved edges', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      new Map(),
      KG_REFERENCE_TIME,
    );

    expect(result.resolvedEdges[0].factEmbedding).toEqual(KG_HIGH_SIM_EMBEDDING);
  });

  it('should include keyword-only edge in similar candidates when no factEmbedding', async () => {
    const edge = makeEdge({ name: 'WORKS_AT', fact: 'Alice works at Acme' });
    // edge has no factEmbedding → cosine path skipped, but keyword path should find this
    const keywordEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is employed at Acme',
      factEmbedding: null,
      sourceNodeUuid: u('other-src'),
      targetNodeUuid: u('other-tgt'),
    });
    keywordEdge.uuid = u('keyword-uuid');

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
      KG_REFERENCE_TIME,
    );

    // LLM should have been called with the keyword edge as a candidate
    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
  });

  it('should not include keyword result that is already an endpoint edge', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: KG_HIGH_SIM_EMBEDDING,
    });
    const endpointEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is at Acme',
      factEmbedding: null,
    });
    endpointEdge.uuid = u('endpoint-uuid');

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
      KG_REFERENCE_TIME,
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
  });
});
