import {
  KG_REFERENCE_TIME,
  KG_TEST_GROUP_ID,
  KgNodeFactory,
} from '@/test/factories';

import { buildDedupeEdgesMessages } from './dedupe-edges.prompts';

const baseEpisode = KgNodeFactory.createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice joined Acme Corp as CEO.',
  groupId: KG_TEST_GROUP_ID,
});

const newEdge = {
  name: 'WORKS_AT',
  fact: 'Alice is the CEO of Acme Corp',
};

const endpointEdges = [
  {
    idx: 0,
    name: 'WORKS_AT',
    fact: 'Alice was an engineer at Acme Corp',
  },
];

const similarEdges = [
  {
    idx: 1,
    name: 'WORKS_AT',
    fact: 'Alice leads the engineering team at Acme Corp',
  },
];

describe('buildDedupeEdgesMessages', () => {
  it('should return system and human messages', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: endpointEdges,
      similarEdges,
      referenceTime: KG_REFERENCE_TIME,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].getType()).toBe('system');
    expect(messages[1].getType()).toBe('human');
  });

  it('should include new fact name and content in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges: [],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages[1];
    expect(human.content).toContain('WORKS_AT');
    expect(human.content).toContain('Alice is the CEO of Acme Corp');
  });

  it('should include reference time ISO string in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges: [],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages[1];
    expect(human.content).toContain(KG_REFERENCE_TIME.toISOString());
  });

  it('should list existing endpoint edges with idx in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: endpointEdges,
      similarEdges: [],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages[1];
    expect(human.content).toContain('idx: 0');
    expect(human.content).toContain('Alice was an engineer at Acme Corp');
  });

  it('should render "None" for empty existing endpoint edges', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges: [],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages[1];
    expect(human.content).toContain('None');
  });

  it('should list similar edges with idx in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      existingEndpointEdges: [],
      similarEdges,
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages[1];
    expect(human.content).toContain('idx: 1');
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
      referenceTime: KG_REFERENCE_TIME,
      customInstructions: 'Be conservative with contradictions.',
    });
    const human = messages[1];
    expect(human.content).toContain('Be conservative with contradictions.');
  });
});
