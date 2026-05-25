import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

// Response schema is dynamic per call: the caller derives it from the matched
// EdgeTypeMap entry's `schema` field at invocation time (see
// EpisodeService.extractEdgeAttributesImpl), so no static schema is bound here.

const SYSTEM_PROMPT =
  'You are a fact attribute extraction specialist. ' +
  'You ONLY emit attribute values that are explicitly stated in the FACT or ' +
  'already present in EXISTING ATTRIBUTES. You output strictly the JSON specified ' +
  'by the response schema - no reasoning, no explanation, no commentary in any field.';

export function buildExtractEdgeAttributesMessages(ctx: {
  fact: string;
  referenceTime: Date;
  existingAttributes: Record<string, unknown>;
}): BaseMessage[] {
  const { fact, referenceTime, existingAttributes } = ctx;

  const humanContent = `Given the following FACT, its REFERENCE TIME, and any EXISTING ATTRIBUTES, update the attributes.

HARD RULES - violating any of these is a failure:

1. Each attribute value MUST be one of:
   (a) a clean value copied or directly normalized from the FACT,
   (b) the existing value already in EXISTING ATTRIBUTES (preserved unchanged), or
   (c) null / omitted, when neither (a) nor (b) applies.

2. NEVER write reasoning, justification, or commentary into any field. Specifically:
   - NEVER include parenthetical explanations like "(implied by ...)", "(Context: ...)",
     "(not explicitly stated ...)", "(based on ...)".
   - NEVER include first-person or deliberative phrases like "I should...", "However...",
     "Sticking to...", "Since no...", "the instruction is to...", "must be kept...".
   - NEVER list alternatives or candidates inside one field ("X, or Y, or maybe Z").
   - NEVER explain why a value is null. If unknown, set the field to null and stop.

3. Each attribute schema description tells you the FORMAT a real value should take. The
   description text is NEVER itself a value. NEVER copy schema description text into the field.

4. The literal strings "null", "N/A", "Not specified", "unknown", "none", "not provided",
   or any sentence describing absence are NOT valid values. If no value is supported by
   the FACT, set the field to null (or omit it) - do not write a sentence.

5. Each attribute value must be a short, well-formed instance of the type the field
   describes. If you cannot produce a clean value of that type from the FACT, the field is null.

6. Use REFERENCE TIME to resolve any relative temporal expressions in the fact.

7. Preserve existing attribute values unless the FACT explicitly provides a new value.

<FACT>
${fact}
</FACT>

<REFERENCE TIME>
${referenceTime.toISOString()}
</REFERENCE TIME>

<EXISTING ATTRIBUTES>
${JSON.stringify(existingAttributes, null, 2)}
</EXISTING ATTRIBUTES>`;

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
