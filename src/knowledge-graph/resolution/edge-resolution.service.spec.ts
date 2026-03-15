import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { mockDeep } from 'jest-mock-extended';

import { createEntityEdge, EntityEdge } from '../models/edges';
import { createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { EdgeResolutionService } from './edge-resolution.service';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice joined Acme Corp as CEO.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

const referenceTime = new Date('2024-01-01T12:00:00Z');
const HIGH_SIM = [1, 0, 0];
const NEAR_HIGH_SIM = [0.9999, 0.001, 0];

function makeEdge(
  overrides: Partial<EntityEdge> & { name: string },
): EntityEdge {
  return createEntityEdge({
    sourceNodeUuid: 'src-uuid',
    targetNodeUuid: 'tgt-uuid',
    groupId: 'group-1',
    ...overrides,
  });
}

describe('EdgeResolutionService', () => {
  let service: EdgeResolutionService;
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    service = new EdgeResolutionService();
    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  it('should collapse intra-batch exact duplicate to 1 edge', async () => {
    const edge1 = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
      episodes: ['ep-1'],
    });
    const edge2 = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme', // same fact
      factEmbedding: HIGH_SIM,
      episodes: ['ep-2'],
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge1, edge2],
      [],
      new Map(),
      referenceTime,
    );

    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.resolvedEdges[0].episodes).toContain('ep-1');
    expect(result.resolvedEdges[0].episodes).toContain('ep-2');
  });

  it('should remap source/target uuids via uuidMap', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
      sourceNodeUuid: 'old-src-uuid',
      targetNodeUuid: 'old-tgt-uuid',
    });

    const uuidMap = new Map([
      ['old-src-uuid', 'new-src-uuid'],
      ['old-tgt-uuid', 'new-tgt-uuid'],
    ]);

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      uuidMap,
      referenceTime,
    );

    expect(result.resolvedEdges[0].sourceNodeUuid).toBe('new-src-uuid');
    expect(result.resolvedEdges[0].targetNodeUuid).toBe('new-tgt-uuid');
  });

  it('should add edge to resolvedEdges when no candidates exist', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      new Map(),
      referenceTime,
    );

    expect(mockModel.withStructuredOutput).not.toHaveBeenCalled();
    expect(result.resolvedEdges).toHaveLength(1);
  });

  it('should drop edge from resolvedEdges when LLM returns it as duplicate', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
    });
    const existingEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme Corp',
      factEmbedding: NEAR_HIGH_SIM,
    });
    existingEdge.uuid = 'exist-edge-uuid';

    mockRunnable.invoke.mockResolvedValue({
      duplicate_fact_uuids: ['exist-edge-uuid'],
      contradicted_fact_uuids: [],
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [existingEdge],
      new Map(),
      referenceTime,
    );

    expect(result.resolvedEdges).toHaveLength(0);
    expect(result.invalidatedEdges).toHaveLength(0);
  });

  it('should add existing edge to invalidatedEdges with invalidAt set when LLM returns contradiction', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice is now CEO at Acme',
      factEmbedding: HIGH_SIM,
    });
    const existingEdge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice was an engineer at Acme',
      factEmbedding: NEAR_HIGH_SIM,
    });
    existingEdge.uuid = 'old-edge-uuid';

    mockRunnable.invoke.mockResolvedValue({
      duplicate_fact_uuids: [],
      contradicted_fact_uuids: ['old-edge-uuid'],
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [existingEdge],
      new Map(),
      referenceTime,
    );

    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.invalidatedEdges).toHaveLength(1);
    expect(result.invalidatedEdges[0].uuid).toBe('old-edge-uuid');
    expect(result.invalidatedEdges[0].invalidAt).toEqual(referenceTime);
  });

  it('should set factEmbedding on resolved edges', async () => {
    const edge = makeEdge({
      name: 'WORKS_AT',
      fact: 'Alice works at Acme',
      factEmbedding: HIGH_SIM,
    });

    const result = await service.resolveEdges(
      mockModel,
      baseEpisode,
      [edge],
      [],
      new Map(),
      referenceTime,
    );

    expect(result.resolvedEdges[0].factEmbedding).toEqual(HIGH_SIM);
  });
});
