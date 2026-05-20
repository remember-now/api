import { KG_REFERENCE_TIME, KG_TEST_GRAPH_ID, KgNodeFactory } from '@/test/factories';

import { buildDedupeEdgesMessages } from './dedupe-edges.prompts';

const baseEpisode = KgNodeFactory.createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice joined Acme Corp as CEO.',
  graphId: KG_TEST_GRAPH_ID,
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
      sameDirectionEdges: endpointEdges,
      reversedDirectionEdges: [],
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
      sameDirectionEdges: [],
      reversedDirectionEdges: [],
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
      sameDirectionEdges: [],
      reversedDirectionEdges: [],
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
      sameDirectionEdges: endpointEdges,
      reversedDirectionEdges: [],
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
      sameDirectionEdges: [],
      reversedDirectionEdges: [],
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
      sameDirectionEdges: [],
      reversedDirectionEdges: [],
      similarEdges,
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages[1];
    expect(human.content).toContain('idx: 1');
    expect(human.content).toContain('Alice leads the engineering team at Acme Corp');
  });

  it('should list reversed-direction edges in their own section with correct indices', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      sameDirectionEdges: endpointEdges,
      reversedDirectionEdges: [
        { idx: 1, name: 'WORKS_AT', fact: 'Acme Corp employs Alice' },
      ],
      similarEdges: [{ idx: 2, name: 'WORKS_AT', fact: 'Alice leads engineering' }],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages[1].content as string;
    expect(human).toContain('REVERSED-DIRECTION FACTS');
    expect(human).toContain('idx: 1');
    expect(human).toContain('Acme Corp employs Alice');
    // Continuous indices: same(0) → reversed(1) → similar(2)
    expect(human).toContain('same source→target as new fact, index 0');
    expect(human).toContain('same nodes swapped, index 1');
    expect(human).toContain('similar topic, index 2');
  });

  it('should include custom instructions in human message', () => {
    const messages = buildDedupeEdgesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      newEdge,
      sameDirectionEdges: [],
      reversedDirectionEdges: [],
      similarEdges: [],
      referenceTime: KG_REFERENCE_TIME,
      customInstructions: 'Be conservative with contradictions.',
    });
    const human = messages[1];
    expect(human.content).toContain('Be conservative with contradictions.');
  });
});
