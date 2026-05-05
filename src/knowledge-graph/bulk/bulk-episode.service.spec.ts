import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { LlmService } from '@/llm/llm.service';

import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import { createEntityNode } from '../models/nodes/entity-node';
import { EpisodeType } from '../models/nodes/node.types';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
} from '../neo4j/repositories';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import { BulkEpisodeService } from './bulk-episode.service';
import { RawEpisode } from './bulk.types';

const GROUP_ID = 'test-group';
const USER_ID = 1;
const REFERENCE_TIME = new Date('2024-01-01T00:00:00Z');

function makeRaw(name: string): RawEpisode {
  return {
    name,
    content: `Content: ${name}`,
    source: EpisodeType.text,
    sourceDescription: 'test',
    referenceTime: REFERENCE_TIME,
    groupId: GROUP_ID,
  };
}

describe('BulkEpisodeService — steps 9-12: two-pass node deduplication', () => {
  let service: BulkEpisodeService;
  let mockLlmService: ReturnType<typeof mockDeep<LlmService>>;
  let mockCommunityService: ReturnType<typeof mockDeep<CommunityService>>;
  let mockEmbeddingService: ReturnType<typeof mockDeep<EmbeddingService>>;
  let mockNodeExtraction: ReturnType<typeof mockDeep<NodeExtractionService>>;
  let mockEdgeExtraction: ReturnType<typeof mockDeep<EdgeExtractionService>>;
  let mockNodeResolution: ReturnType<typeof mockDeep<NodeResolutionService>>;
  let mockEdgeResolution: ReturnType<typeof mockDeep<EdgeResolutionService>>;
  let mockEntityNodeRepo: ReturnType<typeof mockDeep<EntityNodeRepository>>;
  let mockEntityEdgeRepo: ReturnType<typeof mockDeep<EntityEdgeRepository>>;
  let mockEpisodicNodeRepo: ReturnType<typeof mockDeep<EpisodicNodeRepository>>;
  let mockEpisodicEdgeRepo: ReturnType<typeof mockDeep<EpisodicEdgeRepository>>;
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    mockLlmService = mockDeep<LlmService>();
    mockCommunityService = mockDeep<CommunityService>();
    mockEmbeddingService = mockDeep<EmbeddingService>();
    mockNodeExtraction = mockDeep<NodeExtractionService>();
    mockEdgeExtraction = mockDeep<EdgeExtractionService>();
    mockNodeResolution = mockDeep<NodeResolutionService>();
    mockEdgeResolution = mockDeep<EdgeResolutionService>();
    mockEntityNodeRepo = mockDeep<EntityNodeRepository>();
    mockEntityEdgeRepo = mockDeep<EntityEdgeRepository>();
    mockEpisodicNodeRepo = mockDeep<EpisodicNodeRepository>();
    mockEpisodicEdgeRepo = mockDeep<EpisodicEdgeRepository>();

    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);

    service = new BulkEpisodeService(
      mockLlmService,
      mockCommunityService,
      mockEmbeddingService,
      mockNodeExtraction,
      mockEdgeExtraction,
      mockNodeResolution,
      mockEdgeResolution,
      mockEntityNodeRepo,
      mockEntityEdgeRepo,
      mockEpisodicNodeRepo,
      mockEpisodicEdgeRepo,
    );

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty result immediately for an empty episode list', async () => {
    const result = await service.addEpisodesBulk({
      userId: USER_ID,
      episodes: [],
    });
    expect(result.episodes).toEqual([]);
    expect(result.nodes).toEqual([]);
    expect(mockLlmService.getActiveModel).not.toHaveBeenCalled();
  });

  // ── Pass-1: resolve nodes against the live graph ──────────────────────────

  describe('pass-1 dedup (vs live graph)', () => {
    it('alias node is excluded from saved nodes when resolveNodes returns a duplicate pair', async () => {
      const canonical = createEntityNode({ name: 'Alice', groupId: GROUP_ID });
      const alias = createEntityNode({
        name: 'Alice Smith',
        groupId: GROUP_ID,
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
          duplicatePairs: [
            { extractedUuid: alias.uuid, canonicalUuid: canonical.uuid },
          ],
          uuidMap: new Map([[alias.uuid, canonical.uuid]]),
        });

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeRaw('ep1'), makeRaw('ep2')],
      });

      expect(result.nodes.find((n) => n.uuid === alias.uuid)).toBeUndefined();
      expect(result.nodes.find((n) => n.uuid === canonical.uuid)).toBeDefined();
    });

    it('existing node referenced as canonical target is pulled into the result', async () => {
      const existingCanonical = createEntityNode({
        name: 'Alice',
        groupId: GROUP_ID,
      });
      const alias = createEntityNode({
        name: 'Alice Smith',
        groupId: GROUP_ID,
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
        episodes: [makeRaw('ep1')],
      });

      // Existing canonical is included; alias is not
      expect(
        result.nodes.find((n) => n.uuid === existingCanonical.uuid),
      ).toBeDefined();
      expect(result.nodes.find((n) => n.uuid === alias.uuid)).toBeUndefined();
    });

    it('canonical node appears exactly once in saveBulk when extracted by two episodes', async () => {
      // Mirrors Python test_dedupe_nodes_bulk_reuses_canonical_nodes:
      // episode 1 extracts canonical; episode 2 extracts an alias of the same entity
      const canonical = createEntityNode({ name: 'Alice', groupId: GROUP_ID });
      const alias = createEntityNode({
        name: 'Alice Smith',
        groupId: GROUP_ID,
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
          duplicatePairs: [
            { extractedUuid: alias.uuid, canonicalUuid: canonical.uuid },
          ],
          uuidMap: new Map([[alias.uuid, canonical.uuid]]),
        });

      await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeRaw('ep1'), makeRaw('ep2')],
      });

      // allCanonicalNodes deduplication (via Map in step 17) ensures exactly one save
      const savedNodes = mockEntityNodeRepo.saveBulk.mock.calls[0]?.[0];
      expect(savedNodes.filter((n) => n.uuid === canonical.uuid)).toHaveLength(
        1,
      );
    });
  });

  // ── Pass-2: within-batch cosine similarity dedup ─────────────────────────

  describe('pass-2 dedup (within-batch cosine similarity)', () => {
    it('exactly one of two nodes with identical embeddings survives as canonical', async () => {
      const nodeA = createEntityNode({
        name: 'Alice',
        groupId: GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = createEntityNode({
        name: 'Alicia',
        groupId: GROUP_ID,
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
        episodes: [makeRaw('ep1'), makeRaw('ep2')],
      });

      const hasA = result.nodes.some((n) => n.uuid === nodeA.uuid);
      const hasB = result.nodes.some((n) => n.uuid === nodeB.uuid);
      // Exactly one survives; the other is aliased by buildDirectedUuidMap
      expect(hasA || hasB).toBe(true);
      expect(hasA && hasB).toBe(false);
    });

    it('two nodes with orthogonal embeddings are both kept (below threshold)', async () => {
      const nodeA = createEntityNode({
        name: 'Alice',
        groupId: GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = createEntityNode({
        name: 'Bob',
        groupId: GROUP_ID,
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
        episodes: [makeRaw('ep1'), makeRaw('ep2')],
      });

      expect(result.nodes.find((n) => n.uuid === nodeA.uuid)).toBeDefined();
      expect(result.nodes.find((n) => n.uuid === nodeB.uuid)).toBeDefined();
    });

    it('node without nameEmbedding is not compared in pass-2', async () => {
      const nodeA = createEntityNode({
        name: 'Alice',
        groupId: GROUP_ID,
        nameEmbedding: null,
      });
      const nodeB = createEntityNode({
        name: 'Alice',
        groupId: GROUP_ID,
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
        episodes: [makeRaw('ep1'), makeRaw('ep2')],
      });

      // Both survive because pass-2 skips nodes with null embeddings
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
      const nodeA = createEntityNode({
        name: 'Alice',
        groupId: GROUP_ID,
        nameEmbedding: [1, 0],
      });
      const nodeB = createEntityNode({
        name: 'Alice Smith',
        groupId: GROUP_ID,
        nameEmbedding: [0, 1], // different embedding → not a pass-2 pair
      });
      const nodeC = createEntityNode({
        name: 'Alicia',
        groupId: GROUP_ID,
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
          duplicatePairs: [
            { extractedUuid: nodeB.uuid, canonicalUuid: nodeA.uuid },
          ],
          uuidMap: new Map([[nodeB.uuid, nodeA.uuid]]),
        })
        .mockResolvedValueOnce({
          resolvedNodes: [nodeC],
          uuidMap: new Map([[nodeC.uuid, nodeC.uuid]]),
          duplicatePairs: [],
        });

      const result = await service.addEpisodesBulk({
        userId: USER_ID,
        episodes: [makeRaw('ep1'), makeRaw('ep2'), makeRaw('ep3')],
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
