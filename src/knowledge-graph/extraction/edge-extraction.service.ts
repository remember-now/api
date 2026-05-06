import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Injectable } from '@nestjs/common';

import { EdgeTypeMap, EdgeTypesMap } from '../episode/episode.types';
import {
  createEntityEdge,
  EntityEdge,
  EntityNode,
  EpisodicNode,
} from '../models';
import { buildExtractEdgesMessages } from '../prompts';
import { extractedEdgesJsonSchema } from './extraction.types';

@Injectable()
export class EdgeExtractionService {
  async extractEdges(
    model: BaseChatModel,
    episode: EpisodicNode,
    nodes: EntityNode[],
    previousEpisodes: EpisodicNode[],
    referenceTime: Date,
    customInstructions?: string,
    edgeTypes?: EdgeTypesMap,
    edgeTypeMap?: EdgeTypeMap,
  ): Promise<EntityEdge[]> {
    const nameToNode = new Map<string, EntityNode>(
      nodes.map((n) => [n.name.toLowerCase(), n]),
    );

    const messages = buildExtractEdgesMessages({
      episode,
      nodes,
      previousEpisodes,
      referenceTime,
      customInstructions,
      edgeTypes,
      edgeTypeMap,
    });

    const result = await model
      .withStructuredOutput(extractedEdgesJsonSchema)
      .invoke(messages);

    return result.edges
      .filter((e) => {
        const hasSource = nameToNode.has(e.source.toLowerCase());
        const hasTarget = nameToNode.has(e.target.toLowerCase());
        return hasSource && hasTarget;
      })
      .map((e) => {
        const sourceNode = nameToNode.get(e.source.toLowerCase())!;
        const targetNode = nameToNode.get(e.target.toLowerCase())!;
        return createEntityEdge({
          name: e.name,
          fact: e.description,
          groupId: episode.groupId,
          sourceNodeUuid: sourceNode.uuid,
          targetNodeUuid: targetNode.uuid,
          episodes: [episode.uuid],
          validAt: typeof e.validAt === 'string' ? new Date(e.validAt) : null,
          invalidAt:
            typeof e.invalidAt === 'string' ? new Date(e.invalidAt) : null,
        });
      });
  }
}
