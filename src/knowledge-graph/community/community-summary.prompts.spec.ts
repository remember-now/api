import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { buildCommunitySummaryMessages } from './community-summary.prompts';

describe('buildCommunitySummaryMessages', () => {
  const nodes = [
    { name: 'Alice', summary: 'An engineer at Acme' },
    { name: 'Bob', summary: 'A manager at Acme' },
  ];

  it('should return [system, human]', () => {
    const messages = buildCommunitySummaryMessages({ nodes });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect(messages[1]).toBeInstanceOf(HumanMessage);
  });

  it('should include entity name and summary in human message', () => {
    const messages = buildCommunitySummaryMessages({ nodes });
    const human = messages[1] as HumanMessage;
    const content = human.content as string;
    expect(content).toContain('Alice');
    expect(content).toContain('An engineer at Acme');
    expect(content).toContain('Bob');
    expect(content).toContain('A manager at Acme');
  });

  it('should include ENTITIES: section in human message', () => {
    const messages = buildCommunitySummaryMessages({ nodes });
    const human = messages[1] as HumanMessage;
    const content = human.content as string;
    expect(content).toContain('ENTITIES:');
  });
});
