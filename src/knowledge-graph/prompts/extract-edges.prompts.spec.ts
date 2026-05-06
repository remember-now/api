import {
  KG_REFERENCE_TIME,
  KG_TEST_GROUP_ID,
  KgNodeFactory,
} from '@/test/factories';

import { buildExtractEdgesMessages } from './extract-edges.prompts';

const baseEpisode = KgNodeFactory.createEpisodicNode({
  name: 'Test Episode',
  content: 'Alice works at Acme Corp. Bob is the CEO of Acme Corp.',
  groupId: KG_TEST_GROUP_ID,
});

const nodes = [
  KgNodeFactory.createEntityNode({ name: 'Alice', groupId: KG_TEST_GROUP_ID }),
  KgNodeFactory.createEntityNode({ name: 'Bob', groupId: KG_TEST_GROUP_ID }),
  KgNodeFactory.createEntityNode({
    name: 'Acme Corp',
    groupId: KG_TEST_GROUP_ID,
  }),
];

describe('buildExtractEdgesMessages', () => {
  it('should return system and human messages', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime: KG_REFERENCE_TIME,
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
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain(baseEpisode.content);
  });

  it('should include entity names in human message', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Alice');
    expect(human?.content).toContain('Bob');
    expect(human?.content).toContain('Acme Corp');
  });

  it('should include previous episode content when provided', () => {
    const prev = KgNodeFactory.createEpisodicNode({
      name: 'Prev Episode',
      content: 'Alice joined Acme in 2020.',
      validAt: new Date('2023-12-01'),
      groupId: KG_TEST_GROUP_ID,
    });
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [prev],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('Alice joined Acme in 2020.');
  });

  it('should show "None" for previous episodes when empty', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('PREVIOUS EPISODES:\nNone');
  });

  it('should include custom instructions when provided', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes,
      previousEpisodes: [],
      referenceTime: KG_REFERENCE_TIME,
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
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('ENTITIES:');
  });

  it('should handle empty nodes list', () => {
    const messages = buildExtractEdgesMessages({
      episode: baseEpisode,
      nodes: [],
      previousEpisodes: [],
      referenceTime: KG_REFERENCE_TIME,
    });
    const human = messages.find((m) => m.getType() === 'human');
    expect(human?.content).toContain('ENTITIES:');
  });
});
