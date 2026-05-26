import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { EpisodicNode } from '@/knowledge-graph/models';
import { NodeNameSchema } from '@/knowledge-graph/types';

import { formatCurrentEpisode, formatPreviousEpisodes } from '../text-utils';

// Schema

const NodeResolutionSchema = z.object({
  id: z.number().describe('integer id of the entity'),
  name: NodeNameSchema.describe(
    'Name of the entity. Should be the most complete and descriptive name of the entity. Do not include any JSON formatting in the Entity name such as {}.',
  ),
  duplicateCandidateId: z
    .number()
    .int()
    .describe(
      'candidateId of the matching EXISTING CANDIDATE ENTITY, or -1 if no duplicate exists.',
    ),
});

export const NodeResolutionsSchema = z.object({
  entityResolutions: z.array(NodeResolutionSchema).describe('List of resolved nodes'),
});

// Prompt builder

const SYSTEM_PROMPT = `You are an expert knowledge graph deduplication system.

Your task is to determine whether newly extracted entities are duplicates of existing entities in the knowledge graph.

Entities should only be considered duplicates if they refer to the *same real-world object or concept*.
Semantic Equivalence: if a descriptive label in EXISTING ENTITIES clearly refers to a named entity in context, treat them as duplicates.

NEVER mark entities as duplicates if:
- They are related but distinct.
- They have similar names or purposes but refer to separate instances or concepts.

Task:
1. Compare the NEW ENTITY against each EXISTING ENTITY (identified by 'candidateId').
2. If it refers to the same real-world object or concept, return the 'candidateId' of that match.
3. Return 'duplicateCandidateId = -1' when there is no match or you are unsure.

<EXAMPLES>
<EXTRACTED ENTITIES>
- id: 0, name: "Sam", labels: [Entity, Person]
</EXTRACTED ENTITIES>
<EXISTING CANDIDATE ENTITIES>
- candidateId: 0, name: "Sam", labels: [Entity, Person]
</EXISTING CANDIDATE ENTITIES>
Result: {"entityResolutions": [{"id": 0, "name": "Sam", "duplicateCandidateId": 0}]}
(exact name match - same person)

<EXTRACTED ENTITIES>
- id: 0, name: "NYC", labels: [Entity, Location]
</EXTRACTED ENTITIES>
<EXISTING CANDIDATE ENTITIES>
- candidateId: 0, name: "New York City", labels: [Entity, Location]
- candidateId: 1, name: "New York Knicks", labels: [Entity, Organization]
</EXISTING CANDIDATE ENTITIES>
Result: {"entityResolutions": [{"id": 0, "name": "New York City", "duplicateCandidateId": 0}]}
(abbreviation - same location; canonical name preferred over the abbreviation; labels rule out the same-named Organization)

<EXTRACTED ENTITIES>
- id: 0, name: "Java", labels: [Entity, ProgrammingLanguage]
</EXTRACTED ENTITIES>
<EXISTING CANDIDATE ENTITIES>
- candidateId: 0, name: "Java", labels: [Entity, Location]
</EXISTING CANDIDATE ENTITIES>
Result: {"entityResolutions": [{"id": 0, "name": "Java", "duplicateCandidateId": -1}]}
(same name but distinct concepts - labels disambiguate: programming language vs island)

<EXTRACTED ENTITIES>
- id: 0, name: "Alice", labels: [Entity, Person]
- id: 1, name: "Bob", labels: [Entity, Person]
</EXTRACTED ENTITIES>
<EXISTING CANDIDATE ENTITIES>
- candidateId: 0, name: "Alice Smith", labels: [Entity, Person]
</EXISTING CANDIDATE ENTITIES>
Result: {"entityResolutions": [{"id": 0, "name": "Alice Smith", "duplicateCandidateId": 0}, {"id": 1, "name": "Bob", "duplicateCandidateId": -1}]}
(batch: Alice matches the existing candidate, fuller name preferred; Bob has no candidate match)
</EXAMPLES>
`;

function formatExtractedEntities(
  entities: Array<{ id: number; name: string; labels: readonly string[] }>,
): string {
  if (entities.length === 0) return 'None';
  return entities
    .map((e) => `- id: ${e.id}, name: "${e.name}", labels: [${e.labels.join(', ')}]`)
    .join('\n');
}

function formatCandidateEntities(
  entities: Array<{ candidateId: number; name: string; labels: readonly string[] }>,
): string {
  if (entities.length === 0) return 'None';
  return entities
    .map(
      (e) =>
        `- candidateId: ${e.candidateId}, name: "${e.name}", labels: [${e.labels.join(', ')}]`,
    )
    .join('\n');
}

export function buildDedupeNodesMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  extractedNodes: Array<{ id: number; name: string; labels: readonly string[] }>;
  candidateNodes: Array<{
    candidateId: number;
    name: string;
    labels: readonly string[];
  }>;
  customInstructions?: string;
}): BaseMessage[] {
  const {
    episode,
    previousEpisodes,
    extractedNodes,
    candidateNodes,
    customInstructions,
  } = ctx;

  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);
  const extractedText = formatExtractedEntities(extractedNodes);
  const candidatesText = formatCandidateEntities(candidateNodes);

  let humanContent = `Apply every rule from the system instructions when resolving the extracted entities below against the candidate set.

<PREVIOUS EPISODES>
${previousEpisodesText}
</PREVIOUS EPISODES>

<CURRENT EPISODE>
${formatCurrentEpisode(episode)}
</CURRENT EPISODE>

<EXTRACTED ENTITIES>
${extractedText}
</EXTRACTED ENTITIES>

<EXISTING CANDIDATE ENTITIES>
${candidatesText}
</EXISTING CANDIDATE ENTITIES>`;

  if (extractedNodes.length > 0) {
    const n = extractedNodes.length;
    humanContent += `\n\nEXTRACTED ENTITIES contains ${n} ${n === 1 ? 'entity' : 'entities'} with ids 0 through ${n - 1}. Your response MUST include EXACTLY ${n} ${n === 1 ? 'resolution' : 'resolutions'} with ids 0 through ${n - 1}. Do not skip or add ids.`;
  }

  if (customInstructions) {
    humanContent += `\n\n<CUSTOM INSTRUCTIONS>\n${customInstructions}\n</CUSTOM INSTRUCTIONS>`;
  }

  return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)];
}
