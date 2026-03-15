import { createEntityNode, createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { buildExtractEdgesMessages } from './extract-edges.prompts';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp. Bob is the CEO of Acme Corp.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

const nodes = [
  createEntityNode({ name: 'Alice', groupId: 'group-1' }),
  createEntityNode({ name: 'Bob', groupId: 'group-1' }),
  createEntityNode({ name: 'Acme Corp', groupId: 'group-1' }),
];

const referenceTime = new Date('2024-01-01T00:00:00Z');

describe('buildExtractEdgesMessages', () => {
  it('should return system and human messages', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].getType()).toBe('system');
    expect(messages[1].getType()).toBe('human');
  });

  it('should include episode content in human message', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain(baseEpisode.content);
  });

  it('should include entity names in human message', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Alice');
    expect(human?.content).toContain('Bob');
    expect(human?.content).toContain('Acme Corp');
  });

  it('should include previous episode content when provided', () => {
    const prev = createEpisodicNode({
      name: 'Prev Episode',
      content: 'Alice joined Acme in 2020.',
      validAt: new Date('2023-12-01'),
      groupId: 'group-1',
    });
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [prev],
      referenceTime,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Alice joined Acme in 2020.');
  });

  it('should show "None" for previous episodes when empty', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('PREVIOUS EPISODES:\nNone');
  });

  it('should include custom instructions when provided', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime,
      customInstructions: 'Only extract employment relationships.',
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Only extract employment relationships.');
  });

  it('should include ENTITIES section header', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('ENTITIES:');
  });

  it('should handle empty nodes list', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes: [],
      previousEpisodes: [],
      referenceTime,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('ENTITIES:');
  });
});
