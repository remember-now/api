import { LlmConfig, LlmProvider, Prisma } from '@generated/prisma/client';

import {
  LlmConfigResponse,
  LlmConfigResponseSchema,
  SaveLlmConfig,
  SaveLlmConfigSchema,
} from '@/llm/dto';

import { UserFactory } from './user.factory';

const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';
const DEFAULT_GOOGLE_MODEL = 'gemini-2.0-flash';
const ENCRYPTED_PLACEHOLDER = 'ENCRYPTED_PLACEHOLDER';
const PLAIN_API_KEY = 'plain-api-key';
const DEFAULT_DATE = new Date('2025-01-01');

type NonPlatformProvider = Exclude<LlmProvider, 'PLATFORM'>;

export interface PrismaLlmConfigOptions {
  id?: number;
  userId?: number;
  provider?: NonPlatformProvider;
  model?: string;
  temperature?: number;
  topK?: number;
  encryptedApiKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SaveLlmConfigOptions {
  provider?: NonPlatformProvider;
  model?: string;
  temperature?: number;
  topK?: number;
  apiKey?: string;
}

export interface LlmConfigResponseOptions {
  provider?: NonPlatformProvider;
  model?: string;
  hasApiKey?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export class TestLlmFactory {
  private static getDefaultModel(provider: NonPlatformProvider): string {
    return provider === LlmProvider.GOOGLE_GEMINI
      ? DEFAULT_GOOGLE_MODEL
      : DEFAULT_ANTHROPIC_MODEL;
  }

  /**
   * Creates a Prisma LlmConfig row with an encrypted apiKey in the config blob.
   * Note: the apiKey field in the blob is ciphertext, not plaintext.
   */
  static createPrismaLlmConfig(
    options: PrismaLlmConfigOptions = {},
  ): LlmConfig {
    const provider = options.provider ?? LlmProvider.ANTHROPIC;
    const model = options.model ?? this.getDefaultModel(provider);
    const configBlob: Record<string, unknown> = {
      model,
      apiKey: options.encryptedApiKey ?? ENCRYPTED_PLACEHOLDER,
    };

    if (options.temperature !== undefined) {
      configBlob.temperature = options.temperature;
    }
    if (options.topK !== undefined) {
      configBlob.topK = options.topK;
    }

    return {
      id: options.id ?? 1,
      userId: options.userId ?? 1,
      provider,
      config: configBlob as Prisma.JsonValue,
      createdAt: options.createdAt ?? DEFAULT_DATE,
      updatedAt: options.updatedAt ?? DEFAULT_DATE,
    };
  }

  /**
   * Creates a Prisma LlmConfig row without an apiKey in the config blob.
   */
  static createPrismaLlmConfigWithoutApiKey(
    options: Omit<PrismaLlmConfigOptions, 'encryptedApiKey'> = {},
  ): LlmConfig {
    const provider = options.provider ?? LlmProvider.ANTHROPIC;
    const model = options.model ?? this.getDefaultModel(provider);
    const configBlob: Record<string, unknown> = { model };

    if (options.temperature !== undefined) {
      configBlob.temperature = options.temperature;
    }
    if (options.topK !== undefined) {
      configBlob.topK = options.topK;
    }

    return {
      id: options.id ?? 1,
      userId: options.userId ?? 1,
      provider,
      config: configBlob as Prisma.JsonValue,
      createdAt: options.createdAt ?? DEFAULT_DATE,
      updatedAt: options.updatedAt ?? DEFAULT_DATE,
    };
  }

  /**
   * Creates a SaveLlmConfig with a plaintext apiKey (as expected by the service input).
   */
  static createSaveLlmConfig(
    options: SaveLlmConfigOptions = {},
  ): SaveLlmConfig {
    const provider = options.provider ?? LlmProvider.ANTHROPIC;
    const model = options.model ?? this.getDefaultModel(provider);
    // If apiKey is explicitly in options (even as undefined), honour it; otherwise default to PLAIN_API_KEY.
    const apiKey = 'apiKey' in options ? options.apiKey : PLAIN_API_KEY;

    return SaveLlmConfigSchema.parse({
      provider,
      model,
      ...(apiKey !== undefined && { apiKey }),
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.topK !== undefined && { topK: options.topK }),
    });
  }

  /**
   * Creates an LlmConfigResponse shape.
   */
  static createLlmConfigResponse(
    options: LlmConfigResponseOptions = {},
  ): LlmConfigResponse {
    const provider = options.provider ?? LlmProvider.ANTHROPIC;
    return LlmConfigResponseSchema.parse({
      provider,
      model: options.model ?? this.getDefaultModel(provider),
      hasApiKey: options.hasApiKey ?? true,
      createdAt: options.createdAt ?? DEFAULT_DATE.toISOString(),
      updatedAt: options.updatedAt ?? DEFAULT_DATE.toISOString(),
    });
  }

  /**
   * Creates a Prisma User with the given activeLlmProvider.
   */
  static createPrismaUserWithActiveLlm(
    provider: NonPlatformProvider = LlmProvider.ANTHROPIC,
  ) {
    return {
      ...UserFactory.createPrismaUser(),
      activeLlmProvider: provider,
    };
  }
}
