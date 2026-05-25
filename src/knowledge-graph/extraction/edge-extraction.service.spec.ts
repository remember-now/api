import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { NoOpLlmTracer } from '@/observability';
import { KG_REFERENCE_TIME, KG_TEST_GRAPH_ID, KgNodeFactory } from '@/test/factories';

import { EdgeExtractionService } from './edge-extraction.service';

const baseEpisode = KgNodeFactory.createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp. Bob is the CEO of Acme Corp.',
  graphId: KG_TEST_GRAPH_ID,
});

const aliceNode = KgNodeFactory.createEntityNode({
  name: 'Alice',
  graphId: KG_TEST_GRAPH_ID,
});
const bobNode = KgNodeFactory.createEntityNode({
  name: 'Bob',
  graphId: KG_TEST_GRAPH_ID,
});
const acmeNode = KgNodeFactory.createEntityNode({
  name: 'Acme Corp',
  graphId: KG_TEST_GRAPH_ID,
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

  it('should return EntityEdge[] matching source/target ids', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          sourceEntityName: 'Alice',
          targetEntityName: 'Acme Corp',
          relationType: 'WORKS_AT',
          fact: 'Alice works at Acme Corp.',
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
    expect(edges[0].sourceNodeId).toBe(aliceNode.id);
    expect(edges[0].targetNodeId).toBe(acmeNode.id);
    expect(edges[0].name).toBe('WORKS_AT');
    expect(edges[0].fact).toBe('Alice works at Acme Corp.');
    expect(edges[0].graphId).toBe(KG_TEST_GRAPH_ID);
  });

  it('should pass validAt/invalidAt from LLM response to edge', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          sourceEntityName: 'Alice',
          targetEntityName: 'Acme Corp',
          relationType: 'WORKS_AT',
          fact: 'Alice works at Acme Corp.',
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
          sourceEntityName: 'Alice',
          targetEntityName: 'Acme Corp',
          relationType: 'WORKS_AT',
          fact: 'Alice works at Acme Corp.',
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
          sourceEntityName: 'Unknown Person',
          targetEntityName: 'Acme Corp',
          relationType: 'WORKS_AT',
          fact: 'Someone works at Acme.',
        },
        {
          sourceEntityName: 'Alice',
          targetEntityName: 'Acme Corp',
          relationType: 'WORKS_AT',
          fact: 'Alice works at Acme Corp.',
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
    expect(edges[0].sourceNodeId).toBe(aliceNode.id);
  });

  it('should filter edges with unrecognized target names', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          sourceEntityName: 'Alice',
          targetEntityName: 'Unknown Corp',
          relationType: 'WORKS_AT',
          fact: 'Alice works somewhere.',
        },
        {
          sourceEntityName: 'Bob',
          targetEntityName: 'Acme Corp',
          relationType: 'CEO_OF',
          fact: 'Bob is the CEO of Acme Corp.',
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
    expect(edges[0].sourceNodeId).toBe(bobNode.id);
    expect(edges[0].targetNodeId).toBe(acmeNode.id);
  });

  it('should be case-insensitive for name matching', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          sourceEntityName: 'alice',
          targetEntityName: 'acme corp',
          relationType: 'WORKS_AT',
          fact: 'Alice works at Acme Corp.',
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
    expect(edges[0].sourceNodeId).toBe(aliceNode.id);
    expect(edges[0].targetNodeId).toBe(acmeNode.id);
  });

  it('should set episodes to [episode.id] on each extracted edge', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          sourceEntityName: 'Alice',
          targetEntityName: 'Acme Corp',
          relationType: 'WORKS_AT',
          fact: 'Alice works at Acme Corp.',
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

    expect(edges[0].episodes).toEqual([baseEpisode.id]);
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

  it('should assign id to each returned edge', async () => {
    mockRunnable.invoke.mockResolvedValue({
      edges: [
        {
          sourceEntityName: 'Alice',
          targetEntityName: 'Acme Corp',
          relationType: 'WORKS_AT',
          fact: 'Alice works at Acme Corp.',
        },
        {
          sourceEntityName: 'Bob',
          targetEntityName: 'Acme Corp',
          relationType: 'CEO_OF',
          fact: 'Bob is CEO of Acme Corp.',
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
    edges.forEach((e) => expect(e.id).toBeTruthy());
    expect(edges[0].id).not.toBe(edges[1].id);
  });
});
