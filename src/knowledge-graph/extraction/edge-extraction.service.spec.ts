import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { NoOpLlmTracer } from '@/observability';
import { KG_REFERENCE_TIME, KG_TEST_GROUP_ID, KgNodeFactory } from '@/test/factories';

import { EdgeExtractionService } from './edge-extraction.service';

const baseEpisode = KgNodeFactory.createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp. Bob is the CEO of Acme Corp.',
  groupId: KG_TEST_GROUP_ID,
});

const aliceNode = KgNodeFactory.createEntityNode({
  name: 'Alice',
  groupId: KG_TEST_GROUP_ID,
});
const bobNode = KgNodeFactory.createEntityNode({
  name: 'Bob',
  groupId: KG_TEST_GROUP_ID,
});
const acmeNode = KgNodeFactory.createEntityNode({
  name: 'Acme Corp',
  groupId: KG_TEST_GROUP_ID,
});
const nodes = [aliceNode, bobNode, acmeNode];

describe('EdgeExtractionService', () => {
  let service: EdgeExtractionService;
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    service = new EdgeExtractionService(new NoOpLlmTracer());
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

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeUuid).toBe(aliceNode.uuid);
    expect(edges[0].targetNodeUuid).toBe(acmeNode.uuid);
    expect(edges[0].name).toBe('WORKS_AT');
    expect(edges[0].fact).toBe('Alice works at Acme Corp.');
    expect(edges[0].groupId).toBe(KG_TEST_GROUP_ID);
  });

  it('should pass validAt/invalidAt from LLM response to edge', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          source: 'Alice',
          target: 'Acme Corp',
          name: 'WORKS_AT',
          description: 'Alice works at Acme Corp.',
          validAt: '2024-01-01T00:00:00.000Z',
          invalidAt: '2024-06-01T00:00:00.000Z',
        },
      ],
    });

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

    expect(edges[0].validAt).toEqual(new Date('2024-01-01T00:00:00.000Z'));
    expect(edges[0].invalidAt).toEqual(new Date('2024-06-01T00:00:00.000Z'));
  });

  it('should set validAt/invalidAt to null when not provided', async () => {
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

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

    expect(edges[0].validAt).toBeNull();
    expect(edges[0].invalidAt).toBeNull();
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

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

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

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

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

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeUuid).toBe(aliceNode.uuid);
    expect(edges[0].targetNodeUuid).toBe(acmeNode.uuid);
  });

  it('should set episodes to [episode.uuid] on each extracted edge', async () => {
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

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

    expect(edges[0].episodes).toEqual([baseEpisode.uuid]);
  });

  it('should return empty array when no edges extracted', async () => {
    mockRunnable.invoke.mockResolvedValue({ edges: [] });

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

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

    const edges = await service.extractEdges(
      mockModel,
      baseEpisode,
      nodes,
      [],
      KG_REFERENCE_TIME,
    );

    expect(edges).toHaveLength(2);
    edges.forEach((e) => expect(e.uuid).toBeTruthy());
    expect(edges[0].uuid).not.toBe(edges[1].uuid);
  });
});
