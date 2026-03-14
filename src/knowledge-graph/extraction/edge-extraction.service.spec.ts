import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { createEntityNode, createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { EdgeExtractionService } from './edge-extraction.service';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp. Bob is the CEO of Acme Corp.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

const aliceNode = createEntityNode({ name: 'Alice', groupId: 'group-1' });
const bobNode = createEntityNode({ name: 'Bob', groupId: 'group-1' });
const acmeNode = createEntityNode({ name: 'Acme Corp', groupId: 'group-1' });
const nodes = [aliceNode, bobNode, acmeNode];

describe('EdgeExtractionService', () => {
  let service: EdgeExtractionService;
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    service = new EdgeExtractionService();
    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  it('should return EntityEdge[] matching source/target uuids', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          source: 'Alice',
          target: 'Acme Corp',
          name: 'WORKS_AT',
          description: 'Alice works at Acme Corp.',
        },
      ],
    });

    const edges = await service.extractEdges(mockModel, baseEpisode, nodes, []);

    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeUuid).toBe(aliceNode.uuid);
    expect(edges[0].targetNodeUuid).toBe(acmeNode.uuid);
    expect(edges[0].name).toBe('WORKS_AT');
    expect(edges[0].fact).toBe('Alice works at Acme Corp.');
    expect(edges[0].groupId).toBe('group-1');
  });

  it('should filter edges with unrecognized source names', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          source: 'Unknown Person',
          target: 'Acme Corp',
          name: 'WORKS_AT',
          description: 'Someone works at Acme.',
        },
        {
          source: 'Alice',
          target: 'Acme Corp',
          name: 'WORKS_AT',
          description: 'Alice works at Acme Corp.',
        },
      ],
    });

    const edges = await service.extractEdges(mockModel, baseEpisode, nodes, []);

    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeUuid).toBe(aliceNode.uuid);
  });

  it('should filter edges with unrecognized target names', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          source: 'Alice',
          target: 'Unknown Corp',
          name: 'WORKS_AT',
          description: 'Alice works somewhere.',
        },
        {
          source: 'Bob',
          target: 'Acme Corp',
          name: 'CEO_OF',
          description: 'Bob is the CEO of Acme Corp.',
        },
      ],
    });

    const edges = await service.extractEdges(mockModel, baseEpisode, nodes, []);

    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeUuid).toBe(bobNode.uuid);
    expect(edges[0].targetNodeUuid).toBe(acmeNode.uuid);
  });

  it('should be case-insensitive for name matching', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          source: 'alice',
          target: 'acme corp',
          name: 'WORKS_AT',
          description: 'Alice works at Acme Corp.',
        },
      ],
    });

    const edges = await service.extractEdges(mockModel, baseEpisode, nodes, []);

    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeUuid).toBe(aliceNode.uuid);
    expect(edges[0].targetNodeUuid).toBe(acmeNode.uuid);
  });

  it('should return empty array when no edges extracted', async () => {
    mockRunnable.invoke.mockResolvedValue({ edges: [] });

    const edges = await service.extractEdges(mockModel, baseEpisode, nodes, []);

    expect(edges).toEqual([]);
  });

  it('should assign uuid to each returned edge', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          source: 'Alice',
          target: 'Acme Corp',
          name: 'WORKS_AT',
          description: 'Alice works at Acme Corp.',
        },
        {
          source: 'Bob',
          target: 'Acme Corp',
          name: 'CEO_OF',
          description: 'Bob is CEO of Acme Corp.',
        },
      ],
    });

    const edges = await service.extractEdges(mockModel, baseEpisode, nodes, []);

    expect(edges).toHaveLength(2);
    edges.forEach((e) => expect(e.uuid).toBeTruthy());
    expect(edges[0].uuid).not.toBe(edges[1].uuid);
  });
});
