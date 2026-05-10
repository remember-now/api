import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Test, TestingModule } from '@nestjs/testing';

import { LlmService } from '@/llm/llm.service';
import { KG_TEST_GROUP_ID, KgNodeFactory, makeEpisode } from '@/test/factories';

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
} from '../neo4j/repositories';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import { BulkEpisodeService } from './bulk-episode.service';

const USER_ID = 1;

describe('BulkEpisodeService — steps 9-12: two-pass node deduplication', () => {
  let service: BulkEpisodeService;
  let mockLlmService: DeepMocked<LlmService>;
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
  let mockModel: DeepMocked<BaseChatModel>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BulkEpisodeService],
    })
      .useMocker(createMock)
      .compile();

    service = module.get(BulkEpisodeService);
    mockLlmService = module.get(LlmService);
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

    mockModel = createMock<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);

    // Default stubs for steps that are not under test
    mockLlmService.getActiveModel.mockResolvedValue(mockModel);
    mockEpisodicNodeRepo.saveBulk.mockResolvedValue(undefined);
    mockEpisodicNodeRepo.retrieveEpisodes.mockResolvedValue([]);
    mockNodeExtraction.extractNodes.mockResolvedValue([]);
    mockEmbeddingService.embedNodes.mockResolvedValue([]);
    mockEntityNodeRepo.searchByName.mockResolvedValue([]);
    mockEntityNodeRepo.searchBySimilarity.mockResolvedValue([]);
    mockNodeResolution.resolveNodes.mockResolvedValue({
      resolvedNodes: [],
      uuidMap: new Map(),
      duplicatePairs: [],
    });
    mockEdgeExtraction.extractEdges.mockResolvedValue([]);
    mockEmbeddingService.embedEdges.mockResolvedValue([]);
    mockEntityEdgeRepo.searchByFact.mockResolvedValue([]);
    mockEntityEdgeRepo.searchBySimilarity.mockResolvedValue([]);
    mockEdgeResolution.resolveEdges.mockResolvedValue({
      resolvedEdges: [],
      invalidatedEdges: [],
    });
    mockEntityNodeRepo.saveBulk.mockResolvedValue(undefined);
    mockEntityEdgeRepo.saveBulk.mockResolvedValue(undefined);
    mockEpisodicEdgeRepo.saveBulk.mockResolvedValue(undefined);
    mockRunnable.invoke.mockResolvedValue({ summaries: [] });
    mockCombinedExtraction.extractNodesAndEdges.mockResolvedValue({
      nodes: [],
      edges: [],
      nodeEpisodeIndexMap: new Map(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Pass-1: resolve nodes against the live graph ──────────────────────────

  describe('pass-1 dedup (vs live graph)', () => {
    it('alias node is excluded from saved nodes when resolveNodes returns a duplicate pair', async () => {
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

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      expect(result.nodes.find((n) => n.uuid === alias.uuid)).toBeUndefined();
      expect(result.nodes.find((n) => n.uuid === canonical.uuid)).toBeDefined();
    });

    it('existing node referenced as canonical target is pulled into the result', async () => {
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

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1')],
      });

      // Existing canonical is included; alias is not
      expect(result.nodes.find((n) => n.uuid === existingCanonical.uuid)).toBeDefined();
      expect(result.nodes.find((n) => n.uuid === alias.uuid)).toBeUndefined();
    });

    it('canonical node appears exactly once in saveBulk when extracted by two episodes', async () => {
      // Mirrors Python test_dedupe_nodes_bulk_reuses_canonical_nodes:
      // episode 1 extracts canonical; episode 2 extracts an alias of the same entity
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
      // ep1: canonical survives with no duplicates
      // ep2: resolveNodes identifies alias as duplicate and returns canonical as the live node
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

      await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      // allCanonicalNodes deduplication (via Map in step 17) ensures exactly one save
      const savedNodes = mockEntityNodeRepo.saveBulk.mock.calls[0]?.[0];
      expect(savedNodes.filter((n) => n.uuid === canonical.uuid)).toHaveLength(1);
    });
  });

  // ── Pass-2: within-batch exact-name + cosine similarity dedup ───────────

  describe('pass-2 dedup (within-batch exact name + cosine similarity)', () => {
    it('exactly one of two nodes with identical embeddings survives as canonical', async () => {
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

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      const hasA = result.nodes.some((n) => n.uuid === nodeA.uuid);
      const hasB = result.nodes.some((n) => n.uuid === nodeB.uuid);
      // Exactly one survives; the other is aliased by buildDirectedUuidMap
      expect(hasA || hasB).toBe(true);
      expect(hasA && hasB).toBe(false);
    });

    it('two nodes with orthogonal embeddings are both kept (below threshold)', async () => {
      const nodeA = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = KgNodeFactory.createEntityNode({
        name: 'Bob',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [0, 1], // cosine([1,0],[0,1]) = 0 < 0.9
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

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      expect(result.nodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(result.nodes.find((n) => n.uuid === nodeB.uuid)).toBeDefined();
    });

    it('two nodes with identical names and null embeddings are deduplicated by exact match', async () => {
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

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      // nodeA (first-seen) is canonical; nodeB is its alias and must not appear
      expect(result.nodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(result.nodes.find((n) => n.uuid === nodeB.uuid)).toBeUndefined();
    });

    it('node with null embedding is deduplicated by exact name match against a node that has an embedding', async () => {
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

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      expect(result.nodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(result.nodes.find((n) => n.uuid === nodeB.uuid)).toBeUndefined();
    });

    it('two nodes with different names and null embeddings are both kept', async () => {
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

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2')],
      });

      expect(result.nodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(result.nodes.find((n) => n.uuid === nodeB.uuid)).toBeDefined();
    });
  });

  // ── Combined pass-1 + pass-2 ──────────────────────────────────────────────

  describe('combined pass-1 and pass-2', () => {
    it('only the canonical survives when one node is a pass-1 alias and another is a pass-2 alias', async () => {
      // nodeA: canonical (from ep1, no duplicates)
      // nodeB: pass-1 alias of nodeA (ep2 resolveNodes returns duplicatePairs)
      // nodeC: pass-2 alias of nodeA (same embedding as nodeA)
      const nodeA = KgNodeFactory.createEntityNode({
        name: 'Alice',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = KgNodeFactory.createEntityNode({
        name: 'Alice Smith',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [0, 1], // different embedding → not a pass-2 pair
      });
      const nodeC = KgNodeFactory.createEntityNode({
        name: 'Alicia',
        groupId: KG_TEST_GROUP_ID,
        nameEmbedding: [1, 0], // same embedding as nodeA → pass-2 pair
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

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeEpisode('ep1'), makeEpisode('ep2'), makeEpisode('ep3')],
      });

      // nodeB is excluded by pass-1 (resolveNodes returned it as an alias of nodeA).
      // nodeA and nodeC form a pass-2 pair: pass2Pairs emits [nodeC.uuid, nodeA.uuid]
      // so buildDirectedUuidMap makes nodeA (first-seen / lower-index) the canonical
      // and nodeC the alias. Only nodeA survives.
      expect(result.nodes.find((n) => n.uuid === nodeB.uuid)).toBeUndefined();
      expect(result.nodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(result.nodes.find((n) => n.uuid === nodeC.uuid)).toBeUndefined();
    });
  });
});
