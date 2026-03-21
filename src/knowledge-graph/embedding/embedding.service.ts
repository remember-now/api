import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Injectable } from '@nestjs/common';

import { EmbeddingConfigService } from '@/config/embedding';

import { EntityEdge } from '../models/edges';
import { EntityNode } from '../models/nodes';

/** Output dimensions for known Google embedding models. */
const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-004': 768,
};

@Injectable()
export class EmbeddingService {
  private readonly model: GoogleGenerativeAIEmbeddings | null;
  private readonly modelName: string;

  constructor(embeddingConfig: EmbeddingConfigService) {
    this.modelName = embeddingConfig.model;

    if (!embeddingConfig.embeddingEnabled) {
      this.model = null;
      return;
    }
    const apiKey = embeddingConfig.apiKey;
    if (!apiKey) {
      throw new Error(
        'EMBEDDING_API_KEY is required when EMBEDDING_ENABLED is true',
      );
    }

    this.model = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: this.modelName,
    });
  }

  /** Output dimension of the configured embedding model. */
  get dimensions(): number {
    const dim = MODEL_DIMENSIONS[this.modelName];
    if (dim === undefined) {
      throw new Error(
        `Unknown embedding model "${this.modelName}". Add it to MODEL_DIMENSIONS in embedding.service.ts.`,
      );
    }
    return dim;
  }

  async embedNodes(nodes: EntityNode[]): Promise<EntityNode[]> {
    if (this.model === null) return nodes;

    const toEmbed = nodes.filter((n) => n.nameEmbedding === null);
    if (toEmbed.length === 0) return nodes;

    const vectors = await this.model.embedDocuments(toEmbed.map((n) => n.name));

    let vectorIdx = 0;
    return nodes.map((n) => {
      if (n.nameEmbedding !== null) return n;
      return { ...n, nameEmbedding: vectors[vectorIdx++] };
    });
  }

  async embedEdges(edges: EntityEdge[]): Promise<EntityEdge[]> {
    if (this.model === null) return edges;

    const toEmbed = edges.filter((e) => e.factEmbedding === null);
    if (toEmbed.length === 0) return edges;

    const vectors = await this.model.embedDocuments(toEmbed.map((e) => e.fact));

    let vectorIdx = 0;
    return edges.map((e) => {
      if (e.factEmbedding !== null) return e;
      return { ...e, factEmbedding: vectors[vectorIdx++] };
    });
  }
}
