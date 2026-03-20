import { spec } from 'pactum';

import { LlmProvider } from '@generated/prisma/client';

import { UserLlmProviderSchema } from '@/llm/dto';

import { TestHelpers as h, TestSetup as s } from '@test/setup';

// TODO: I don't like that these tests instantiate the provider class
// Means they'll show warnings like deprectation warning in the future
// Should possibly switch to Ollama in future?
const ANTHROPIC_CONFIG = {
  provider: LlmProvider.ANTHROPIC,
  model: 'claude-4-6-sonnet',
  apiKey: 'fake-anthropic-key',
};

const GOOGLE_CONFIG = {
  provider: LlmProvider.GOOGLE_GEMINI,
  model: 'gemini-2.5-flash',
  apiKey: 'fake-google-key',
};

describe('LLM (e2e)', () => {
  describe('GET /llms', () => {
    let sessionKey: string;

    beforeAll(async () => {
      const result = await h.createUserWithSession('llm-list');
      sessionKey = result.sessionKey;
    });

    it('should return validProvidersList for authenticated user', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .get(`${s.baseUrl}/llms`)
        .expect('validProvidersList');
    });

    it('should return one entry per value in UserLlmProviderSchema.options', async () => {
      const expectedCount = UserLlmProviderSchema.options.length;

      await h
        .authenticatedRequest(sessionKey)
        .get(`${s.baseUrl}/llms`)
        .expectJsonLength('providers', expectedCount);
    });

    it('should return activeProvider: null initially', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .get(`${s.baseUrl}/llms`)
        .expect('validProvidersList', { activeProvider: null });
    });

    it('should return 403 without session', async () => {
      await spec().get(`${s.baseUrl}/llms`).expect('authFailure');
    });
  });

  describe('GET /llms/:provider', () => {
    let sessionKey: string;

    beforeAll(async () => {
      const result = await h.createUserWithSession('llm-get');
      sessionKey = result.sessionKey;
    });

    it('should return { hasApiKey: false } for unconfigured ANTHROPIC', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .get(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .expect('validLlmConfigResponse', { hasApiKey: false });
    });

    it('should return { hasApiKey: false } for unconfigured GOOGLE_GEMINI', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .get(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .expect('validLlmConfigResponse', { hasApiKey: false });
    });

    it('should return 400 for PLATFORM', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .get(`${s.baseUrl}/llms/${LlmProvider.PLATFORM}`)
        .expectStatus(400);
    });

    it('should return 400 for unknown provider string', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .get(`${s.baseUrl}/llms/UNKNOWN_PROVIDER`)
        .expectStatus(400);
    });

    it('should return 403 without session', async () => {
      await spec()
        .get(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .expect('authFailure');
    });
  });

  describe('PUT /llms/:provider', () => {
    let sessionKey: string;

    beforeAll(async () => {
      const result = await h.createUserWithSession('llm-save');
      sessionKey = result.sessionKey;
    });

    it('should save ANTHROPIC config with apiKey and return hasApiKey: true', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody(ANTHROPIC_CONFIG)
        .expect('validLlmConfigResponse', { hasApiKey: true });
    });

    it('should save GOOGLE_GEMINI config with apiKey and return hasApiKey: true', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .withBody(GOOGLE_CONFIG)
        .expect('validLlmConfigResponse', { hasApiKey: true });
    });

    it('should preserve existing apiKey when update omits apiKey', async () => {
      // First save with apiKey
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody(ANTHROPIC_CONFIG)
        .expectStatus(200);

      // Update model only, no apiKey
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody({
          provider: LlmProvider.ANTHROPIC,
          model: 'claude-3-opus-20240229',
        })
        .expect('validLlmConfigResponse', { hasApiKey: true });
    });

    it('should return 400 when body.provider mismatches URL provider', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody({
          provider: LlmProvider.GOOGLE_GEMINI,
          model: 'gemini-2.0-flash',
        })
        .expectStatus(400);
    });

    it('should return 400 for PLATFORM in URL', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.PLATFORM}`)
        .withBody({
          provider: LlmProvider.PLATFORM,
          model: 'gemini-2.5-flash',
        })
        .expectStatus(400);
    });

    it('should return 400 for missing model field', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody({ provider: LlmProvider.ANTHROPIC })
        .expectStatus(400);
    });

    it('should return 403 without session', async () => {
      await spec()
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody(ANTHROPIC_CONFIG)
        .expect('authFailure');
    });
  });

  describe('DELETE /llms/:provider', () => {
    let sessionKey: string;

    beforeAll(async () => {
      const result = await h.createUserWithSession('llm-delete');
      sessionKey = result.sessionKey;
    });

    it('should delete existing config and return 204', async () => {
      // Save first
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody(ANTHROPIC_CONFIG)
        .expectStatus(200);

      await h
        .authenticatedRequest(sessionKey)
        .delete(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .expectStatus(204);
    });

    it('should return hasApiKey: false after deletion', async () => {
      // Save first
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .withBody(GOOGLE_CONFIG)
        .expectStatus(200);

      await h
        .authenticatedRequest(sessionKey)
        .delete(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .expectStatus(204);

      await h
        .authenticatedRequest(sessionKey)
        .get(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .expect('validLlmConfigResponse', { hasApiKey: false });
    });

    it('should return 404 when deleting non-existent config', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .delete(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .expectStatus(404);
    });

    it('should return 400 for PLATFORM', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .delete(`${s.baseUrl}/llms/${LlmProvider.PLATFORM}`)
        .expectStatus(400);
    });

    it('should return 403 without session', async () => {
      await spec()
        .delete(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .expect('authFailure');
    });
  });

  describe('PUT /llms/active', () => {
    let sessionKey: string;

    beforeAll(async () => {
      const result = await h.createUserWithSession('llm-active');
      sessionKey = result.sessionKey;
    });

    it('should return 400 when provider has no saved config', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/active`)
        .withBody({ provider: LlmProvider.ANTHROPIC })
        .expectStatus(400);
    });

    it('should return 400 when config exists but has no apiKey', async () => {
      // Save config without apiKey
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody({
          provider: LlmProvider.ANTHROPIC,
          model: 'claude-3-5-haiku-20241022',
        })
        .expectStatus(200);

      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/active`)
        .withBody({ provider: LlmProvider.ANTHROPIC })
        .expectStatus(400);
    });

    it('should set activeProvider to null successfully', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/active`)
        .withBody({ provider: null })
        .expectStatus(200)
        .expectJsonLike({ activeProvider: null });
    });

    it('should return 400 for unknown provider string', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .put(`${s.baseUrl}/llms/active`)
        .withBody({ provider: 'UNKNOWN_PROVIDER' })
        .expectStatus(400);
    });

    it('should return 403 without session', async () => {
      await spec()
        .put(`${s.baseUrl}/llms/active`)
        .withBody({ provider: null })
        .expect('authFailure');
    });
  });

  describe('POST /llms/:provider/test', () => {
    let sessionKey: string;

    beforeAll(async () => {
      const result = await h.createUserWithSession('llm-test');
      sessionKey = result.sessionKey;
    });

    it('should return 400 for PLATFORM', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .post(`${s.baseUrl}/llms/${LlmProvider.PLATFORM}/test`)
        .expectStatus(400);
    });

    it('should return 404 when no config exists for provider', async () => {
      await h
        .authenticatedRequest(sessionKey)
        .post(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}/test`)
        .expectStatus(404);
    });

    it('should return 403 without session', async () => {
      await spec()
        .post(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}/test`)
        .expect('authFailure');
    });
  });
});
