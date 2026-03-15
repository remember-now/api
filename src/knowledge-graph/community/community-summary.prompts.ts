import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

const SYSTEM_PROMPT = `You are an expert knowledge graph assistant. Given a list of entities that belong to the same community, generate a short name (≤ 50 chars) and summary (≤ 300 chars) for the community. Capture the common theme or relationship. Be concise and factual.`;

export function buildCommunitySummaryMessages(ctx: {
  nodes: Array<{ name: string; summary: string }>;
}): BaseMessage[] {
  const { nodes } = ctx;

  const entitiesText = nodes
    .map((n) => `- name: "${n.name}", summary: "${n.summary}"`)
    .join('\n');

  const humanContent = `ENTITIES:\n${entitiesText}`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
