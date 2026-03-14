import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { NodeExtractionService } from './node-extraction.service';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp and knows Bob.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

describe('NodeExtractionService', () => {
  let service: NodeExtractionService;
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    service = new NodeExtractionService();
    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  it('should return EntityNode[] with correct names and groupId', async () => {
    mockRunnable.invoke.mockResolvedValue({
      extractedEntities: [
        { name: 'Alice' },
        { name: 'Acme Corp' },
        { name: 'Bob' },
      ],
    });

    const nodes = await service.extractNodes(mockModel, baseEpisode, []);

    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.name)).toEqual(['Alice', 'Acme Corp', 'Bob']);
    nodes.forEach((n) => expect(n.groupId).toBe('group-1'));
  });

  it('should filter empty names', async () => {
    mockRunnable.invoke.mockResolvedValue({
      extractedEntities: [
        { name: 'Alice' },
        { name: '' },
        { name: '   ' },
        { name: 'Bob' },
      ],
    });

    const nodes = await service.extractNodes(mockModel, baseEpisode, []);

    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.name)).toEqual(['Alice', 'Bob']);
  });

  it('should assign default Entity label when no entityTypes', async () => {
    mockRunnable.invoke.mockResolvedValue({
      extractedEntities: [{ name: 'Alice' }],
    });

    const nodes = await service.extractNodes(mockModel, baseEpisode, []);

    expect(nodes[0].labels).toEqual(['Entity']);
  });

  it('should assign correct labels from entityTypes map', async () => {
    const entityTypes = {
      Person: 'A human individual',
      Organization: 'A company or group',
    };
    mockRunnable.invoke.mockResolvedValue({
      extractedEntities: [
        { name: 'Alice', entityTypeId: 0 },
        { name: 'Acme Corp', entityTypeId: 1 },
      ],
    });

    const nodes = await service.extractNodes(
      mockModel,
      baseEpisode,
      [],
      entityTypes,
    );

    expect(nodes[0].labels).toEqual(['Person']);
    expect(nodes[1].labels).toEqual(['Organization']);
  });

  it('should fall back to Entity label for unknown entityTypeId', async () => {
    const entityTypes = { Person: 'A human individual' };
    mockRunnable.invoke.mockResolvedValue({
      extractedEntities: [{ name: 'Alice', entityTypeId: 99 }],
    });

    const nodes = await service.extractNodes(
      mockModel,
      baseEpisode,
      [],
      entityTypes,
    );

    expect(nodes[0].labels).toEqual(['Entity']);
  });

  it('should assign uuid to each returned node', async () => {
    mockRunnable.invoke.mockResolvedValue({
      extractedEntities: [{ name: 'Alice' }, { name: 'Bob' }],
    });

    const nodes = await service.extractNodes(mockModel, baseEpisode, []);

    nodes.forEach((n) => expect(n.uuid).toBeTruthy());
    expect(nodes[0].uuid).not.toBe(nodes[1].uuid);
  });

  it('should return empty array when no entities extracted', async () => {
    mockRunnable.invoke.mockResolvedValue({ extractedEntities: [] });

    const nodes = await service.extractNodes(mockModel, baseEpisode, []);

    expect(nodes).toEqual([]);
  });
});
