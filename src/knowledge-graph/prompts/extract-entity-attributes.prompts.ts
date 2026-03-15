import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

const SYSTEM_PROMPT = `You are a helpful assistant that extracts entity properties from the provided text.

Extract only properties that are clearly mentioned in the text. Do not infer or hallucinate properties not present.`;

export function buildExtractEntityAttributesMessages(ctx: {
  fact: string;
  referenceTime: Date;
  existingAttributes: Record<string, unknown>;
}): BaseMessage[] {
  const { fact, referenceTime, existingAttributes } = ctx;

  const humanContent =
    `FACT:\n${fact}\n\n` +
    `REFERENCE TIME: ${referenceTime.toISOString()}\n\n` +
    `EXISTING ATTRIBUTES:\n${JSON.stringify(existingAttributes, null, 2)}\n\n` +
    `Extract the entity properties from the FACT text. Only include properties explicitly mentioned.`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
