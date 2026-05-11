import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Test, TestingModule } from '@nestjs/testing';

import { LlmService } from '@/llm/llm.service';
import {
  KG_REFERENCE_TIME,
  KG_TEST_GROUP_ID,
  KG_TEST_SAGA_UUID,
  KG_TEST_USER_ID,
  KgEdgeFactory,
  KgNodeFactory,
  makeEpisode,
} from '@/test/factories';

import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import {
  CombinedExtractionService,
  EdgeExtractionService,
  NodeExtractionService,
} from '../extraction';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  HasEpisodeEdgeRepository,
  NextEpisodeEdgeRepository,
  SagaNodeRepository,
} from '../neo4j/repositories';
import { GroupIdSchema, Uuid } from '../neo4j/types';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import { EpisodeService } from './episode.service';

const u = (s: string) => s as Uuid;

describe('EpisodeService', () => {
  let service: EpisodeService;

  let mockLlmService: DeepMocked<LlmService>;
  let mockCommunityService: DeepMocked<CommunityService>;
  let mockEmbeddingService: DeepMocked<EmbeddingService>;
  let mockNodeExtraction: DeepMocked<NodeExtractionService>;
  let mockEdgeExtraction: DeepMocked<EdgeExtractionService>;
  let mockCombinedExtraction: DeepMocked<CombinedExtractionService>;
  let mockNodeResolution: DeepMocked<NodeResolutionService>;
  let mockEdgeResolution: DeepMocked<EdgeResolutionService>;
  let mockEntityNodeRepo: DeepMocked<EntityNodeRepository>;
  let mockEntityEdgeRepo: DeepMocked<EntityEdgeRepository>;
  let mockEpisodicNodeRepo: DeepMocked<EpisodicNodeRepository>;
  let mockEpisodicEdgeRepo: DeepMocked<EpisodicEdgeRepository>;
  let mockSagaNodeRepo: DeepMocked<SagaNodeRepository>;
  let mockHasEpisodeEdgeRepo: DeepMocked<HasEpisodeEdgeRepository>;
  let mockNextEpisodeEdgeRepo: DeepMocked<NextEpisodeEdgeRepository>;

  let mockModel: DeepMocked<BaseChatModel>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EpisodeService],
    })
      .useMocker(createMock)
      .compile();

    service = module.get(EpisodeService);
    mockLlmService = module.get(LlmService);
    mockCommunityService = module.get(CommunityService);
    mockEmbeddingService = module.get(EmbeddingService);
    mockNodeExtraction = module.get(NodeExtractionService);
    mockEdgeExtraction = module.get(EdgeExtractionService);
    mockCombinedExtraction = module.get(CombinedExtractionService);
    mockNodeResolution = module.get(NodeResolutionService);
    mockEdgeResolution = module.get(EdgeResolutionService);
    mockEntityNodeRepo = module.get(EntityNodeRepository);
    mockEntityEdgeRepo = module.get(EntityEdgeRepository);
    mockEpisodicNodeRepo = module.get(EpisodicNodeRepository);
    mockEpisodicEdgeRepo = module.get(EpisodicEdgeRepository);
    mockSagaNodeRepo = module.get(SagaNodeRepository);
    mockHasEpisodeEdgeRepo = module.get(HasEpisodeEdgeRepository);
    mockNextEpisodeEdgeRepo = module.get(NextEpisodeEdgeRepository);

    mockModel = createMock<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);

    // Default mock implementations
    mockLlmService.getActiveModel.mockResolvedValue(mockModel);
    mockEpisodicNodeRepo.retrieveEpisodes.mockResolvedValue([]);
    mockEpisodicNodeRepo.saveBulk.mockResolvedValue(undefined);
    mockNodeExtraction.extractNodes.mockResolvedValue([]);
    mockEntityNodeRepo.searchByName.mockResolvedValue([]);
    mockEntityNodeRepo.searchBySimilarity.mockResolvedValue([]);
    mockEmbeddingService.embedNodes.mockResolvedValue([]);
    mockNodeResolution.resolveNodes.mockResolvedValue({
      resolvedNodes: [],
      uuidMap: new Map(),
      duplicatePairs: [],
    });
    mockEdgeExtraction.extractEdges.mockResolvedValue([]);
    mockEntityEdgeRepo.searchByFact.mockResolvedValue([]);
    mockEntityEdgeRepo.searchBySimilarity.mockResolvedValue([]);
    mockEmbeddingService.embedEdges.mockResolvedValue([]);
    mockEdgeResolution.resolveEdges.mockResolvedValue({
      resolvedEdges: [],
      invalidatedEdges: [],
    });
    mockEpisodicEdgeRepo.saveBulk.mockResolvedValue(undefined);
    mockEntityNodeRepo.saveBulk.mockResolvedValue(undefined);
    mockEntityEdgeRepo.saveBulk.mockResolvedValue(undefined);
    mockRunnable.invoke.mockResolvedValue({ summaries: [] });
    mockCommunityService.buildCommunities.mockResolvedValue(undefined);
    mockCombinedExtraction.extractNodesAndEdges.mockResolvedValue({
      nodes: [],
      edges: [],
      nodeEpisodeIndexMap: new Map(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Pipeline orchestration: per-step behavior for a single-episode batch ───

  describe('addEpisodes — pipeline orchestration', () => {
    it('saves episodic nodes via saveBulk before extraction', async () => {
      await service.addEpisodes({
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
        groupId: KG_TEST_GROUP_ID,
      });
      mockEpisodicNodeRepo.retrieveEpisodes.mockResolvedValue([prevEpisode]);

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockNodeExtraction.extractNodes).toHaveBeenCalledWith(
        mockModel,
        expect.objectContaining({ name: 'ep1', groupId: KG_TEST_GROUP_ID }),
        [prevEpisode],
        undefined,
        undefined,
        undefined,
      );
    });

    it('embeds extracted nodes in a single batched call', async () => {
      const nodeA = KgNodeFactory.createEntityNode({ name: 'Alice' });
      const nodeB = KgNodeFactory.createEntityNode({ name: 'Bob' });
      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([nodeA])
        .mockResolvedValueOnce([nodeB]);

      await service.addEpisodes({
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
      mockEntityNodeRepo.searchByName.mockResolvedValue([existing]);

      await service.addEpisodes({
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
      );
    });

    it('extracts edges with canonical nodes (resolved + matched existing)', async () => {
      const resolved = KgNodeFactory.createEntityNode({ name: 'Alice' });
      const existing = {
        ...KgNodeFactory.createEntityNode({ name: 'Bob' }),
        uuid: u('existing-bob-uuid'),
      };
      const alias = KgNodeFactory.createEntityNode({ name: 'Robert' });

      mockNodeExtraction.extractNodes.mockResolvedValue([resolved, alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([
        { ...resolved, nameEmbedding: null },
        { ...alias, nameEmbedding: null },
      ]);
      mockEntityNodeRepo.searchByName.mockResolvedValue([existing]);
      mockNodeResolution.resolveNodes.mockResolvedValue({
        resolvedNodes: [resolved],
        uuidMap: new Map([[alias.uuid, existing.uuid]]),
        duplicatePairs: [{ extractedUuid: alias.uuid, canonicalUuid: existing.uuid }],
      });

      await service.addEpisodes({
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
      );
    });

    it('embeds extracted edges in a single batched call', async () => {
      const edgeA = KgEdgeFactory.createEntityEdge({
        name: 'WORKS_AT',
        sourceNodeUuid: u('s1'),
        targetNodeUuid: u('t1'),
        fact: 'fact 1',
      });
      const edgeB = KgEdgeFactory.createEntityEdge({
        name: 'KNOWS',
        sourceNodeUuid: u('s2'),
        targetNodeUuid: u('t2'),
        fact: 'fact 2',
      });
      mockEdgeExtraction.extractEdges
        .mockResolvedValueOnce([edgeA])
        .mockResolvedValueOnce([edgeB]);

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      expect(mockEmbeddingService.embedEdges).toHaveBeenCalledTimes(1);
      expect(mockEmbeddingService.embedEdges).toHaveBeenCalledWith([edgeA, edgeB]);
    });

    it('calls resolveEdges with embedded edges, candidates, and finalUuidMap', async () => {
      const edge = KgEdgeFactory.createEntityEdge({
        name: 'WORKS_AT',
        sourceNodeUuid: u('src'),
        targetNodeUuid: u('tgt'),
        fact: 'Alice works at Acme Corp',
      });
      const embeddedEdge = { ...edge, factEmbedding: [1, 0, 0] };
      const existingEdge = KgEdgeFactory.createEntityEdge({
        name: 'WORKS_AT',
        sourceNodeUuid: u('src2'),
        targetNodeUuid: u('tgt2'),
        fact: 'Alice works at Acme Corp',
      });

      mockEdgeExtraction.extractEdges.mockResolvedValue([edge]);
      mockEmbeddingService.embedEdges.mockResolvedValue([embeddedEdge]);
      mockEntityEdgeRepo.searchByFact.mockResolvedValue([existingEdge]);

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockEdgeResolution.resolveEdges).toHaveBeenCalledWith(
        mockModel,
        expect.anything(),
        [embeddedEdge],
        [existingEdge],
        expect.any(Map), // finalUuidMap
        KG_REFERENCE_TIME,
        [],
        undefined,
      );
    });

    it('returns one result entry per input episode', async () => {
      const result = await service.addEpisodes({
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
        uuid: u('bob-uuid'),
      };

      mockNodeExtraction.extractNodes.mockResolvedValue([resolved]);
      mockEmbeddingService.embedNodes.mockResolvedValue([
        { ...resolved, nameEmbedding: null },
      ]);
      mockEntityNodeRepo.searchByName.mockResolvedValue([existing]);
      mockNodeResolution.resolveNodes.mockResolvedValue({
        resolvedNodes: [resolved],
        uuidMap: new Map([[u('some-uuid'), existing.uuid]]),
        duplicatePairs: [{ extractedUuid: u('some-uuid'), canonicalUuid: existing.uuid }],
      });

      const [entry] = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(entry.episodicEdges).toHaveLength(2);
      expect(entry.episodicEdges.map((e) => e.targetNodeUuid)).toEqual(
        expect.arrayContaining([resolved.uuid, existing.uuid]),
      );
    });
  });

  // ─── Pass-1: resolve nodes against the live graph ──────────────────────────

  describe('addEpisodes — pass-1 dedup (vs live graph)', () => {
    it('alias node is excluded from result entries when resolveNodes returns a duplicate pair', async () => {
      const canonical = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
      });
      const alias = KgNodeFactory.createEntityNode({
        name: 'Alice Smith',
        groupId: KG_TEST_GROUP_ID,
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([canonical])
        .mockResolvedValueOnce([alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([canonical, alias]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [canonical],
          uuidMap: new Map([[canonical.uuid, canonical.uuid]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [],
          duplicatePairs: [{ extractedUuid: alias.uuid, canonicalUuid: canonical.uuid }],
          uuidMap: new Map([[alias.uuid, canonical.uuid]]),
        });

      const result = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      expect(allNodes.find((n) => n.uuid === alias.uuid)).toBeUndefined();
      expect(allNodes.find((n) => n.uuid === canonical.uuid)).toBeDefined();
    });

    it('existing node referenced as canonical target is pulled into the matching episode entry', async () => {
      const existingCanonical = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
      });
      const alias = KgNodeFactory.createEntityNode({
        name: 'Alice Smith',
        groupId: KG_TEST_GROUP_ID,
      });

      mockEntityNodeRepo.searchByName.mockResolvedValue([existingCanonical]);
      mockNodeExtraction.extractNodes.mockResolvedValue([alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([alias]);
      mockNodeResolution.resolveNodes.mockResolvedValue({
        resolvedNodes: [],
        duplicatePairs: [
          { extractedUuid: alias.uuid, canonicalUuid: existingCanonical.uuid },
        ],
        uuidMap: new Map([[alias.uuid, existingCanonical.uuid]]),
      });

      const [entry] = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(entry.nodes.find((n) => n.uuid === existingCanonical.uuid)).toBeDefined();
      expect(entry.nodes.find((n) => n.uuid === alias.uuid)).toBeUndefined();
    });

    it('canonical extracted by two episodes is saved exactly once via saveBulk', async () => {
      const canonical = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
      });
      const alias = KgNodeFactory.createEntityNode({
        name: 'Alice Smith',
        groupId: KG_TEST_GROUP_ID,
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([canonical])
        .mockResolvedValueOnce([alias]);
      mockEmbeddingService.embedNodes.mockResolvedValue([canonical, alias]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [canonical],
          uuidMap: new Map([[canonical.uuid, canonical.uuid]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [canonical],
          duplicatePairs: [{ extractedUuid: alias.uuid, canonicalUuid: canonical.uuid }],
          uuidMap: new Map([[alias.uuid, canonical.uuid]]),
        });

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const savedNodes = mockEntityNodeRepo.saveBulk.mock.calls[0]?.[0];
      expect(savedNodes.filter((n) => n.uuid === canonical.uuid)).toHaveLength(1);
    });
  });

  // ─── Pass-2: within-batch exact-name + cosine similarity dedup ─────────────

  describe('addEpisodes — pass-2 dedup (within-batch)', () => {
    it('two nodes with identical embeddings → exactly one survives across the batch', async () => {
      const nodeA = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = KgNodeFactory.createEntityNode({
        name: 'Alicia',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0], // cosine([1,0],[1,0]) = 1.0 ≥ 0.9 threshold
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([nodeA])
        .mockResolvedValueOnce([nodeB]);
      mockEmbeddingService.embedNodes.mockResolvedValue([nodeA, nodeB]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [nodeA],
          uuidMap: new Map([[nodeA.uuid, nodeA.uuid]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [nodeB],
          uuidMap: new Map([[nodeB.uuid, nodeB.uuid]]),
          duplicatePairs: [],
        });

      const result = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      const hasA = allNodes.some((n) => n.uuid === nodeA.uuid);
      const hasB = allNodes.some((n) => n.uuid === nodeB.uuid);
      expect(hasA || hasB).toBe(true);
      expect(hasA && hasB).toBe(false);
    });

    it('two nodes with orthogonal embeddings → both kept (below threshold)', async () => {
      const nodeA = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = KgNodeFactory.createEntityNode({
        name: 'Bob',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [0, 1],
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([nodeA])
        .mockResolvedValueOnce([nodeB]);
      mockEmbeddingService.embedNodes.mockResolvedValue([nodeA, nodeB]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [nodeA],
          uuidMap: new Map([[nodeA.uuid, nodeA.uuid]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [nodeB],
          uuidMap: new Map([[nodeB.uuid, nodeB.uuid]]),
          duplicatePairs: [],
        });

      const result = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      expect(allNodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(allNodes.find((n) => n.uuid === nodeB.uuid)).toBeDefined();
    });

    it('identical names with null embeddings → deduplicated by exact match', async () => {
      const nodeA = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: null,
      });
      const nodeB = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: null,
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([nodeA])
        .mockResolvedValueOnce([nodeB]);
      mockEmbeddingService.embedNodes.mockResolvedValue([nodeA, nodeB]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [nodeA],
          uuidMap: new Map([[nodeA.uuid, nodeA.uuid]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [nodeB],
          uuidMap: new Map([[nodeB.uuid, nodeB.uuid]]),
          duplicatePairs: [],
        });

      const result = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      expect(allNodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(allNodes.find((n) => n.uuid === nodeB.uuid)).toBeUndefined();
    });

    it('null embedding + same name as an embedded node → deduplicated by exact match', async () => {
      const nodeA = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: null,
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([nodeA])
        .mockResolvedValueOnce([nodeB]);
      mockEmbeddingService.embedNodes.mockResolvedValue([nodeA, nodeB]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [nodeA],
          uuidMap: new Map([[nodeA.uuid, nodeA.uuid]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [nodeB],
          uuidMap: new Map([[nodeB.uuid, nodeB.uuid]]),
          duplicatePairs: [],
        });

      const result = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      expect(allNodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(allNodes.find((n) => n.uuid === nodeB.uuid)).toBeUndefined();
    });

    it('different names with null embeddings → both kept', async () => {
      const nodeA = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: null,
      });
      const nodeB = KgNodeFactory.createEntityNode({
        name: 'Bob',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: null,
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([nodeA])
        .mockResolvedValueOnce([nodeB]);
      mockEmbeddingService.embedNodes.mockResolvedValue([nodeA, nodeB]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [nodeA],
          uuidMap: new Map([[nodeA.uuid, nodeA.uuid]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [nodeB],
          uuidMap: new Map([[nodeB.uuid, nodeB.uuid]]),
          duplicatePairs: [],
        });

      const result = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      expect(allNodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(allNodes.find((n) => n.uuid === nodeB.uuid)).toBeDefined();
    });
  });

  // ─── Combined pass-1 + pass-2 ─────────────────────────────────────────────

  describe('addEpisodes — combined pass-1 and pass-2', () => {
    it('only the canonical survives when one node is a pass-1 alias and another is a pass-2 alias', async () => {
      const nodeA = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = KgNodeFactory.createEntityNode({
        name: 'Alice Smith',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [0, 1], // not a pass-2 pair
      });
      const nodeC = KgNodeFactory.createEntityNode({
        name: 'Alicia',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0], // pass-2 pair with nodeA
      });

      mockNodeExtraction.extractNodes
        .mockResolvedValueOnce([nodeA])
        .mockResolvedValueOnce([nodeB])
        .mockResolvedValueOnce([nodeC]);
      mockEmbeddingService.embedNodes.mockResolvedValue([nodeA, nodeB, nodeC]);
      mockNodeResolution.resolveNodes
        .mockResolvedValueOnce({
          resolvedNodes: [nodeA],
          uuidMap: new Map([[nodeA.uuid, nodeA.uuid]]),
          duplicatePairs: [],
        })
        .mockResolvedValueOnce({
          resolvedNodes: [],
          duplicatePairs: [{ extractedUuid: nodeB.uuid, canonicalUuid: nodeA.uuid }],
          uuidMap: new Map([[nodeB.uuid, nodeA.uuid]]),
        })
        .mockResolvedValueOnce({
          resolvedNodes: [nodeC],
          uuidMap: new Map([[nodeC.uuid, nodeC.uuid]]),
          duplicatePairs: [],
        });

      const result = await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2'), makeEpisode('ep3')],
      });

      const allNodes = result.flatMap((r) => r.nodes);
      // nodeB is excluded by pass-1; nodeC is pass-2 alias of nodeA (first-seen wins).
      expect(allNodes.find((n) => n.uuid === nodeB.uuid)).toBeUndefined();
      expect(allNodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(allNodes.find((n) => n.uuid === nodeC.uuid)).toBeUndefined();
    });
  });

  // ─── Saga handling per episode (sagaUuid) ─────────────────────────────────

  describe('addEpisodes — saga handling', () => {
    it('creates SagaNode and HasEpisodeEdge when sagaUuid is provided', async () => {
      const ep = makeEpisode('ep1');
      ep.sagaUuid = KG_TEST_SAGA_UUID;

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [ep],
      });

      expect(mockSagaNodeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          uuid: KG_TEST_SAGA_UUID,
          groupId: KG_TEST_GROUP_ID,
        }),
      );
      expect(mockHasEpisodeEdgeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceNodeUuid: KG_TEST_SAGA_UUID,
          groupId: KG_TEST_GROUP_ID,
        }),
      );
    });

    it('creates NextEpisodeEdge when a previous saga episode exists', async () => {
      const prevEpisode = KgNodeFactory.createEpisodicNode({
        name: 'Prior',
        content: 'earlier content',
        validAt: KG_REFERENCE_TIME,
        groupId: KG_TEST_GROUP_ID,
      });
      prevEpisode.uuid = u('prev-episode-uuid');

      mockEpisodicNodeRepo.retrieveEpisodes
        .mockResolvedValueOnce([]) // step 2: previousEpisodes for extraction
        .mockResolvedValueOnce([prevEpisode]); // step 21: saga previous lookup

      const ep = makeEpisode('ep1');
      ep.sagaUuid = KG_TEST_SAGA_UUID;

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [ep],
      });

      expect(mockNextEpisodeEdgeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceNodeUuid: prevEpisode.uuid,
          groupId: KG_TEST_GROUP_ID,
        }),
      );
    });

    it('does not create NextEpisodeEdge when no previous saga episode exists', async () => {
      const ep = makeEpisode('ep1');
      ep.sagaUuid = KG_TEST_SAGA_UUID;

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [ep],
      });

      expect(mockNextEpisodeEdgeRepo.save).not.toHaveBeenCalled();
    });

    it('skips saga handling when sagaUuid is omitted', async () => {
      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockSagaNodeRepo.save).not.toHaveBeenCalled();
      expect(mockHasEpisodeEdgeRepo.save).not.toHaveBeenCalled();
      expect(mockNextEpisodeEdgeRepo.save).not.toHaveBeenCalled();
    });

    it('processes saga linking for each episode in the batch that has a sagaUuid', async () => {
      const ep1 = makeEpisode('ep1');
      ep1.sagaUuid = KG_TEST_SAGA_UUID;
      const ep2 = makeEpisode('ep2'); // no saga
      const ep3 = makeEpisode('ep3');
      ep3.sagaUuid = KG_TEST_SAGA_UUID;

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [ep1, ep2, ep3],
      });

      // SagaNode saved once per saga-bearing episode (idempotent on saga side).
      expect(mockSagaNodeRepo.save).toHaveBeenCalledTimes(2);
      expect(mockHasEpisodeEdgeRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Combined extraction (useCombinedExtraction: true) ────────────────────

  describe('addEpisodes — combined extraction (useCombinedExtraction)', () => {
    it('uses CombinedExtractionService instead of NodeExtractionService', async () => {
      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
        useCombinedExtraction: true,
      });

      expect(mockCombinedExtraction.extractNodesAndEdges).toHaveBeenCalled();
      expect(mockNodeExtraction.extractNodes).not.toHaveBeenCalled();
    });

    it('reuses preExtractedEdges from combined extraction (skips separate extractEdges call)', async () => {
      const node = KgNodeFactory.createEntityNode({ name: 'Alice' });
      const edge = KgEdgeFactory.createEntityEdge({
        name: 'WORKS_AT',
        sourceNodeUuid: node.uuid,
        targetNodeUuid: u('target'),
        fact: 'fact',
      });
      mockCombinedExtraction.extractNodesAndEdges.mockResolvedValue({
        nodes: [node],
        edges: [edge],
        nodeEpisodeIndexMap: new Map(),
      });
      mockEmbeddingService.embedNodes.mockResolvedValue([node]);
      mockNodeResolution.resolveNodes.mockResolvedValue({
        resolvedNodes: [node],
        uuidMap: new Map([[node.uuid, node.uuid]]),
        duplicatePairs: [],
      });

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
        useCombinedExtraction: true,
      });

      expect(mockEdgeExtraction.extractEdges).not.toHaveBeenCalled();
      expect(mockEmbeddingService.embedEdges).toHaveBeenCalledWith([edge]);
    });
  });

  // ─── Community building ───────────────────────────────────────────────────

  describe('addEpisodes — community building', () => {
    it('does not call buildCommunities by default', async () => {
      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockCommunityService.buildCommunities).not.toHaveBeenCalled();
    });

    it('calls buildCommunities after persist when updateCommunities is true', async () => {
      await service.addEpisodes({
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
        KG_TEST_GROUP_ID,
      );
    });

    it('calls buildCommunities once per distinct groupId across the batch', async () => {
      const otherGroupId = GroupIdSchema.parse('other-group');
      const ep1 = makeEpisode('ep1');
      const ep2 = makeEpisode('ep2');
      const ep3 = { ...makeEpisode('ep3'), groupId: otherGroupId };

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [ep1, ep2, ep3],
        updateCommunities: true,
      });

      expect(mockCommunityService.buildCommunities).toHaveBeenCalledTimes(2);
      expect(mockCommunityService.buildCommunities).toHaveBeenCalledWith(
        KG_TEST_USER_ID,
        KG_TEST_GROUP_ID,
      );
      expect(mockCommunityService.buildCommunities).toHaveBeenCalledWith(
        KG_TEST_USER_ID,
        otherGroupId,
      );
    });
  });

  // ─── Node summaries ───────────────────────────────────────────────────────

  describe('addEpisodes — node summaries', () => {
    it('invokes structured output and applies returned summaries to canonical nodes', async () => {
      const node = KgNodeFactory.createEntityNode({ name: 'Alice' });
      mockNodeExtraction.extractNodes.mockResolvedValue([node]);
      mockEmbeddingService.embedNodes.mockResolvedValue([node]);
      mockNodeResolution.resolveNodes.mockResolvedValue({
        resolvedNodes: [node],
        uuidMap: new Map([[node.uuid, node.uuid]]),
        duplicatePairs: [],
      });
      mockRunnable.invoke.mockResolvedValue({
        summaries: [{ uuid: node.uuid, summary: 'Alice is an engineer' }],
      });

      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockModel.withStructuredOutput).toHaveBeenCalled();
      const savedNodes = mockEntityNodeRepo.saveBulk.mock.calls[0]?.[0];
      expect(savedNodes.find((n) => n.uuid === node.uuid)?.summary).toBe(
        'Alice is an engineer',
      );
    });

    it('does not invoke structured output when there are no new canonical nodes', async () => {
      await service.addEpisodes({
        userId: KG_TEST_USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    });
  });
});
