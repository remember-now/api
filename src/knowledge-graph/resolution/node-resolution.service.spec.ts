import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { createEntityNode, EntityNode } from '../models/nodes';
import { createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { NodeResolutionService } from './node-resolution.service';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

function makeNode(name: string, embedding: number[] | null = null): EntityNode {
  return createEntityNode({
    name,
    groupId: 'group-1',
    nameEmbedding: embedding,
  });
}

const HIGH_SIM_EMBEDDING = [1, 0, 0];
const NEAR_SAME_EMBEDDING = [0.9999, 0.001, 0]; // cosine similarity ≈ 0.9999 to HIGH_SIM
const DIFFERENT_EMBEDDING = [0, 1, 0]; // cosine similarity = 0 to HIGH_SIM

describe('NodeResolutionService', () => {
  let service: NodeResolutionService;
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    service = new NodeResolutionService();
    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  it('should resolve exact name match without LLM call', async () => {
    const extracted = [makeNode('Alice', HIGH_SIM_EMBEDDING)];
    const existing = [makeNode('alice', HIGH_SIM_EMBEDDING)]; // normalizes to same
    existing[0].uuid = 'existing-uuid';

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.uuidMap.get(extracted[0].uuid)).toBe('existing-uuid');
    expect(result.resolvedNodes).toHaveLength(0);
  });

  it('should resolve single cosine match above threshold without LLM call', async () => {
    const extracted = [makeNode('Alice Johnson', HIGH_SIM_EMBEDDING)];
    const existing = [makeNode('Alice J.', NEAR_SAME_EMBEDDING)];
    existing[0].uuid = 'cosine-uuid';

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.uuidMap.get(extracted[0].uuid)).toBe('cosine-uuid');
    expect(result.resolvedNodes).toHaveLength(0);
  });

  it('should escalate multiple cosine candidates to LLM', async () => {
    const extracted = [makeNode('Alice', HIGH_SIM_EMBEDDING)];
    const existing = [
      { ...makeNode('Alice Smith', NEAR_SAME_EMBEDDING), uuid: 'exist-1' },
      { ...makeNode('Alice Jones', NEAR_SAME_EMBEDDING), uuid: 'exist-2' },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entity_resolutions: [
        { uuid: extracted[0].uuid, duplicate_of: 'exist-1' },
      ],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
    expect(result.uuidMap.get(extracted[0].uuid)).toBe('exist-1');
  });

  it('should add node to resolvedNodes when LLM returns duplicate_of null', async () => {
    const extracted = [makeNode('Alice', HIGH_SIM_EMBEDDING)];
    const existing = [
      { ...makeNode('Alice Smith', NEAR_SAME_EMBEDDING), uuid: 'exist-1' },
      { ...makeNode('Alice Jones', NEAR_SAME_EMBEDDING), uuid: 'exist-2' },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entity_resolutions: [{ uuid: extracted[0].uuid, duplicate_of: null }],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(result.uuidMap.has(extracted[0].uuid)).toBe(false);
    expect(result.resolvedNodes).toContainEqual(
      expect.objectContaining({ uuid: extracted[0].uuid }),
    );
  });

  it('should map uuid when LLM returns duplicate_of existing uuid', async () => {
    const extracted = [makeNode('Alice', HIGH_SIM_EMBEDDING)];
    const existing = [
      { ...makeNode('Alice Smith', NEAR_SAME_EMBEDDING), uuid: 'exist-1' },
      { ...makeNode('Alice Jones', NEAR_SAME_EMBEDDING), uuid: 'exist-2' },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entity_resolutions: [
        { uuid: extracted[0].uuid, duplicate_of: 'exist-1' },
      ],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(result.uuidMap.get(extracted[0].uuid)).toBe('exist-1');
  });

  it('should bypass cosine for low-entropy names and go to LLM', async () => {
    // "NYC" has very low entropy — should skip cosine and go to LLM
    const extracted = [makeNode('NYC', HIGH_SIM_EMBEDDING)];
    const existing = [
      {
        ...makeNode('New York City', DIFFERENT_EMBEDDING),
        uuid: 'nyc-exist',
      },
    ];

    mockRunnable.invoke.mockResolvedValue({
      entity_resolutions: [
        { uuid: extracted[0].uuid, duplicate_of: 'nyc-exist' },
      ],
    });

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      existing,
    );

    expect(mockModel.withStructuredOutput).toHaveBeenCalled();
    expect(result.uuidMap.get(extracted[0].uuid)).toBe('nyc-exist');
  });

  it('should return all as new nodes with empty uuidMap when no existing nodes', async () => {
    const extracted = [
      makeNode('Alice', HIGH_SIM_EMBEDDING),
      makeNode('Bob', HIGH_SIM_EMBEDDING),
    ];

    const result = await service.resolveNodes(
      mockModel,
      baseEpisode,
      extracted,
      [],
    );

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.resolvedNodes).toHaveLength(2);
    expect(result.uuidMap.size).toBe(0);
  });
});
