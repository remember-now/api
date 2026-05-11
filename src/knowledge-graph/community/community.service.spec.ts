import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Test, TestingModule } from '@nestjs/testing';

import { LlmService } from '@/llm/llm.service';
import { KG_TEST_GROUP_ID, KG_TEST_USER_ID } from '@/test/factories';

import { EmbeddingService } from '../embedding';
import {
  CommunityEdgeRepository,
  CommunityNodeRepository,
  EntityEdgeRepository,
  EntityNodeRepository,
  GdsCommunityRepository,
} from '../neo4j/repositories';
import { Uuid } from '../neo4j/types';
import { CommunityService, communitySummaryJsonSchema } from './community.service';

describe('CommunityService', () => {
  let service: CommunityService;

  let mockLlmService: DeepMocked<LlmService>;
  let mockEmbeddingService: DeepMocked<EmbeddingService>;
  let mockEntityEdgeRepository: DeepMocked<EntityEdgeRepository>;
  let mockEntityNodeRepository: DeepMocked<EntityNodeRepository>;
  let mockCommunityNodeRepository: DeepMocked<CommunityNodeRepository>;
  let mockCommunityEdgeRepository: DeepMocked<CommunityEdgeRepository>;
  let mockGdsCommunityRepository: DeepMocked<GdsCommunityRepository>;

  let mockModel: DeepMocked<BaseChatModel>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunityService],
    })
      .useMocker(createMock)
      .compile();

    service = module.get(CommunityService);
    mockLlmService = module.get(LlmService);
    mockEmbeddingService = module.get(EmbeddingService);
    mockEntityEdgeRepository = module.get(EntityEdgeRepository);
    mockEntityNodeRepository = module.get(EntityNodeRepository);
    mockCommunityNodeRepository = module.get(CommunityNodeRepository);
    mockCommunityEdgeRepository = module.get(CommunityEdgeRepository);
    mockGdsCommunityRepository = module.get(GdsCommunityRepository);

    mockModel = createMock<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
    mockEmbeddingService.embedText.mockResolvedValue(null);

    mockLlmService.getActiveModel.mockResolvedValue(mockModel);
    mockCommunityNodeRepository.deleteByGroupId.mockResolvedValue(undefined);
    mockCommunityNodeRepository.saveBulk.mockResolvedValue(undefined);
    mockCommunityEdgeRepository.saveBulk.mockResolvedValue(undefined);
    mockEntityNodeRepository.getByUuids.mockResolvedValue([]);
    mockRunnable.invoke.mockResolvedValue({
      name: 'Tech Community',
      summary: 'A group of tech entities',
    });
  });

  describe('guard: no Entity edges exist', () => {
    beforeEach(() => {
      mockEntityEdgeRepository.hasRelatesEdgesForGroup.mockResolvedValue(false);
    });

    it('should return early without projecting GDS graph', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      expect(mockEntityEdgeRepository.hasRelatesEdgesForGroup).toHaveBeenCalledTimes(1);
      expect(mockGdsCommunityRepository.projectGraph).not.toHaveBeenCalled();
      expect(mockLlmService.getActiveModel).not.toHaveBeenCalled();
    });

    it('should call deleteByGroupId to clean up stale community data', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      expect(mockCommunityNodeRepository.deleteByGroupId).toHaveBeenCalledWith(
        KG_TEST_GROUP_ID,
      );
    });
  });

  describe('when Entity edges exist', () => {
    const leidenResults = [
      { uuid: 'entity-1' as Uuid, communityId: 0 },
      { uuid: 'entity-2' as Uuid, communityId: 0 },
      { uuid: 'entity-3' as Uuid, communityId: 1 },
    ];

    beforeEach(() => {
      mockEntityEdgeRepository.hasRelatesEdgesForGroup.mockResolvedValue(true);
      mockGdsCommunityRepository.projectGraph.mockResolvedValue(undefined);
      mockGdsCommunityRepository.runLeiden.mockResolvedValue(leidenResults);
      mockGdsCommunityRepository.dropGraph.mockResolvedValue(undefined);
    });

    it('should call GDS graph project with groupId', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      expect(mockGdsCommunityRepository.projectGraph).toHaveBeenCalledWith(
        expect.any(String),
        KG_TEST_GROUP_ID,
      );
    });

    it('should call Leiden stream', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      expect(mockGdsCommunityRepository.runLeiden).toHaveBeenCalledWith(
        expect.any(String),
      );
    });

    it('should call gds.graph.drop in finally', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      expect(mockGdsCommunityRepository.dropGraph).toHaveBeenCalledWith(
        expect.any(String),
      );
    });

    it('should drop graph even if Leiden throws', async () => {
      mockGdsCommunityRepository.runLeiden.mockRejectedValueOnce(
        new Error('Leiden failed'),
      );

      await expect(
        service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID),
      ).rejects.toThrow('Leiden failed');

      expect(mockGdsCommunityRepository.dropGraph).toHaveBeenCalled();
    });

    it('should call LLM once per community', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      // 2 communities: communityId 0 and communityId 1
      expect(mockRunnable.invoke).toHaveBeenCalledTimes(2);
    });

    it('should call withStructuredOutput with communitySummaryJsonSchema', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
        communitySummaryJsonSchema,
      );
    });

    it('should save community nodes with LLM name and summary', async () => {
      mockRunnable.invoke
        .mockResolvedValueOnce({ name: 'Tech Cluster', summary: 'Tech folks' })
        .mockResolvedValueOnce({ name: 'Biz Cluster', summary: 'Biz folks' });

      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      const savedNodes = mockCommunityNodeRepository.saveBulk.mock.calls[0][0];
      const names = savedNodes.map((n: { name: string }) => n.name);
      expect(names).toEqual(expect.arrayContaining(['Tech Cluster', 'Biz Cluster']));
    });

    it('should save community edges (HAS_MEMBER) for all member uuids', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      const savedEdges = mockCommunityEdgeRepository.saveBulk.mock.calls[0][0];
      const targetUuids = savedEdges.map(
        (e: { targetNodeUuid: string }) => e.targetNodeUuid,
      );
      expect(targetUuids).toEqual(
        expect.arrayContaining(['entity-1', 'entity-2', 'entity-3']),
      );
    });

    it('should call deleteByGroupId before saveBulk', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      const deleteOrder =
        mockCommunityNodeRepository.deleteByGroupId.mock.invocationCallOrder[0];
      const saveOrder = mockCommunityNodeRepository.saveBulk.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(saveOrder);
    });

    it('should save community nodes before community edges', async () => {
      await service.buildCommunities(KG_TEST_USER_ID, KG_TEST_GROUP_ID);

      const nodeOrder = mockCommunityNodeRepository.saveBulk.mock.invocationCallOrder[0];
      const edgeOrder = mockCommunityEdgeRepository.saveBulk.mock.invocationCallOrder[0];
      expect(nodeOrder).toBeLessThan(edgeOrder);
    });
  });
});
