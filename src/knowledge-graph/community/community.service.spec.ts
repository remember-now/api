import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { LlmService } from '@/llm/llm.service';

import { Neo4jService } from '../neo4j/neo4j.service';
import {
  CommunityEdgeRepository,
  CommunityNodeRepository,
  EntityNodeRepository,
} from '../neo4j/repositories';
import {
  CommunityService,
  communitySummaryJsonSchema,
} from './community.service';

const GROUP_ID = 'group-1';
const USER_ID = 42;

describe('CommunityService', () => {
  let service: CommunityService;

  let mockLlmService: ReturnType<typeof mockDeep<LlmService>>;
  let mockNeo4jService: ReturnType<typeof mockDeep<Neo4jService>>;
  let mockEntityNodeRepository: ReturnType<
    typeof mockDeep<EntityNodeRepository>
  >;
  let mockCommunityNodeRepository: ReturnType<
    typeof mockDeep<CommunityNodeRepository>
  >;
  let mockCommunityEdgeRepository: ReturnType<
    typeof mockDeep<CommunityEdgeRepository>
  >;

  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    mockLlmService = mockDeep<LlmService>();
    mockNeo4jService = mockDeep<Neo4jService>();
    mockEntityNodeRepository = mockDeep<EntityNodeRepository>();
    mockCommunityNodeRepository = mockDeep<CommunityNodeRepository>();
    mockCommunityEdgeRepository = mockDeep<CommunityEdgeRepository>();

    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);

    service = new CommunityService(
      mockLlmService,
      mockNeo4jService,
      mockEntityNodeRepository,
      mockCommunityNodeRepository,
      mockCommunityEdgeRepository,
    );

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
      mockNeo4jService.runQuery.mockResolvedValue([{ hasEdges: false }]);
    });

    it('should return early without projecting GDS graph', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      // Only the guard query should be called
      expect(mockNeo4jService.runQuery).toHaveBeenCalledTimes(1);
      expect(mockLlmService.getActiveModel).not.toHaveBeenCalled();
    });

    it('should call deleteByGroupId to clean up stale community data', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      expect(mockCommunityNodeRepository.deleteByGroupId).toHaveBeenCalledWith(
        GROUP_ID,
      );
    });
  });

  describe('when Entity edges exist', () => {
    const leidenResults = [
      { uuid: 'entity-1', communityId: 0 },
      { uuid: 'entity-2', communityId: 0 },
      { uuid: 'entity-3', communityId: 1 },
    ];

    beforeEach(() => {
      mockNeo4jService.runQuery
        .mockResolvedValueOnce([{ hasEdges: true }]) // guard
        .mockResolvedValueOnce([]) // GDS project
        .mockResolvedValueOnce(leidenResults) // Leiden stream
        .mockResolvedValueOnce([]); // graph drop
    });

    it('should call GDS graph project cypher', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      const projectCall = mockNeo4jService.runQuery.mock.calls[1];
      expect(projectCall[0]).toContain('gds.graph.project');
      expect(projectCall[1]).toMatchObject({ groupId: GROUP_ID });
    });

    it('should call Leiden stream cypher', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      const leidenCall = mockNeo4jService.runQuery.mock.calls[2];
      expect(leidenCall[0]).toContain('gds.leiden.stream');
    });

    it('should call gds.graph.drop in finally', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      const dropCall = mockNeo4jService.runQuery.mock.calls[3];
      expect(dropCall[0]).toContain('gds.graph.drop');
    });

    it('should drop graph even if Leiden throws', async () => {
      mockNeo4jService.runQuery.mockReset();
      mockNeo4jService.runQuery
        .mockResolvedValueOnce([{ hasEdges: true }])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Leiden failed'))
        .mockResolvedValueOnce([]);

      await expect(service.buildCommunities(USER_ID, GROUP_ID)).rejects.toThrow(
        'Leiden failed',
      );

      const dropCall = mockNeo4jService.runQuery.mock.calls[3];
      expect(dropCall[0]).toContain('gds.graph.drop');
    });

    it('should call LLM once per community', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      // 2 communities: communityId 0 and communityId 1
      expect(mockRunnable.invoke).toHaveBeenCalledTimes(2);
    });

    it('should call withStructuredOutput with communitySummaryJsonSchema', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
        communitySummaryJsonSchema,
      );
    });

    it('should save community nodes with LLM name and summary', async () => {
      mockRunnable.invoke
        .mockResolvedValueOnce({ name: 'Tech Cluster', summary: 'Tech folks' })
        .mockResolvedValueOnce({ name: 'Biz Cluster', summary: 'Biz folks' });

      await service.buildCommunities(USER_ID, GROUP_ID);

      const savedNodes = mockCommunityNodeRepository.saveBulk.mock.calls[0][0];
      const names = savedNodes.map((n: { name: string }) => n.name);
      expect(names).toEqual(
        expect.arrayContaining(['Tech Cluster', 'Biz Cluster']),
      );
    });

    it('should save community edges (HAS_MEMBER) for all member uuids', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      const savedEdges = mockCommunityEdgeRepository.saveBulk.mock.calls[0][0];
      const targetUuids = savedEdges.map(
        (e: { targetNodeUuid: string }) => e.targetNodeUuid,
      );
      expect(targetUuids).toEqual(
        expect.arrayContaining(['entity-1', 'entity-2', 'entity-3']),
      );
    });

    it('should call deleteByGroupId before saveBulk', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      const deleteOrder =
        mockCommunityNodeRepository.deleteByGroupId.mock.invocationCallOrder[0];
      const saveOrder =
        mockCommunityNodeRepository.saveBulk.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(saveOrder);
    });

    it('should save community nodes before community edges', async () => {
      await service.buildCommunities(USER_ID, GROUP_ID);

      const nodeOrder =
        mockCommunityNodeRepository.saveBulk.mock.invocationCallOrder[0];
      const edgeOrder =
        mockCommunityEdgeRepository.saveBulk.mock.invocationCallOrder[0];
      expect(nodeOrder).toBeLessThan(edgeOrder);
    });
  });
});
