import { createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { buildNodeSummaryMessages } from './node-summary.prompts';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp and manages Bob.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

const baseNodes = [
  {
    uuid: 'uuid-alice',
    name: 'Alice',
    summary: '',
    facts: ['Alice manages the engineering team'],
  },
  {
    uuid: 'uuid-acme',
    name: 'Acme Corp',
    summary: 'A company',
    facts: [],
  },
];

describe('buildNodeSummaryMessages', () => {
  it('should return [system, human] messages', () => {
    const messages = buildNodeSummaryMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      nodes: baseNodes,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].getType()).toBe('system');
    expect(messages[1].getType()).toBe('human');
  });

  it('should include episode content in human message', () => {
    const messages = buildNodeSummaryMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      nodes: baseNodes,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain(baseEpisode.content);
  });

  it('should include entity uuid and name in human message', () => {
    const messages = buildNodeSummaryMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      nodes: baseNodes,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('uuid-alice');
    expect(human?.content).toContain('"Alice"');
    expect(human?.content).toContain('uuid-acme');
    expect(human?.content).toContain('"Acme Corp"');
  });

  it('should include facts per entity in human message', () => {
    const messages = buildNodeSummaryMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      nodes: baseNodes,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Alice manages the engineering team');
  });

  it('should show "None" when no previous episodes', () => {
    const messages = buildNodeSummaryMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      nodes: baseNodes,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('PREVIOUS EPISODES:\nNone');
  });

  it('should include previous episode content when provided', () => {
    const prev = createEpisodicNode({
      name: 'Prev Episode',
      content: 'Charlie was at the office.',
      validAt: new Date('2023-12-01'),
      groupId: 'group-1',
    });
    const messages = buildNodeSummaryMessages({
      episode: baseEpisode,
      previousEpisodes: [prev],
      nodes: baseNodes,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Charlie was at the office.');
    expect(human?.content).toContain('Prev Episode');
  });
});
