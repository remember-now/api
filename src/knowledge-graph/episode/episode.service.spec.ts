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
import { EdgeExtractionService, NodeExtractionService } from '../extraction';
import { Uuid } from '../neo4j/neo4j.schemas';
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

const u = (s: string) => s as Uuid;

const baseOptions = {
  userId: KG_TEST_USER_ID,
  episode: makeEpisode('Test Episode'),
};

describe('EpisodeService', () => {
  let service: EpisodeService;

  let mockLlmService: DeepMocked<LlmService>;
  let mockCommunityService: DeepMocked<CommunityService>;
  let mockEmbeddingService: DeepMocked<EmbeddingService>;
  let mockNodeExtractionService: DeepMocked<NodeExtractionService>;
  let mockEdgeExtractionService: DeepMocked<EdgeExtractionService>;
  let mockNodeResolutionService: DeepMocked<NodeResolutionService>;
  let mockEdgeResolutionService: DeepMocked<EdgeResolutionService>;
  let mockEntityNodeRepository: DeepMocked<EntityNodeRepository>;
  let mockEntityEdgeRepository: DeepMocked<EntityEdgeRepository>;
  let mockEpisodicNodeRepository: DeepMocked<EpisodicNodeRepository>;
  let mockEpisodicEdgeRepository: DeepMocked<EpisodicEdgeRepository>;
  let mockSagaNodeRepository: DeepMocked<SagaNodeRepository>;
  let mockHasEpisodeEdgeRepository: DeepMocked<HasEpisodeEdgeRepository>;
  let mockNextEpisodeEdgeRepository: DeepMocked<NextEpisodeEdgeRepository>;

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
    mockNodeExtractionService = module.get(NodeExtractionService);
    mockEdgeExtractionService = module.get(EdgeExtractionService);
    mockNodeResolutionService = module.get(NodeResolutionService);
    mockEdgeResolutionService = module.get(EdgeResolutionService);
    mockEntityNodeRepository = module.get(EntityNodeRepository);
    mockEntityEdgeRepository = module.get(EntityEdgeRepository);
    mockEpisodicNodeRepository = module.get(EpisodicNodeRepository);
    mockEpisodicEdgeRepository = module.get(EpisodicEdgeRepository);
    mockSagaNodeRepository = module.get(SagaNodeRepository);
    mockHasEpisodeEdgeRepository = module.get(HasEpisodeEdgeRepository);
    mockNextEpisodeEdgeRepository = module.get(NextEpisodeEdgeRepository);

    mockModel = createMock<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);

    // Default mock implementations
    mockLlmService.getActiveModel.mockResolvedValue(mockModel);
    mockEpisodicNodeRepository.retrieveEpisodes.mockResolvedValue([]);
    mockEpisodicNodeRepository.save.mockResolvedValue('episode-uuid');
    mockNodeExtractionService.extractNodes.mockResolvedValue([]);
    mockEntityNodeRepository.searchByName.mockResolvedValue([]);
    mockEntityNodeRepository.searchBySimilarity.mockResolvedValue([]);
    mockEmbeddingService.embedNodes.mockResolvedValue([]);
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [],
      uuidMap: new Map(),
      duplicatePairs: [],
    });
    mockEdgeExtractionService.extractEdges.mockResolvedValue([]);
    mockEntityEdgeRepository.searchByFact.mockResolvedValue([]);
    mockEntityEdgeRepository.searchBySimilarity.mockResolvedValue([]);
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

    const saveOrder = mockEpisodicNodeRepository.save.mock.invocationCallOrder[0];
    const extractOrder =
      mockNodeExtractionService.extractNodes.mock.invocationCallOrder[0];

    expect(saveOrder).toBeLessThan(extractOrder);
  });

  it('should call extractNodes with model, episode, and previousEpisodes', async () => {
    const prevEpisode = KgNodeFactory.createEpisodicNode({
      name: 'Test Episode',
      content: 'Alice works at Acme Corp.',
      validAt: KG_REFERENCE_TIME,
      groupId: KG_TEST_GROUP_ID,
    });
    mockEpisodicNodeRepository.retrieveEpisodes.mockResolvedValue([prevEpisode]);

    await service.addEpisode(baseOptions);

    expect(mockNodeExtractionService.extractNodes).toHaveBeenCalledWith(
      mockModel,
      expect.objectContaining({
        name: 'Test Episode',
        groupId: KG_TEST_GROUP_ID,
      }),
      [prevEpisode],
      undefined,
      undefined,
      undefined,
    );
  });

  it('should call embedNodes with extracted nodes', async () => {
    const node = KgNodeFactory.createEntityNode({ name: 'Alice' });
    mockNodeExtractionService.extractNodes.mockResolvedValue([node]);

    await service.addEpisode(baseOptions);

    expect(mockEmbeddingService.embedNodes).toHaveBeenCalledWith([node]);
  });

  it('should call resolveNodes with embedded nodes and search-based candidates', async () => {
    const extracted = KgNodeFactory.createEntityNode({ name: 'Alice' });
    const existing = KgNodeFactory.createEntityNode({ name: 'Bob' });
    const embedded = { ...extracted, nameEmbedding: [1, 0, 0] };

    mockNodeExtractionService.extractNodes.mockResolvedValue([extracted]);
    mockEmbeddingService.embedNodes.mockResolvedValue([embedded]);
    mockEntityNodeRepository.searchByName.mockResolvedValue([existing]);

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
    const resolvedNode = KgNodeFactory.createEntityNode({ name: 'Alice' });
    const existingNode = {
      ...KgNodeFactory.createEntityNode({ name: 'Bob' }),
      uuid: u('existing-bob-uuid'),
    };
    const uuidMap = new Map<Uuid, Uuid>([[u('temp-uuid'), existingNode.uuid]]);

    // Provide a non-empty embedNodes result so collectNodeCandidates fires a search
    mockNodeExtractionService.extractNodes.mockResolvedValue([resolvedNode]);
    mockEmbeddingService.embedNodes.mockResolvedValue([
      { ...resolvedNode, nameEmbedding: null },
    ]);
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [resolvedNode],
      uuidMap,
      duplicatePairs: [],
    });
    mockEntityNodeRepository.searchByName.mockResolvedValue([existingNode]);

    await service.addEpisode(baseOptions);

    expect(mockEdgeExtractionService.extractEdges).toHaveBeenCalledWith(
      mockModel,
      expect.anything(),
      expect.arrayContaining([resolvedNode, existingNode]),
      [],
      KG_REFERENCE_TIME,
      undefined,
      undefined,
      undefined,
    );
  });

  it('should call embedEdges with extracted edges', async () => {
    const node = KgNodeFactory.createEntityNode({ name: 'Alice' });
    const edge = KgEdgeFactory.createEntityEdge({
      name: 'WORKS_AT',
      sourceNodeUuid: node.uuid,
      targetNodeUuid: u('target-uuid'),
      fact: 'Alice works at Acme Corp',
    });
    mockEdgeExtractionService.extractEdges.mockResolvedValue([edge]);

    await service.addEpisode(baseOptions);

    expect(mockEmbeddingService.embedEdges).toHaveBeenCalledWith([edge]);
  });

  it('should call resolveEdges with embedded edges and uuidMap', async () => {
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
    const uuidMap = new Map<Uuid, Uuid>();

    mockEmbeddingService.embedEdges.mockResolvedValue([embeddedEdge]);
    mockEntityEdgeRepository.searchByFact.mockResolvedValue([existingEdge]);
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [],
      uuidMap,
      duplicatePairs: [],
    });

    await service.addEpisode(baseOptions);

    expect(mockEdgeResolutionService.resolveEdges).toHaveBeenCalledWith(
      mockModel,
      expect.anything(),
      [embeddedEdge],
      [existingEdge],
      uuidMap,
      KG_REFERENCE_TIME,
      [],
      undefined,
    );
  });

  it('should call withStructuredOutput for node summaries when resolved nodes exist', async () => {
    const node = KgNodeFactory.createEntityNode({ name: 'Alice' });
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [node],
      uuidMap: new Map(),
      duplicatePairs: [],
    });
    mockRunnable.invoke.mockResolvedValue({
      summaries: [{ uuid: node.uuid, summary: 'Alice is an engineer' }],
    });

    await service.addEpisode(baseOptions);

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
  });

  it('should apply returned summaries to resolved nodes before save', async () => {
    const node = KgNodeFactory.createEntityNode({ name: 'Alice' });
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [node],
      uuidMap: new Map(),
      duplicatePairs: [],
    });
    mockRunnable.invoke.mockResolvedValue({
      summaries: [{ uuid: node.uuid, summary: 'Alice is an engineer' }],
    });

    await service.addEpisode(baseOptions);

    const savedNodes = mockEntityNodeRepository.saveBulk.mock.calls[0][0];
    expect(savedNodes[0].summary).toBe('Alice is an engineer');
  });

  it('should save invalidated edges via entityEdgeRepository.saveBulk', async () => {
    const invalidated = KgEdgeFactory.createEntityEdge({
      name: 'WORKS_AT',
      sourceNodeUuid: u('src'),
      targetNodeUuid: u('tgt'),
      fact: 'Alice works at Acme Corp',
    });
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
    const resolvedNode = KgNodeFactory.createEntityNode({ name: 'Alice' });
    const existingNode = {
      ...KgNodeFactory.createEntityNode({ name: 'Bob' }),
      uuid: u('bob-uuid'),
    };
    const uuidMap = new Map<Uuid, Uuid>([[u('some-uuid'), existingNode.uuid]]);

    // Provide a non-empty embedNodes result so collectNodeCandidates fires a search
    mockNodeExtractionService.extractNodes.mockResolvedValue([resolvedNode]);
    mockEmbeddingService.embedNodes.mockResolvedValue([
      { ...resolvedNode, nameEmbedding: null },
    ]);
    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [resolvedNode],
      uuidMap,
      duplicatePairs: [],
    });
    mockEntityNodeRepository.searchByName.mockResolvedValue([existingNode]);

    await service.addEpisode(baseOptions);

    const savedEpisodicEdges = mockEpisodicEdgeRepository.saveBulk.mock.calls[0][0];
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

    const baseSagaOptions = baseOptions;
    baseSagaOptions.episode.sagaUuid = KG_TEST_SAGA_UUID;
    await service.addEpisode({ ...baseSagaOptions });

    expect(mockHasEpisodeEdgeRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeUuid: KG_TEST_SAGA_UUID,
        groupId: KG_TEST_GROUP_ID,
      }),
    );
  });

  it('should call nextEpisodeEdgeRepository.save when previous episode exists in saga', async () => {
    const prevEpisode = KgNodeFactory.createEpisodicNode({
      name: 'Test Episode',
      content: 'Alice works at Acme Corp.',
      validAt: KG_REFERENCE_TIME,
      groupId: KG_TEST_GROUP_ID,
    });
    prevEpisode.uuid = u('prev-episode-uuid');

    mockSagaNodeRepository.save.mockResolvedValue('saga-uuid');
    mockHasEpisodeEdgeRepository.save.mockResolvedValue('has-episode-uuid');
    mockNextEpisodeEdgeRepository.save.mockResolvedValue('next-episode-uuid');

    mockEpisodicNodeRepository.retrieveEpisodes
      .mockResolvedValueOnce([]) // previousEpisodes
      .mockResolvedValueOnce([prevEpisode]); // saga previous episode

    const baseSagaOptions = baseOptions;
    baseSagaOptions.episode.sagaUuid = KG_TEST_SAGA_UUID;
    await service.addEpisode({ ...baseSagaOptions });

    expect(mockNextEpisodeEdgeRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeUuid: prevEpisode.uuid,
        groupId: KG_TEST_GROUP_ID,
      }),
    );
  });

  it('should not call nextEpisodeEdgeRepository.save when no previous episode in saga', async () => {
    mockSagaNodeRepository.save.mockResolvedValue('saga-uuid');
    mockHasEpisodeEdgeRepository.save.mockResolvedValue('has-episode-uuid');

    mockEpisodicNodeRepository.retrieveEpisodes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const baseSagaOptions = baseOptions;
    baseSagaOptions.episode.sagaUuid = KG_TEST_SAGA_UUID;
    await service.addEpisode({ ...baseSagaOptions });

    expect(mockNextEpisodeEdgeRepository.save).not.toHaveBeenCalled();
  });

  it('should return episode, nodes, edges, and episodicEdges', async () => {
    const node = KgNodeFactory.createEntityNode({ name: 'Alice' });
    const edge = KgEdgeFactory.createEntityEdge({
      name: 'WORKS_AT',
      sourceNodeUuid: node.uuid,
      targetNodeUuid: u('target'),
      fact: 'Alice works at Acme Corp',
    });

    mockNodeResolutionService.resolveNodes.mockResolvedValue({
      resolvedNodes: [node],
      uuidMap: new Map(),
      duplicatePairs: [],
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
      duplicatePairs: [],
    });

    await service.addEpisode(baseOptions);

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
  });

  it('should not call communityService.buildCommunities by default', async () => {
    await service.addEpisode(baseOptions);

    expect(mockCommunityService.buildCommunities).not.toHaveBeenCalled();
  });

  it('should call communityService.buildCommunities when updateCommunities is true', async () => {
    await service.addEpisode({ ...baseOptions, updateCommunities: true });

    expect(mockCommunityService.buildCommunities).toHaveBeenCalledWith(
      KG_TEST_USER_ID,
      KG_TEST_GROUP_ID,
    );
  });

  it('should call communityService.buildCommunities after persist when updateCommunities is true', async () => {
    await service.addEpisode({ ...baseOptions, updateCommunities: true });

    const persistOrder = mockEntityNodeRepository.saveBulk.mock.invocationCallOrder[0];
    const communityOrder =
      mockCommunityService.buildCommunities.mock.invocationCallOrder[0];
    expect(persistOrder).toBeLessThan(communityOrder);
  });
});
