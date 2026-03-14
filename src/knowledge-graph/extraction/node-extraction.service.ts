import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';

import { createEntityNode, EntityNode, EpisodicNode } from '../models/nodes';
import { buildExtractNodesMessages } from '../prompts';
import { extractedEntitiesJsonSchema } from './extraction.types';

function resolveLabels(
  entityTypeId: number | undefined,
  entityTypes?: Record<string, string>,
): string[] {
  if (entityTypeId === undefined || !entityTypes) {
    return ['Entity'];
  }
  const labels = Object.keys(entityTypes);
  const label = labels[entityTypeId];
  return label ? [label] : ['Entity'];
}

@Injectable()
export class NodeExtractionService {
  async extractNodes(
    model: BaseChatModel,
    episode: EpisodicNode,
    previousEpisodes: EpisodicNode[],
    entityTypes?: Record<string, string>,
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

    return result.extractedEntities
      .filter((e) => e.name.trim() !== '')
      .map((e) =>
        createEntityNode({
          name: e.name,
          groupId: episode.groupId,
          labels: resolveLabels(e.entityTypeId, entityTypes),
        }),
      );
  }
}
