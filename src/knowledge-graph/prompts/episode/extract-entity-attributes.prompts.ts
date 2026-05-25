import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

// Response schema is dynamic per call: the caller derives it from the matched
// EntityTypeMap entry's `schema` field at invocation time (see
// EpisodeService.extractEntityAttributesImpl), so no static schema is bound here.

const SYSTEM_PROMPT = `You are a helpful assistant that extracts entity properties from the provided text.

Extract only properties that are clearly mentioned in the text. Do not infer or hallucinate properties not present.`;

export function buildExtractEntityAttributesMessages(ctx: {
  episodeContent: string;
  previousEpisodesContent: string[];
  relatedFacts: string[];
  referenceTime: Date;
  existingAttributes: Record<string, unknown>;
}): BaseMessage[] {
  const {
    episodeContent,
    previousEpisodesContent,
    relatedFacts,
    referenceTime,
    existingAttributes,
  } = ctx;

  let humanContent = `EPISODE:\n${episodeContent}\n\n`;

  if (previousEpisodesContent.length > 0) {
    humanContent += `PREVIOUS EPISODES:\n${previousEpisodesContent.join('\n---\n')}\n\n`;
  }

  if (relatedFacts.length > 0) {
    humanContent += `RELATED FACTS:\n${relatedFacts.join('\n')}\n\n`;
  }

  humanContent +=
    `REFERENCE TIME: ${referenceTime.toISOString()}\n\n` +
    `EXISTING ATTRIBUTES:\n${JSON.stringify(existingAttributes, null, 2)}\n\n` +
    `Extract the entity properties from the text above. Only include properties explicitly mentioned.`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
