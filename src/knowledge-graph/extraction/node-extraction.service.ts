import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { EntityTypeMap } from '../episode/episode.types';
import { createEntityNode, EntityNode, EpisodicNode } from '../models/nodes';
import { buildExtractNodesMessages } from '../prompts';
import { buildExtractEntityAttributesMessages } from '../prompts/extract-entity-attributes.prompts';
import { extractedEntitiesJsonSchema } from './extraction.types';

function resolveLabels(
  entityTypeId: number | undefined,
  entityTypes?: EntityTypeMap,
): string[] {
  if (entityTypeId === undefined || !entityTypes) {
    return ['Entity'];
  }
  const labels = Object.keys(entityTypes);
  const label = labels[entityTypeId];
  return label ? ['Entity', label] : ['Entity'];
}

@Injectable()
export class NodeExtractionService {
  async extractNodes(
    model: BaseChatModel,
    episode: EpisodicNode,
    previousEpisodes: EpisodicNode[],
    entityTypes?: EntityTypeMap,
    customInstructions?: string,
  ): Promise<EntityNode[]> {
    const messages = buildExtractNodesMessages({
      episode,
      previousEpisodes,
      entityTypes,
      customInstructions,
    });

    const result = await model
      .withStructuredOutput(extractedEntitiesJsonSchema)
      .invoke(messages);

    const nodes = result.extractedEntities
      .filter((e) => e.name.trim() !== '')
      .map((e) =>
        createEntityNode({
          name: e.name,
          groupId: episode.groupId,
          labels: resolveLabels(e.entityTypeId, entityTypes),
        }),
      );

    // Attribute extraction for nodes whose entity type has a Zod schema
    const referenceTime = episode.validAt;
    for (const node of nodes) {
      const label = node.labels.find((l) => l !== 'Entity');
      const entityType = label ? entityTypes?.[label] : undefined;
      if (entityType?.schema) {
        const attrMessages = buildExtractEntityAttributesMessages({
          fact: episode.content,
          referenceTime,
          existingAttributes: {},
        });
        const attrs = (await model
          .withStructuredOutput(z.toJSONSchema(entityType.schema))
          .invoke(attrMessages)) as Record<string, unknown>;
        node.attributes = { ...node.attributes, ...attrs };
      }
    }

    return nodes;
  }
}
