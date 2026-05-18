import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Injectable } from '@nestjs/common';

import { EmbeddingConfigService } from '@/config/embedding';
import { Span } from '@/observability';

import { EntityEdge, EntityNode } from '../models';

type SpanMetrics = Record<string, string | number | boolean | undefined>;
const metricsOnResult = (r: unknown) => ({
  attributes: (r as { metrics: SpanMetrics }).metrics,
});

const EMBEDDING_ATTRS = { 'langfuse.observation.type': 'embedding' };

@Injectable()
export class EmbeddingService {
  private readonly model: GoogleGenerativeAIEmbeddings | null;
  private readonly modelName: string;
  private readonly _dimensions: number;

  constructor(embeddingConfig: EmbeddingConfigService) {
    this._dimensions = embeddingConfig.dimensions;
    this.modelName = embeddingConfig.googleModel;

    if (!embeddingConfig.embeddingEnabled) {
      this.model = null;
      return;
    }
    const apiKey = embeddingConfig.googleApiKey;
    if (!apiKey) {
      throw new Error(
        'GOOGLE_EMBEDDING_API_KEY is required when EMBEDDING_ENABLED is true',
      );
    }

    this.model = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: embeddingConfig.googleModel,
    });
  }

  /** Output dimension of the configured embedding model. */
  get dimensions(): number {
    return this._dimensions;
  }

  async embedNodes(nodes: EntityNode[]): Promise<EntityNode[]> {
    const { nodes: out } = await this.embedNodesImpl(nodes);
    return out;
  }

  @Span('embed.nodes', { attributes: EMBEDDING_ATTRS, onResult: metricsOnResult })
  private async embedNodesImpl(
    nodes: EntityNode[],
  ): Promise<{ nodes: EntityNode[]; metrics: SpanMetrics }> {
    if (this.model === null) {
      return { nodes, metrics: { count: 0, model: this.modelName, skipped: true } };
    }

    const toEmbed = nodes.filter((n) => n.nameEmbedding === null);
    if (toEmbed.length === 0) {
      return { nodes, metrics: { count: 0, model: this.modelName } };
    }

    const texts = toEmbed.map((n) => n.name);
    const vectors = await this.model.embedDocuments(texts);

    let vectorIdx = 0;
    const out = nodes.map((n) => {
      if (n.nameEmbedding !== null) return n;
      return { ...n, nameEmbedding: vectors[vectorIdx++] };
    });
    return { nodes: out, metrics: { count: texts.length, model: this.modelName } };
  }

  async embedText(text: string): Promise<number[] | null> {
    const { vector } = await this.embedTextImpl(text);
    return vector;
  }

  @Span('embed.text', { attributes: EMBEDDING_ATTRS, onResult: metricsOnResult })
  private async embedTextImpl(
    text: string,
  ): Promise<{ vector: number[] | null; metrics: SpanMetrics }> {
    if (this.model === null) {
      return { vector: null, metrics: { model: this.modelName, skipped: true } };
    }
    const [vector] = await this.model.embedDocuments([text]);
    return { vector, metrics: { model: this.modelName } };
  }

  async embedEdges(edges: EntityEdge[]): Promise<EntityEdge[]> {
    const { edges: out } = await this.embedEdgesImpl(edges);
    return out;
  }

  @Span('embed.edges', { attributes: EMBEDDING_ATTRS, onResult: metricsOnResult })
  private async embedEdgesImpl(
    edges: EntityEdge[],
  ): Promise<{ edges: EntityEdge[]; metrics: SpanMetrics }> {
    if (this.model === null) {
      return { edges, metrics: { count: 0, model: this.modelName, skipped: true } };
    }

    const toEmbed = edges.filter((e) => e.factEmbedding === null);
    if (toEmbed.length === 0) {
      return { edges, metrics: { count: 0, model: this.modelName } };
    }

    const texts = toEmbed.map((e) => e.fact);
    const vectors = await this.model.embedDocuments(texts);

    let vectorIdx = 0;
    const out = edges.map((e) => {
      if (e.factEmbedding !== null) return e;
      return { ...e, factEmbedding: vectors[vectorIdx++] };
    });
    return { edges: out, metrics: { count: texts.length, model: this.modelName } };
  }
}
