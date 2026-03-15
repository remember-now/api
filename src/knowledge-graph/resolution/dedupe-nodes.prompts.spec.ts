import { createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { buildDedupeNodesMessages } from './dedupe-nodes.prompts';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

const extractedNodes = [
  { uuid: 'ext-uuid-1', name: 'Alice' },
  { uuid: 'ext-uuid-2', name: 'Acme Corp' },
];

const candidateNodes = [{ uuid: 'cand-uuid-1', name: 'Alice Smith' }];

describe('buildDedupeNodesMessages', () => {
  it('should return system and human messages', () => {
    const messages = buildDedupeNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      extractedNodes,
      candidateNodes,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].getType()).toBe('system');
    expect(messages[1].getType()).toBe('human');
  });

  it('should include extracted entity uuid and name in human message', () => {
    const messages = buildDedupeNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      extractedNodes,
      candidateNodes: [],
    });
    const human = messages[1];
    expect(human.content).toContain('ext-uuid-1');
    expect(human.content).toContain('Alice');
    expect(human.content).toContain('ext-uuid-2');
    expect(human.content).toContain('Acme Corp');
  });

  it('should include candidate entity uuid and name in human message', () => {
    const messages = buildDedupeNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      extractedNodes,
      candidateNodes,
    });
    const human = messages[1];
    expect(human.content).toContain('cand-uuid-1');
    expect(human.content).toContain('Alice Smith');
  });

  it('should render "None" for empty candidates without crash', () => {
    const messages = buildDedupeNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      extractedNodes,
      candidateNodes: [],
    });
    const human = messages[1];
    expect(human.content).toContain('None');
  });

  it('should include "duplicate" in system message', () => {
    const messages = buildDedupeNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      extractedNodes,
      candidateNodes,
    });
    const system = messages[0];
    expect(system.content).toContain('duplicate');
  });

  it('should include custom instructions in human message', () => {
    const messages = buildDedupeNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      extractedNodes,
      candidateNodes,
      customInstructions: 'Only merge exact name matches.',
    });
    const human = messages[1];
    expect(human.content).toContain('Only merge exact name matches.');
  });

  it('should include previous episode content when provided', () => {
    const prev = createEpisodicNode({
      name: 'Prev Episode',
      content: 'Bob was here.',
      validAt: new Date('2023-12-01'),
      groupId: 'group-1',
    });
    const messages = buildDedupeNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [prev],
      extractedNodes,
      candidateNodes,
    });
    const human = messages[1];
    expect(human.content).toContain('Bob was here.');
  });
});
