import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BadRequestException, Injectable } from '@nestjs/common';

import { LlmProvider } from '@generated/prisma/client';

import { LlmConfigService } from '@/config/llm';

import { SaveLlmConfig } from '../dto';

@Injectable()
export class LlmFactoryService {
  constructor(private readonly llmConfig: LlmConfigService) {}

  createModel(config: SaveLlmConfig): BaseChatModel {
    switch (config.provider) {
      case LlmProvider.ANTHROPIC:
        return new ChatAnthropic({
          anthropicApiKey: config.apiKey,
          model: config.model,
          temperature: config.temperature,
          topK: config.topK,
        });
      case LlmProvider.GOOGLE_GEMINI:
        return new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model: config.model,
          temperature: config.temperature,
          topK: config.topK,
        });
      default: {
        const _exhaustive: never = config;
        throw new Error(
          `Unsupported provider: ${(_exhaustive as SaveLlmConfig).provider}`,
        );
      }
    }
  }

  createPlatformModel(): BaseChatModel {
    if (!this.llmConfig.platformModelEnabled) {
      throw new BadRequestException('Platform model is not enabled');
    }

    const apiKey = this.llmConfig.geminiApiKey;
    if (!apiKey) {
      throw new BadRequestException('Platform model API key is not configured');
    }

    return new ChatGoogleGenerativeAI({
      apiKey,
      model: this.llmConfig.platformModel,
    });
  }
}
