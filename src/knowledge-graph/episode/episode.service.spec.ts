import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { LlmService } from '@/llm/llm.service';

import { CommunityService } from '../community';
import { EmbeddingService } from '../embedding';
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import { createEntityEdge } from '../models/edges';
import { createEntityNode, createEpisodicNode } from '../models/nodes';
import {
  EntityEdgeRepository,
  EntityNodeRepository,
  EpisodicEdgeRepository,
  EpisodicNodeRepository,
  HasEpisodeEdgeRepository,
  NextEpisodeEdgeRepository,
  SagaNodeRepository,
} from '../neo4j/repositories';
import { EdgeResolutionService, NodeResolutionService } from '../resolution';
import { EpisodeService } from './episode.service';

const GROUP_ID = 'group-1';
const USER_ID = 42;
const REFERENCE_TIME = new Date('2024-06-01T00:00:00Z');

const baseOptions = {
  userId: USER_ID,
  name: 'Test Episode',
  content: 'Alice works at Acme Corp.',
  groupId: GROUP_ID,
  referenceTime: REFERENCE_TIME,
};

function makeEpisode() {
  return createEpisodicNode({
    name: 'Test Episode',
    content: 'Alice works at Acme Corp.',
    validAt: REFERENCE_TIME,
    groupId: GROUP_ID,
  });
}

function makeNode(name: string) {
  return createEntityNode({ name, groupId: GROUP_ID });
}

function makeEdge(sourceUuid: string, targetUuid: string) {
  return createEntityEdge({
    name: 'WORKS_AT',
    sourceNodeUuid: sourceUuid,
    targetNodeUuid: targetUuid,
    groupId: GROUP_ID,
    fact: 'Alice works at Acme Corp',
  });
}

describe('EpisodeService', () => {
  let service: EpisodeService;

  let mockLlmService: ReturnType<typeof mockDeep<LlmService>>;
  let mockCommunityService: ReturnType<typeof mockDeep<CommunityService>>;
  let mockEmbeddingService: ReturnType<typeof mockDeep<EmbeddingService>>;
  let mockNodeExtractionService: ReturnType<
    typeof mockDeep<NodeExtractionService>
  >;
  let mockEdgeExtractionService: ReturnType<
    typeof mockDeep<EdgeExtractionService>
  >;
  let mockNodeResolutionService: ReturnType<
    typeof mockDeep<NodeResolutionService>
  >;
  let mockEdgeResolutionService: ReturnType<
    typeof mockDeep<EdgeResolutionService>
  >;
  let mockEntityNodeRepository: ReturnType<
    typeof mockDeep<EntityNodeRepository>
  >;
  let mockEntityEdgeRepository: ReturnType<
    typeof mockDeep<EntityEdgeRepository>
  >;
  let mockEpisodicNodeRepository: ReturnType<
    typeof mockDeep<EpisodicNodeRepository>
  >;
  let mockEpisodicEdgeRepository: ReturnType<
    typeof mockDeep<EpisodicEdgeRepository>
  >;
  let mockSagaNodeRepository: ReturnType<typeof mockDeep<SagaNodeRepository>>;
  let mockHasEpisodeEdgeRepository: ReturnType<
    typeof mockDeep<HasEpisodeEdgeRepository>
  >;
  let mockNextEpisodeEdgeRepository: ReturnType<
    typeof mockDeep<NextEpisodeEdgeRepository>
  >;

  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    mockLlmService = mockDeep<LlmService>();
    mockCommunityService = mockDeep<CommunityService>();
    mockEmbeddingService = mockDeep<EmbeddingService>();
    mockNodeExtractionService = mockDeep<NodeExtractionService>();
    mockEdgeExtractionService = mockDeep<EdgeExtractionService>();
    mockNodeResolutionService = mockDeep<NodeResolutionService>();
    mockEdgeResolutionService = mockDeep<EdgeResolutionService>();
    mockEntityNodeRepository = mockDeep<EntityNodeRepository>();
    mockEntityEdgeRepository = mockDeep<EntityEdgeRepository>();
    mockEpisodicNodeRepository = mockDeep<EpisodicNodeRepository>();
    mockEpisodicEdgeRepository = mockDeep<EpisodicEdgeRepository>();
    mockSagaNodeRepository = mockDeep<SagaNodeRepository>();
    mockHasEpisodeEdgeRepository = mockDeep<HasEpisodeEdgeRepository>();
    mockNextEpisodeEdgeRepository = mockDeep<NextEpisodeEdgeRepository>();

    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);

    service = new EpisodeService(
      mockLlmService,
      mockCommunityService,
      mockEmbeddingService,
      mockNodeExtractionService,
      mockEdgeExtractionService,
      mockNodeResolutionService,
      mockEdgeResolutionService,
      mockEntityNodeRepository,
      mockEntityEdgeRepository,
      mockEpisodicNodeRepository,
      mockEpisodicEdgeRepository,
      mockSagaNodeRepository,
      mockHasEpisodeEdgeRepository,
      mockNextEpisodeEdgeRepository,
    );

    // Default mock implementations
    mockLlmService.getActiveModel.mockResolvedValue(mockModel);
    mockEpisodicNodeRepository.retrieveEpisodes.mockResolvedValue([]);
    mockEpisodicNodeRepository.save.mockResolvedValue('episode-uuid');
    mockNodeExtractionService.extractNodes.mockResolvedValue([]);
    mockEntityNodeRepository.getByGroupIds.mockResolvedValue([]);
    mockEmbeddingService.embedNodes.mockResolvedValue([]);
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [],
      uuidMap: new Map(),
    });
    mockEdgeExtractionService.extractEdges.mockResolvedValue([]);
    mockEntityEdgeRepository.getByGroupIds.mockResolvedValue([]);
    mockEmbeddingService.embedEdges.mockResolvedValue([]);
    mockEdgeResolutionService.resolveEdges.mockResolvedValue({
      resolvedEdges: [],
      invalidatedEdges: [],
    });
    mockEpisodicEdgeRepository.saveBulk.mockResolvedValue(undefined);
    mockEntityNodeRepository.saveBulk.mockResolvedValue(undefined);
    mockEntityEdgeRepository.saveBulk.mockResolvedValue(undefined);
    mockRunnable.invoke.mockResolvedValue({ summaries: [] });
    mockCommunityService.buildCommunities.mockResolvedValue(undefined);
  });

  it('should save episode node before extraction', async () => {
    await service.addEpisode(baseOptions);

    const saveOrder =
      mockEpisodicNodeRepository.save.mock.invocationCallOrder[0];
    const extractOrder =
      mockNodeExtractionService.extractNodes.mock.invocationCallOrder[0];

    expect(saveOrder).toBeLessThan(extractOrder);
  });

  it('should call extractNodes with model, episode, and previousEpisodes', async () => {
    const prevEpisode = makeEpisode();
    mockEpisodicNodeRepository.retrieveEpisodes.mockResolvedValue([
      prevEpisode,
    ]);

    await service.addEpisode(baseOptions);

    expect(mockNodeExtractionService.extractNodes).toHaveBeenCalledWith(
      mockModel,
      expect.objectContaining({ name: 'Test Episode', groupId: GROUP_ID }),
      [prevEpisode],
      undefined,
      undefined,
    );
  });

  it('should call embedNodes with extracted nodes', async () => {
    const node = makeNode('Alice');
    mockNodeExtractionService.extractNodes.mockResolvedValue([node]);

    await service.addEpisode(baseOptions);

    expect(mockEmbeddingService.embedNodes).toHaveBeenCalledWith([node]);
  });

  it('should call resolveNodes with embedded nodes and existing nodes', async () => {
    const extracted = makeNode('Alice');
    const existing = makeNode('Bob');
    const embedded = { ...extracted, nameEmbedding: [1, 0, 0] };

    mockNodeExtractionService.extractNodes.mockResolvedValue([extracted]);
    mockEmbeddingService.embedNodes.mockResolvedValue([embedded]);
    mockEntityNodeRepository.getByGroupIds.mockResolvedValue([existing]);

    await service.addEpisode(baseOptions);

    expect(mockNodeResolutionService.resolveNodes).toHaveBeenCalledWith(
      mockModel,
      expect.anything(),
      [embedded],
      [existing],
      [],
      undefined,
    );
  });

  it('should call extractEdges with canonical nodes (resolved + matched existing)', async () => {
    const resolvedNode = makeNode('Alice');
    const existingNode = { ...makeNode('Bob'), uuid: 'existing-bob-uuid' };
    const uuidMap = new Map([['temp-uuid', existingNode.uuid]]);

    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [resolvedNode],
      uuidMap,
    });
    mockEntityNodeRepository.getByGroupIds.mockResolvedValue([existingNode]);

    await service.addEpisode(baseOptions);

    expect(mockEdgeExtractionService.extractEdges).toHaveBeenCalledWith(
      mockModel,
      expect.anything(),
      expect.arrayContaining([resolvedNode, existingNode]),
      [],
      undefined,
    );
  });

  it('should call embedEdges with extracted edges', async () => {
    const node = makeNode('Alice');
    const edge = makeEdge(node.uuid, 'target-uuid');
    mockEdgeExtractionService.extractEdges.mockResolvedValue([edge]);

    await service.addEpisode(baseOptions);

    expect(mockEmbeddingService.embedEdges).toHaveBeenCalledWith([edge]);
  });

  it('should call resolveEdges with embedded edges and uuidMap', async () => {
    const edge = makeEdge('src', 'tgt');
    const embeddedEdge = { ...edge, factEmbedding: [1, 0, 0] };
    const existingEdge = makeEdge('src2', 'tgt2');
    const uuidMap = new Map<string, string>();

    mockEmbeddingService.embedEdges.mockResolvedValue([embeddedEdge]);
    mockEntityEdgeRepository.getByGroupIds.mockResolvedValue([existingEdge]);
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [],
      uuidMap,
    });

    await service.addEpisode(baseOptions);

    expect(mockEdgeResolutionService.resolveEdges).toHaveBeenCalledWith(
      mockModel,
      expect.anything(),
      [embeddedEdge],
      [existingEdge],
      uuidMap,
      REFERENCE_TIME,
      [],
      undefined,
    );
  });

  it('should call withStructuredOutput for node summaries when resolved nodes exist', async () => {
    const node = makeNode('Alice');
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [node],
      uuidMap: new Map(),
    });
    mockRunnable.invoke.mockResolvedValue({
      summaries: [{ uuid: node.uuid, summary: 'Alice is an engineer' }],
    });

    await service.addEpisode(baseOptions);

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
  });

  it('should apply returned summaries to resolved nodes before save', async () => {
    const node = makeNode('Alice');
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [node],
      uuidMap: new Map(),
    });
    mockRunnable.invoke.mockResolvedValue({
      summaries: [{ uuid: node.uuid, summary: 'Alice is an engineer' }],
    });

    await service.addEpisode(baseOptions);

    const savedNodes = mockEntityNodeRepository.saveBulk.mock.calls[0][0];
    expect(savedNodes[0].summary).toBe('Alice is an engineer');
  });

  it('should save invalidated edges via entityEdgeRepository.saveBulk', async () => {
    const invalidated = makeEdge('src', 'tgt');
    mockEdgeResolutionService.resolveEdges.mockResolvedValue({
      resolvedEdges: [],
      invalidatedEdges: [invalidated],
    });

    await service.addEpisode(baseOptions);

    const allSaveBulkCalls = mockEntityEdgeRepository.saveBulk.mock.calls;
    const savedAny = allSaveBulkCalls.some((call) =>
      call[0].some((e) => e.uuid === invalidated.uuid),
    );
    expect(savedAny).toBe(true);
  });

  it('should create episodic edges for all canonical nodes and save them', async () => {
    const resolvedNode = makeNode('Alice');
    const existingNode = { ...makeNode('Bob'), uuid: 'bob-uuid' };
    const uuidMap = new Map([['some-uuid', existingNode.uuid]]);

    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [resolvedNode],
      uuidMap,
    });
    mockEntityNodeRepository.getByGroupIds.mockResolvedValue([existingNode]);

    await service.addEpisode(baseOptions);

    const savedEpisodicEdges =
      mockEpisodicEdgeRepository.saveBulk.mock.calls[0][0];
    expect(savedEpisodicEdges).toHaveLength(2);
    expect(savedEpisodicEdges.map((e) => e.targetNodeUuid)).toEqual(
      expect.arrayContaining([resolvedNode.uuid, existingNode.uuid]),
    );
  });

  it('should call hasEpisodeEdgeRepository.save when sagaUuid is provided', async () => {
    mockSagaNodeRepository.save.mockResolvedValue('saga-uuid');
    mockHasEpisodeEdgeRepository.save.mockResolvedValue('has-episode-uuid');
    mockEpisodicNodeRepository.retrieveEpisodes
      .mockResolvedValueOnce([]) // first call for previousEpisodes
      .mockResolvedValueOnce([]); // second call for saga lookup

    await service.addEpisode({ ...baseOptions, sagaUuid: 'my-saga' });

    expect(mockHasEpisodeEdgeRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeUuid: 'my-saga',
        groupId: GROUP_ID,
      }),
    );
  });

  it('should call nextEpisodeEdgeRepository.save when previous episode exists in saga', async () => {
    const prevEpisode = makeEpisode();
    prevEpisode.uuid = 'prev-episode-uuid';

    mockSagaNodeRepository.save.mockResolvedValue('saga-uuid');
    mockHasEpisodeEdgeRepository.save.mockResolvedValue('has-episode-uuid');
    mockNextEpisodeEdgeRepository.save.mockResolvedValue('next-episode-uuid');

    mockEpisodicNodeRepository.retrieveEpisodes
      .mockResolvedValueOnce([]) // previousEpisodes
      .mockResolvedValueOnce([prevEpisode]); // saga previous episode

    await service.addEpisode({ ...baseOptions, sagaUuid: 'my-saga' });

    expect(mockNextEpisodeEdgeRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeUuid: prevEpisode.uuid,
        groupId: GROUP_ID,
      }),
    );
  });

  it('should not call nextEpisodeEdgeRepository.save when no previous episode in saga', async () => {
    mockSagaNodeRepository.save.mockResolvedValue('saga-uuid');
    mockHasEpisodeEdgeRepository.save.mockResolvedValue('has-episode-uuid');

    mockEpisodicNodeRepository.retrieveEpisodes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.addEpisode({ ...baseOptions, sagaUuid: 'my-saga' });

    expect(mockNextEpisodeEdgeRepository.save).not.toHaveBeenCalled();
  });

  it('should return episode, nodes, edges, and episodicEdges', async () => {
    const node = makeNode('Alice');
    const edge = makeEdge(node.uuid, 'target');

    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [node],
      uuidMap: new Map(),
    });
    mockEdgeResolutionService.resolveEdges.mockResolvedValue({
      resolvedEdges: [edge],
      invalidatedEdges: [],
    });
    mockRunnable.invoke.mockResolvedValue({ summaries: [] });

    const result = await service.addEpisode(baseOptions);

    expect(result.episode).toBeDefined();
    expect(result.episode.name).toBe('Test Episode');
    expect(result.nodes).toEqual([node]);
    expect(result.edges).toEqual([edge]);
    expect(result.episodicEdges).toHaveLength(1);
    expect(result.episodicEdges[0].targetNodeUuid).toBe(node.uuid);
  });

  it('should not call withStructuredOutput when no resolved nodes', async () => {
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [],
      uuidMap: new Map(),
    });

    await service.addEpisode(baseOptions);

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
  });

  it('should call communityService.buildCommunities with userId and groupId after persist', async () => {
    await service.addEpisode(baseOptions);

    expect(mockCommunityService.buildCommunities).toHaveBeenCalledWith(
      USER_ID,
      GROUP_ID,
    );

    const persistOrder =
      mockEntityNodeRepository.saveBulk.mock.invocationCallOrder[0];
    const communityOrder =
      mockCommunityService.buildCommunities.mock.invocationCallOrder[0];
    expect(persistOrder).toBeLessThan(communityOrder);
  });
});
