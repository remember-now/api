import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

const SYSTEM_PROMPT = `You are a helpful assistant that extracts fact properties from the provided text.`;

export function buildExtractEdgeAttributesMessages(ctx: {
  fact: string;
  referenceTime: Date;
  existingAttributes: Record<string, unknown>;
}): BaseMessage[] {
  const { fact, referenceTime, existingAttributes } = ctx;

  const humanContent =
    `Given the following FACT, its REFERENCE TIME, and any EXISTING ATTRIBUTES, extract or update ` +
    `attributes based on the information explicitly stated in the fact.\n\n` +
    `Guidelines:\n` +
    `1. Do not hallucinate attribute values if they cannot be found explicitly in the fact.\n` +
    `2. Only use information stated in the FACT to set attribute values.\n` +
    `3. Use REFERENCE TIME to resolve any relative temporal expressions in the fact.\n` +
    `4. Preserve existing attribute values unless the fact explicitly provides new information.\n\n` +
    `<FACT>\n${fact}\n</FACT>\n\n` +
    `<REFERENCE_TIME>\n${referenceTime.toISOString()}\n</REFERENCE_TIME>\n\n` +
    `<EXISTING_ATTRIBUTES>\n${JSON.stringify(existingAttributes, null, 2)}\n</EXISTING_ATTRIBUTES>`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
