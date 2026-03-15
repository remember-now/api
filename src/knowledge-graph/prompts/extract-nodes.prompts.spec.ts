import { createEpisodicNode } from '../models/nodes';
import { EpisodeType } from '../models/nodes/node.types';
import { buildExtractNodesMessages } from './extract-nodes.prompts';

const baseEpisode = createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp and knows Bob.',
  validAt: new Date('2024-01-01'),
  source: EpisodeType.text,
  groupId: 'group-1',
});

describe('buildExtractNodesMessages', () => {
  it('should return system and human messages', () => {
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].getType()).toBe('system');
    expect(messages[1].getType()).toBe('human');
  });

  it('should include episode content in human message', () => {
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain(baseEpisode.content);
  });

  it('should include episode name in human message', () => {
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain(baseEpisode.name);
  });

  it('should include previous episode content when provided', () => {
    const prev = createEpisodicNode({
      name: 'Prev Episode',
      content: 'Charlie was here.',
      validAt: new Date('2023-12-01'),
      groupId: 'group-1',
    });
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [prev],
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Charlie was here.');
  });

  it('should show "None" for previous episodes when empty', () => {
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('PREVIOUS EPISODES:\nNone');
  });

  it('should include entity types when provided', () => {
    const entityTypes = {
      Person: { description: 'A human individual' },
      Organization: { description: 'A company or group' },
    };
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      entityTypes,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('ENTITY TYPES:');
    expect(human?.content).toContain('"Person"');
    expect(human?.content).toContain('"Organization"');
  });

  it('should not include entity types section when not provided', () => {
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).not.toContain('ENTITY TYPES:');
  });

  it('should include custom instructions when provided', () => {
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
      customInstructions: 'Focus on people only.',
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Focus on people only.');
  });

  it('should vary system prompt for message source type', () => {
    const messageEpisode = createEpisodicNode({
      ...baseEpisode,
      source: EpisodeType.message,
    });
    const messages = buildExtractNodesMessages({
      episode: messageEpisode,
      previousEpisodes: [],
    });
    const system = messages.find((m) => m.getType() === 'system');
    expect(system?.content).toContain('conversational message');
  });

  it('should vary system prompt for json source type', () => {
    const jsonEpisode = createEpisodicNode({
      ...baseEpisode,
      source: EpisodeType.json,
    });
    const messages = buildExtractNodesMessages({
      episode: jsonEpisode,
      previousEpisodes: [],
    });
    const system = messages.find((m) => m.getType() === 'system');
    expect(system?.content).toContain('structured JSON data');
  });

  it('should vary system prompt for text source type', () => {
    const messages = buildExtractNodesMessages({
      episode: baseEpisode,
      previousEpisodes: [],
    });
    const system = messages.find((m) => m.getType() === 'system');
    expect(system?.content).toContain('text document');
  });
});
