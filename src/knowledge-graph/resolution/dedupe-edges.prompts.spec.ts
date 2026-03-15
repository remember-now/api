import { createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { buildDedupeEdgesMessages } from './dedupe-edges.prompts';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice joined Acme Corp as CEO.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

const newEdge = {
  uuid: 'new-edge-uuid',
  name: 'WORKS_AT',
  fact: 'Alice is the CEO of Acme Corp',
};

const endpointEdges = [
  {
    uuid: 'exist-edge-1',
    name: 'WORKS_AT',
    fact: 'Alice was an engineer at Acme Corp',
  },
];

const similarEdges = [
  {
    uuid: 'similar-edge-1',
    name: 'WORKS_AT',
    fact: 'Alice leads the engineering team at Acme Corp',
  },
];

const referenceTime = new Date('2024-01-01T12:00:00Z');

describe('buildDedupeEdgesMessages', () => {
  it('should return system and human messages', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: endpointEdges,
      similarEdges,
      referenceTime,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].getType()).toBe('system');
    expect(messages[1].getType()).toBe('human');
  });

  it('should include new fact in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges: [],
      referenceTime,
    });
    const human = messages[1];
    expect(human.content).toContain('new-edge-uuid');
    expect(human.content).toContain('Alice is the CEO of Acme Corp');
  });

  it('should include reference time ISO string in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges: [],
      referenceTime,
    });
    const human = messages[1];
    expect(human.content).toContain(referenceTime.toISOString());
  });

  it('should list existing endpoint edges in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: endpointEdges,
      similarEdges: [],
      referenceTime,
    });
    const human = messages[1];
    expect(human.content).toContain('exist-edge-1');
    expect(human.content).toContain('Alice was an engineer at Acme Corp');
  });

  it('should render "None" for empty existing endpoint edges', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges: [],
      referenceTime,
    });
    const human = messages[1];
    expect(human.content).toContain('None');
  });

  it('should list similar edges in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges,
      referenceTime,
    });
    const human = messages[1];
    expect(human.content).toContain('similar-edge-1');
    expect(human.content).toContain(
      'Alice leads the engineering team at Acme Corp',
    );
  });

  it('should include custom instructions in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges: [],
      referenceTime,
      customInstructions: 'Be conservative with contradictions.',
    });
    const human = messages[1];
    expect(human.content).toContain('Be conservative with contradictions.');
  });
});
