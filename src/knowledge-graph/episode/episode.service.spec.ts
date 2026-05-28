import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Test, TestingModule } from '@nestjs/testing';

import { UuidSchema } from '@/common/schemas';
import { LlmService } from '@/llm/llm.service';
import { LLM_TRACER, NoOpLlmTracer } from '@/observability';
import {
  KG_REFERENCE_TIME,
  KG_TEST_GRAPH_ID,
  KG_TEST_SAGA_ID,
  KG_TEST_USER_ID,
  KgEdgeFactory,
  KgNodeFactory,
  makeEpisode,
  u,
} from '@/test/factories';

import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  HasEpisodeEdgeRepository,
  SagaNodeRepository,
} from '../repository/repositories';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import { EpisodeService } from './episode.service';

describe('EpisodeService', () => {
  let service: EpisodeService;

  let mockLlmService: DeepMocked<LlmService>;
  let mockCommunityService: DeepMocked<CommunityService>;
  let mockEmbeddingService: DeepMocked<EmbeddingService>;
  let mockNodeExtraction: DeepMocked<NodeExtractionService>;
  let mockEdgeExtraction: DeepMocked<EdgeExtractionService>;
  let mockNodeResolution: DeepMocked<NodeResolutionService>;
  let mockEdgeResolution: DeepMocked<EdgeResolutionService>;
  let mockEntityNodeRepo: DeepMocked<EntityNodeRepository>;
  let mockEntityEdgeRepo: DeepMocked<EntityEdgeRepository>;
  let mockEpisodicNodeRepo: DeepMocked<EpisodicNodeRepository>;
  let mockEpisodicEdgeRepo: DeepMocked<EpisodicEdgeRepository>;
  let mockSagaNodeRepo: DeepMocked<SagaNodeRepository>;
  let mockHasEpisodeEdgeRepo: DeepMocked<HasEpisodeEdgeRepository>;

  let mockModel: DeepMocked<BaseChatModel>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EpisodeService, { provide: LLM_TRACER, useValue: new NoOpLlmTracer() }],
    })
      .useMocker(createMock)
      .compile();

    service = module.get(EpisodeService);
    mockLlmService = module.get(LlmService);
    mockCommunityService = module.get(CommunityService);
    mockEmbeddingService = module.get(EmbeddingService);
    mockNodeExtraction = module.get(NodeExtractionService);
    mockEdgeExtraction = module.get(EdgeExtractionService);
    mockNodeResolution = module.get(NodeResolutionService);
    mockEdgeResolution = module.get(EdgeResolutionService);
    mockEntityNodeRepo = module.get(EntityNodeRepository);
    mockEntityEdgeRepo = module.get(EntityEdgeRepository);
    mockEpisodicNodeRepo = module.get(EpisodicNodeRepository);
    mockEpisodicEdgeRepo = module.get(EpisodicEdgeRepository);
    mockSagaNodeRepo = module.get(SagaNodeRepository);
    mockHasEpisodeEdgeRepo = module.get(HasEpisodeEdgeRepository);

    mockModel = createMock<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);

    // Default mock implementations
    mockLlmService.getActiveModel.mockResolvedValue(mockModel);
    mockEpisodicNodeRepo.retrieveEpisodes.mockResolvedValue([]);
    mockEpisodicNodeRepo.saveBulk.mockResolvedValue(undefined);
    mockNodeExtraction.extractNodes.mockResolvedValue([]);
    mockNodeExtraction.fillEntityAttributes.mockResolvedValue(undefined);
    mockNodeExtraction.summarizeNodes.mockResolvedValue(undefined);
    mockNodeResolution.collectCandidates.mockResolvedValue([]);
    mockNodeResolution.resolveNodes.mockResolvedValue({
      resolvedNodes: [],
      idMap: new Map(),
      duplicatePairs: [],
    });
    mockNodeResolution.dedupeAcrossBatch.mockReturnValue([]);
    mockEmbeddingService.embedNodes.mockResolvedValue([]);
    mockEdgeExtraction.extractEdges.mockResolvedValue([]);
    mockEdgeExtraction.fillEdgeAttributes.mockResolvedValue(undefined);
    mockEdgeExtraction.extractEdgeTimestampsFallback.mockResolvedValue(undefined);
    mockEdgeResolution.collectCandidates.mockResolvedValue([]);
    mockEmbeddingService.embedEdges.mockResolvedValue([]);
    mockEdgeResolution.resolveEdges.mockResolvedValue({
      resolvedEdges: [],
      invalidatedEdges: [],
      newEdges: [],
    });
    // Default passthrough so per-episode edge arrays flow through unchanged
    // to `resolveEdges`. Tests asserting cross-batch dedup behavior override this.
    mockEdgeResolution.dedupeAcrossBatch.mockImplementation((_m, edges) =>
      Promise.resolve(edges),
    );
    mockEpisodicEdgeRepo.saveBulk.mockResolvedValue(undefined);
    mockEntityNodeRepo.saveBulk.mockResolvedValue(undefined);
    mockEntityEdgeRepo.saveBulk.mockResolvedValue(undefined);
    mockCommunityService.buildCommunities.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Pipeline orchestration: per-step behavior for a single-episode batch ───

  describe('addEpisodes - pipeline orchestration', () => {
    it('saves episodic nodes via saveBulk before extraction', async () => {
      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      const saveOrder = mockEpisodicNodeRepo.saveBulk.mock.invocationCallOrder[0];
      const extractOrder = mockNodeExtraction.extractNodes.mock.invocationCallOrder[0];
      expect(saveOrder).toBeLessThan(extractOrder);
    });

    it('passes per-episode previous-episodes context to extractNodes', async () => {
      const prevEpisode = KgNodeFactory.createEpisodicNode({
        name: 'Prior',
        content: 'Alice works at Acme Corp.',
        validAt: KG_REFERENCE_TIME,
        graphId: KG_TEST_GRAPH_ID,
      });
      mockEpisodicNodeRepo.retrieveEpisodes.mockResolvedValue([prevEpisode]);

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockNodeExtraction.extractNodes).toHaveBeenCalledWith(
        mockModel,
        expect.objectContaining({ name: 'ep1', graphId: KG_TEST_GRAPH_ID }),
        [prevEpisode],
        undefined,
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it('embeds extracted nodes in a single batched call', async () => {
      const nodeA = KgNodeFactory.createEntityNode({ name: 'Alice' });
      const nodeB = KgNodeFactory.createEntityNode({ name: 'Bob' });
      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([nodeA])
        .mockResolvedValueOnce([nodeB]);

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      expect(mockEmbeddingService.embedNodes).toHaveBeenCalledTimes(1);
      expect(mockEmbeddingService.embedNodes).toHaveBeenCalledWith([nodeA, nodeB]);
    });

    it('calls resolveNodes with embedded nodes and search-based candidates', async () => {
      const extracted = KgNodeFactory.createEntityNode({ name: 'Alice' });
      const existing = KgNodeFactory.createEntityNode({ name: 'Bob' });
      const embedded = { ...extracted, nameEmbedding: [1, 0, 0] };

      mockNodeExtraction.extractNodes.mockResolvedValue([extracted]);
      mockEmbeddingService.embedNodes.mockResolvedValue([embedded]);
      mockNodeResolution.collectCandidates.mockResolvedValue([existing]);

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockNodeResolution.resolveNodes).toHaveBeenCalledWith(
        mockModel,
        expect.anything(),
        [embedded],
        [existing],
        [],
        undefined,
        expect.anything(),
      );
    });

    it('extracts edges with canonical nodes (resolved + matched existing)', async () => {
      const resolved = KgNodeFactory.createEntityNode({ name: 'Alice' });
      const existing = {
        ...KgNodeFactory.createEntityNode({ name: 'Bob' }),
        id: u('existing-bob-id'),
      };
      const alias = KgNodeFactory.createEntityNode({ name: 'Robert' });

      mockNodeExtraction.extractNodes.mockResolvedValue([resolved, alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([
        { ...resolved, nameEmbedding: null },
        { ...alias, nameEmbedding: null },
      ]);
      mockNodeResolution.collectCandidates.mockResolvedValue([existing]);
      mockNodeResolution.resolveNodes.mockResolvedValue({
        resolvedNodes: [resolved],
        idMap: new Map([[alias.id, existing.id]]),
        duplicatePairs: [{ extractedId: alias.id, canonicalId: existing.id }],
      });

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockEdgeExtraction.extractEdges).toHaveBeenCalledWith(
        mockModel,
        expect.anything(),
        expect.arrayContaining([resolved, existing]),
        [],
        KG_REFERENCE_TIME,
        undefined,
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it('embeds extracted edges in a single batched call', async () => {
      const edgeA = KgEdgeFactory.createEntityEdge({
        name: 'WORKS_AT',
        sourceNodeId: u('s1'),
        targetNodeId: u('t1'),
        fact: 'fact 1',
      });
      const edgeB = KgEdgeFactory.createEntityEdge({
        name: 'KNOWS',
        sourceNodeId: u('s2'),
        targetNodeId: u('t2'),
        fact: 'fact 2',
      });
      mockEdgeExtraction.extractEdges
        .mockResolvedValueOnce([edgeA])
        .mockResolvedValueOnce([edgeB]);

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      expect(mockEmbeddingService.embedEdges).toHaveBeenCalledTimes(1);
      expect(mockEmbeddingService.embedEdges).toHaveBeenCalledWith([edgeA, edgeB]);
    });

    it('calls resolveEdges with embedded edges, candidates, and finalIdMap', async () => {
      const edge = KgEdgeFactory.createEntityEdge({
        name: 'WORKS_AT',
        sourceNodeId: u('src'),
        targetNodeId: u('tgt'),
        fact: 'Alice works at Acme Corp',
      });
      const embeddedEdge = { ...edge, factEmbedding: [1, 0, 0] };
      const existingEdge = KgEdgeFactory.createEntityEdge({
        name: 'WORKS_AT',
        sourceNodeId: u('src2'),
        targetNodeId: u('tgt2'),
        fact: 'Alice works at Acme Corp',
      });

      mockEdgeExtraction.extractEdges.mockResolvedValue([edge]);
      mockEmbeddingService.embedEdges.mockResolvedValue([embeddedEdge]);
      mockEdgeResolution.collectCandidates.mockResolvedValue([existingEdge]);

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockEdgeResolution.resolveEdges).toHaveBeenCalledWith(
        mockModel,
        expect.anything(),
        [embeddedEdge],
        [existingEdge],
        expect.any(Map), // finalIdMap
        KG_REFERENCE_TIME,
        [],
        undefined,
        expect.anything(),
      );
    });

    it('returns one result entry per input episode', async () => {
      const result = await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2'), makeEpisode('ep3')],
      });

      expect(result).toHaveLength(3);
      result.forEach((entry, i) => {
        expect(entry.episode.name).toBe(`ep${i + 1}`);
        expect(entry.nodes).toBeInstanceOf(Array);
        expect(entry.edges).toBeInstanceOf(Array);
        expect(entry.invalidatedEdges).toBeInstanceOf(Array);
        expect(entry.episodicEdges).toBeInstanceOf(Array);
      });
    });

    it('builds one episodic edge per canonical node referenced by each episode', async () => {
      const resolved = KgNodeFactory.createEntityNode({ name: 'Alice' });
      const existing = {
        ...KgNodeFactory.createEntityNode({ name: 'Bob' }),
        id: u('bob-id'),
      };

      mockNodeExtraction.extractNodes.mockResolvedValue([resolved]);
      mockEmbeddingService.embedNodes.mockResolvedValue([
        { ...resolved, nameEmbedding: null },
      ]);
      mockNodeResolution.collectCandidates.mockResolvedValue([existing]);
      mockNodeResolution.resolveNodes.mockResolvedValue({
        resolvedNodes: [resolved],
        idMap: new Map([[u('some-id'), existing.id]]),
        duplicatePairs: [{ extractedId: u('some-id'), canonicalId: existing.id }],
      });

      const [entry] = await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(entry.episodicEdges).toHaveLength(2);
      expect(entry.episodicEdges.map((e) => e.targetNodeId)).toEqual(
        expect.arrayContaining([resolved.id, existing.id]),
      );
    });
  });

  // ─── Pass-1: resolve nodes against the live graph ──────────────────────────

  describe('addEpisodes - pass-1 dedup (vs live graph)', () => {
    it('alias node is excluded from result entries when resolveNodes returns a duplicate pair', async () => {
      const canonical = KgNodeFactory.createEntityNode({
        name: 'Alice',
        graphId: KG_TEST_GRAPH_ID,
      });
      const alias = KgNodeFactory.createEntityNode({
        name: 'Alice Smith',
        graphId: KG_TEST_GRAPH_ID,
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([canonical])
        .mockResolvedValueOnce([alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([canonical, alias]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [canonical],
          idMap: new Map([[canonical.id, canonical.id]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [],
          duplicatePairs: [{ extractedId: alias.id, canonicalId: canonical.id }],
          idMap: new Map([[alias.id, canonical.id]]),
        });

      const result = await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      expect(allNodes.find((n) => n.id === alias.id)).toBeUndefined();
      expect(allNodes.find((n) => n.id === canonical.id)).toBeDefined();
    });

    it('existing node referenced as canonical target is pulled into the matching episode entry', async () => {
      const existingCanonical = KgNodeFactory.createEntityNode({
        name: 'Alice',
        graphId: KG_TEST_GRAPH_ID,
      });
      const alias = KgNodeFactory.createEntityNode({
        name: 'Alice Smith',
        graphId: KG_TEST_GRAPH_ID,
      });

      mockNodeResolution.collectCandidates.mockResolvedValue([existingCanonical]);
      mockNodeExtraction.extractNodes.mockResolvedValue([alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([alias]);
      mockNodeResolution.resolveNodes.mockResolvedValue({
        resolvedNodes: [],
        duplicatePairs: [{ extractedId: alias.id, canonicalId: existingCanonical.id }],
        idMap: new Map([[alias.id, existingCanonical.id]]),
      });

      const [entry] = await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(entry.nodes.find((n) => n.id === existingCanonical.id)).toBeDefined();
      expect(entry.nodes.find((n) => n.id === alias.id)).toBeUndefined();
    });

    it('canonical extracted by two episodes is saved exactly once via saveBulk', async () => {
      const canonical = KgNodeFactory.createEntityNode({
        name: 'Alice',
        graphId: KG_TEST_GRAPH_ID,
      });
      const alias = KgNodeFactory.createEntityNode({
        name: 'Alice Smith',
        graphId: KG_TEST_GRAPH_ID,
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([canonical])
        .mockResolvedValueOnce([alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([canonical, alias]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [canonical],
          idMap: new Map([[canonical.id, canonical.id]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [canonical],
          duplicatePairs: [{ extractedId: alias.id, canonicalId: canonical.id }],
          idMap: new Map([[alias.id, canonical.id]]),
        });

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const savedNodes = mockEntityNodeRepo.saveBulk.mock.calls[0]?.[0];
      expect(savedNodes.filter((n) => n.id === canonical.id)).toHaveLength(1);
    });
  });

  // ─── Pass-2: within-batch dedup is delegated to NodeResolutionService ──────
  // Logic-level unit tests for the dedup itself live in
  // node-resolution.service.spec.ts ('dedupeAcrossBatch'). The orchestration
  // test below verifies that pairs returned by the service participate in the
  // final canonical projection.

  describe('addEpisodes - pass-2 dedup (orchestration)', () => {
    it('pairs returned by dedupeAcrossBatch are folded into finalIdMap, collapsing the alias', async () => {
      const canonical = KgNodeFactory.createEntityNode({
        name: 'Alice',
        graphId: KG_TEST_GRAPH_ID,
      });
      const alias = KgNodeFactory.createEntityNode({
        name: 'Alicia',
        graphId: KG_TEST_GRAPH_ID,
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([canonical])
        .mockResolvedValueOnce([alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([canonical, alias]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [canonical],
          idMap: new Map([[canonical.id, canonical.id]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [alias],
          idMap: new Map([[alias.id, alias.id]]),
          duplicatePairs: [],
        });
      mockNodeResolution.dedupeAcrossBatch.mockReturnValue([[alias.id, canonical.id]]);

      const result = await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      expect(allNodes.find((n) => n.id === canonical.id)).toBeDefined();
      expect(allNodes.find((n) => n.id === alias.id)).toBeUndefined();
    });
  });

  // ─── Saga handling per episode (sagaId) ─────────────────────────────────

  describe('addEpisodes - saga handling', () => {
    it('creates SagaNode and HasEpisodeEdge when sagaId is provided', async () => {
      const ep = makeEpisode('ep1');
      ep.sagaId = KG_TEST_SAGA_ID;

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [ep],
      });

      expect(mockSagaNodeRepo.createIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({
          id: KG_TEST_SAGA_ID,
          graphId: KG_TEST_GRAPH_ID,
        }),
      );
      expect(mockHasEpisodeEdgeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceNodeId: KG_TEST_SAGA_ID,
          graphId: KG_TEST_GRAPH_ID,
        }),
      );
    });

    it('skips saga handling when sagaId is omitted', async () => {
      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockSagaNodeRepo.createIfNotExists).not.toHaveBeenCalled();
      expect(mockSagaNodeRepo.save).not.toHaveBeenCalled();
      expect(mockHasEpisodeEdgeRepo.save).not.toHaveBeenCalled();
    });

    it('processes saga linking for each episode in the batch that has a sagaId', async () => {
      const ep1 = makeEpisode('ep1');
      ep1.sagaId = KG_TEST_SAGA_ID;
      const ep2 = makeEpisode('ep2'); // no saga
      const ep3 = makeEpisode('ep3');
      ep3.sagaId = KG_TEST_SAGA_ID;

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [ep1, ep2, ep3],
      });

      // SagaNode createIfNotExists is called once per unique saga (grouped),
      // HAS_EPISODE edges once per saga-bearing episode.
      expect(mockSagaNodeRepo.createIfNotExists).toHaveBeenCalledTimes(1);
      expect(mockHasEpisodeEdgeRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Community building ───────────────────────────────────────────────────

  describe('addEpisodes - community building', () => {
    it('does not call buildCommunities by default', async () => {
      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockCommunityService.buildCommunities).not.toHaveBeenCalled();
    });

    it('calls buildCommunities after persist when updateCommunities is true', async () => {
      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
        updateCommunities: true,
      });

      const persistOrder = mockEntityNodeRepo.saveBulk.mock.invocationCallOrder[0];
      const communityOrder =
        mockCommunityService.buildCommunities.mock.invocationCallOrder[0];
      expect(persistOrder).toBeLessThan(communityOrder);
      expect(mockCommunityService.buildCommunities).toHaveBeenCalledWith(
        KG_TEST_USER_ID,
        KG_TEST_GRAPH_ID,
      );
    });

    it('calls buildCommunities once per distinct graphId across the batch', async () => {
      const otherGraphId = UuidSchema.parse('00000000-0000-4000-8000-000000000002');
      const ep1 = makeEpisode('ep1');
      const ep2 = makeEpisode('ep2');
      const ep3 = { ...makeEpisode('ep3'), graphId: otherGraphId };

      await service.addTextEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [ep1, ep2, ep3],
        updateCommunities: true,
      });

      expect(mockCommunityService.buildCommunities).toHaveBeenCalledTimes(2);
      expect(mockCommunityService.buildCommunities).toHaveBeenCalledWith(
        KG_TEST_USER_ID,
        KG_TEST_GRAPH_ID,
      );
      expect(mockCommunityService.buildCommunities).toHaveBeenCalledWith(
        KG_TEST_USER_ID,
        otherGraphId,
      );
    });
  });
});
