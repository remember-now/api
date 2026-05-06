import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

import { EpisodeType } from '@/knowledge-graph/models';

import { EntityTypeMap } from '../episode/episode.types';
import { EpisodicNode } from '../models';
import { episodeToContext } from './prompts.types';

const EXTRACTION_RULES = `
EXTRACT (real-world, nameable entities only):
- Named people, organisations, places, events with specific proper names
- Brand-named or qualified specific objects ("Gamecube", "wool coat", "dog leash", "red and purple lighting", "cracked windshield")
- Hobbies and activities when referenced as meaningful things ("video games", "watercolor painting", "road cycling")
- Possessive constructions: "Nisha's dad" → entity "Nisha's dad", NOT just "dad"; "Jordan's dog" → "Jordan's dog", NOT just "dog"
- Items with a concrete distinguishing descriptor (color, material, size, model, owner, specific use)

NEVER EXTRACT:
- Pronouns (you, me, I, he, she, they, we, us, it, them, him, her, this, that, those)
- Abstract concepts or feelings (joy, balance, growth, resilience, happiness, passion, motivation)
- Generic common nouns or bare object words (day, life, people, work, stuff, things, food, time, tickets, supplies, clothes, keys, gear)
- Generic media/content nouns unless uniquely identified in the node name itself (photo, pic, picture, image, video, post, story)
- Generic event/activity nouns unless uniquely identified in the node name itself (event, game, meeting, class, workshop, competition)
- Broad institutional nouns unless explicitly named or uniquely qualified (government, school, company, team, office)
- Ambiguous bare nouns whose meaning depends on sentence context rather than the node name itself
- Bare relational or kinship terms (dad, mom, mother, father, sister, brother, husband, wife, spouse, son, daughter, uncle, aunt, cousin, grandma, grandpa, friend, boss, teacher, neighbor, roommate) — qualify with possessor: "Nisha's dad" not "dad"
- Bare animal/pet words (dog, cat, pet, puppy, kitten) — qualify with possessor: "Jordan's dog" not "dog"
- Bare generic objects that cannot be meaningfully qualified with a possessor, brand, or distinguishing detail (NEVER extract "supplies" from "I picked up some supplies")
- Bare head nouns without qualifying context ("car", "coat", "lighting", "windshield") — use the qualified form instead ("wool coat", "red and purple lighting", "cracked windshield")
- Sentence fragments or clauses ("what you really care about", "results of that effort")
- Adjectives or descriptive phrases alone ("amazing", "something different")
- Duplicate references to the same real-world entity — extract each entity at most once`;

const MESSAGE_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Extract significant entities from conversational messages.

${EXTRACTION_RULES}

Additional rules for messages:
1. **Speaker extraction**: Always extract the speaker (the part before the colon in each dialogue line) as the first entity. If the speaker appears again in the body, treat both as a single entity — do not extract them twice.
2. **Entity identification**: Extract named entities and specific, concrete things explicitly mentioned in the CURRENT MESSAGE. Pronoun references (he/she/they/this/that) should be disambiguated to the actual entity name when possible.
3. **Specificity**: Always use the most specific form — "road cycling" not "cycling", "wool coat" not "coat". When context makes an object's category clear, include it: "dog leash" not just "leash".
4. **Exclusions**: Do not extract entities mentioned only in PREVIOUS MESSAGES. Do not extract relationships, actions, or temporal information.
5. **When in doubt, do NOT extract.**

GOOD examples:
- "Jordan: We just moved to Denver. My spouse started at Lockheed Martin." → extract: "Jordan", "Denver", "Lockheed Martin" (NOT "spouse" — unnamed role)
- "Nisha: My dad is visiting. He loves walking his dogs in Riverside Park." → extract: "Nisha", "Nisha's dad", "Riverside Park" (NOT bare "dad" or "dogs")
- "Mary: I forgot Trigger's leash so I couldn't take him on a dog walk. After that I went road cycling in my new wool coat." → extract: "Mary", "Trigger", "dog leash", "road cycling", "wool coat" (NOT bare "leash", "cycling", or "coat")
- "Nate: My gaming room has red and purple lighting and I mostly play on a Gamecube. Last week the windshield on my Mustang got cracked." → extract: "Nate", "gaming room", "red and purple lighting", "Gamecube", "Mustang", "cracked windshield" (NOT bare "lighting" or "windshield")
- "Alex: I shared a pic from the game after the event." → extract: "Alex" only (NOT "pic" — generic media noun; NOT "game" or "event" — generic event nouns)
- "Jordan: We won by a tight score. Scoring that last basket felt incredible." → extract: "Jordan" only (NOT "basket" — ambiguous bare noun that depends on sentence context)

BAD examples (do NOT do this):
- Extracting "the company" → too generic, unnamed institution
- Extracting "he" or "they" → pronouns
- Extracting "dad" without the possessive → use "Nisha's dad" if context gives ownership
- If entity types are provided, classify each entity with the appropriate entityTypeId
- If no entity type fits, omit entityTypeId`;

const TEXT_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Extract named entities from a text document.

${EXTRACTION_RULES}

Additional rules for documents:
- Only extract entities specific enough to be uniquely identifiable — ask: "Could this have its own Wikipedia article or database entry?"
- Always use the most specific form from the text ("road cycling" not "cycling", "wool coat" not "coat")
- When the text refers to a person's relative, pet, or associate by a bare term, qualify with the possessor's name ("Dr. Osei's colleague" not "colleague")
- Do not extract relationships, actions, or temporal information
- If entity types are provided, classify each entity with the appropriate entityTypeId
- If no entity type fits, omit entityTypeId

GOOD examples:
- "Dr. Amara Osei presented her migraine study results at the AAN conference. The study tracked 340 patients using a new CGRP combination protocol." → extract: "Dr. Amara Osei", "AAN", "migraine study", "CGRP combination protocol" (NOT "results", "340", "patients", "conference" — generic without specific name)
- "Alex shared a pic after the event and said scoring the last basket felt incredible." → extract: "Alex" only (NOT "pic" — generic media noun; NOT "event" — generic event noun; NOT "basket" — ambiguous bare noun)`;

const JSON_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Extract named entities from structured JSON data — use key names and values as context.

${EXTRACTION_RULES}

Additional rules for JSON:
- Also never extract: date/time/timestamp values, abstract field values ("true", "active", "pending"), numeric IDs or codes
- Use both key names and values to identify entities
- Only extract entities specific enough to be uniquely identifiable
- Use the most specific form present in the data ("road cycling" not "cycling")
- Do not extract relationships or adjectives alone
- If entity types are provided, classify each entity with the appropriate entityTypeId
- If no entity type fits, omit entityTypeId

GOOD examples:
- {"user": "Jordan Lee", "company": "Acme Corp", "role": "engineer", "start_date": "2024-01-15", "active": true} → extract: "Jordan Lee", "Acme Corp" (NOT "engineer" — role; NOT date or boolean values)
- {"author": "Alex", "attachment_type": "photo", "event_name": "event", "agency": "government"} → extract: "Alex" only (NOT "photo" — generic media noun; NOT "event" — generic event noun; NOT "government" — unnamed institutional noun)`;

const FACT_TRIPLE_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Extract named entities from fact triples (subject-predicate-object structured data).

${EXTRACTION_RULES}

Additional rules for fact triples:
- Each triple's subject and object are strong candidates for entities
- Do not extract the predicate as an entity
- If entity types are provided, classify each entity with the appropriate entityTypeId
- If no entity type fits, omit entityTypeId`;

function buildSystemPrompt(source: EpisodeType): string {
  switch (source) {
    case EpisodeType.message:
      return MESSAGE_SYSTEM_PROMPT;
    case EpisodeType.json:
      return JSON_SYSTEM_PROMPT;
    case EpisodeType.factTriple:
      return FACT_TRIPLE_SYSTEM_PROMPT;
    default:
      return TEXT_SYSTEM_PROMPT;
  }
}

function formatPreviousEpisodes(episodes: EpisodicNode[]): string {
  if (episodes.length === 0) {
    return 'None';
  }
  return episodes
    .map((e) => {
      const ctx = episodeToContext(e);
      return `- [${ctx.name}] (${ctx.validAt}): ${ctx.content}`;
    })
    .join('\n');
}

export function buildExtractNodesMessages(ctx: {
  episode: EpisodicNode;
  previousEpisodes: EpisodicNode[];
  entityTypes?: EntityTypeMap;
  customInstructions?: string;
}): BaseMessage[] {
  const { episode, previousEpisodes, entityTypes, customInstructions } = ctx;

  const systemPrompt = buildSystemPrompt(episode.source);

  const previousEpisodesText = formatPreviousEpisodes(previousEpisodes);

  let humanContent = `PREVIOUS EPISODES:\n${previousEpisodesText}\n\nCURRENT EPISODE:\nName: ${episode.name}\nSource: ${episode.source}\nContent: ${episode.content}`;

  if (customInstructions) {
    humanContent += `\n\n${customInstructions}`;
  }

  if (entityTypes && Object.keys(entityTypes).length > 0) {
    const entityTypesText = Object.entries(entityTypes)
      .map(
        ([label, { description }], index) =>
          `{id: ${index}, label: "${label}", description: "${description}"}`,
      )
      .join('\n');
    humanContent += `\n\nENTITY TYPES:\n${entityTypesText}`;
  }

  return [new SystemMessage(systemPrompt), new HumanMessage(humanContent)];
}
