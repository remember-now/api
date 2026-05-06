import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';

import { EntityTypeMap } from '../episode/episode.types';
import { createEntityNode, EntityNode, EpisodicNode } from '../models';
import { buildExtractNodesMessages } from '../prompts';
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
    excludedEntityTypes?: string[],
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

    return result.extractedEntities
      .filter((e) => e.name.trim() !== '')
      .map((e) =>
        createEntityNode({
          name: e.name,
          groupId: episode.groupId,
          labels: resolveLabels(e.entityTypeId, entityTypes),
        }),
      )
      .filter((node) => {
        if (!excludedEntityTypes?.length) return true;
        const specificLabel =
          node.labels.find((l) => l !== 'Entity') ?? 'Entity';
        return !excludedEntityTypes.includes(specificLabel);
      });
  }
}
