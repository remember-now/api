import { e2e } from 'pactum';

import { LlmProvider } from '@generated/prisma/client';

import { TestHelpers as h, TestSetup as s } from '@test/setup';

// TODO: I don't like that these tests instantiate the provider class
// Means they'll show warnings like deprectation warning in the future
// Should possibly switch to Ollama in future?
const ANTHROPIC_CONFIG = {
  provider: LlmProvider.ANTHROPIC,
  model: 'claude-4-6-sonnet',
  apiKey: 'fake-anthropic-key',
};

const ANTHROPIC_CONFIG_NO_KEY = {
  provider: LlmProvider.ANTHROPIC,
  model: 'claude-4-6-sonnet',
};

const GOOGLE_CONFIG = {
  provider: LlmProvider.GOOGLE_GEMINI,
  model: 'gemini-2.5-flash',
  apiKey: 'fake-google-key',
};

describe('LLM Lifecycle Integration (e2e)', () => {
  describe('Config Save and Retrieval Lifecycle', () => {
    const flow = e2e('LLM Config Lifecycle');

    it('should complete full config lifecycle', async () => {
      const { sessionKey } = await h.createUserWithSession('llm-lifecycle');

      await flow
        .step('List providers — all empty')
        .spec()
        .get(`${s.baseUrl}/llms`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({ activeProvider: null });

      await flow
        .step('Save ANTHROPIC config')
        .spec()
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody(ANTHROPIC_CONFIG)
        .expectStatus(200)
        .expectJsonLike({ provider: LlmProvider.ANTHROPIC, hasApiKey: true });

      await flow
        .step('Verify ANTHROPIC appears in providers list')
        .spec()
        .get(`${s.baseUrl}/llms`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({
          providers: [{ provider: LlmProvider.ANTHROPIC, hasApiKey: true }],
        });

      await flow
        .step('GET ANTHROPIC config directly')
        .spec()
        .get(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({ provider: LlmProvider.ANTHROPIC, hasApiKey: true });

      await flow
        .step('Update model without apiKey — apiKey preserved')
        .spec()
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody(ANTHROPIC_CONFIG_NO_KEY)
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: true });

      await flow
        .step('Save GOOGLE_GEMINI config')
        .spec()
        .put(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody(GOOGLE_CONFIG)
        .expectStatus(200)
        .expectJsonLike({
          provider: LlmProvider.GOOGLE_GEMINI,
          hasApiKey: true,
        });

      await flow
        .step('Both providers are configured')
        .spec()
        .get(`${s.baseUrl}/llms`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({
          providers: [
            { provider: LlmProvider.ANTHROPIC, hasApiKey: true },
            { provider: LlmProvider.GOOGLE_GEMINI, hasApiKey: true },
          ],
        });

      await flow
        .step('Delete ANTHROPIC config')
        .spec()
        .delete(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(204);

      await flow
        .step('ANTHROPIC no longer has apiKey')
        .spec()
        .get(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: false });

      await flow
        .step('GOOGLE_GEMINI still present after ANTHROPIC deletion')
        .spec()
        .get(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: true });
    });

    afterAll(async () => {
      await flow.cleanup();
    });
  });

  describe('Active Provider Lifecycle', () => {
    const flow = e2e('Active Provider Lifecycle');

    it('should complete active provider lifecycle', async () => {
      const { sessionKey } = await h.createUserWithSession(
        'llm-active-lifecycle',
      );

      await flow
        .step('Save ANTHROPIC config with key')
        .spec()
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody(ANTHROPIC_CONFIG)
        .expectStatus(200);

      await flow
        .step('No active provider initially')
        .spec()
        .get(`${s.baseUrl}/llms`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({ activeProvider: null });

      await flow
        .step('Attempt set GOOGLE_GEMINI without config — 400')
        .spec()
        .put(`${s.baseUrl}/llms/active`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody({ provider: LlmProvider.GOOGLE_GEMINI })
        .expectStatus(400);

      await flow
        .step('Set ANTHROPIC as active')
        .spec()
        .put(`${s.baseUrl}/llms/active`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody({ provider: LlmProvider.ANTHROPIC })
        .expectStatus(200)
        .expectJsonLike({ activeProvider: LlmProvider.ANTHROPIC });

      await flow
        .step('List reflects active ANTHROPIC')
        .spec()
        .get(`${s.baseUrl}/llms`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({ activeProvider: LlmProvider.ANTHROPIC });

      await flow
        .step('Delete ANTHROPIC config')
        .spec()
        .delete(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(204);

      await flow
        .step('Active auto-cleared to null after deletion')
        .spec()
        .get(`${s.baseUrl}/llms`)
        .withCookies(`$S{${sessionKey}}`)
        .expectStatus(200)
        .expectJsonLike({ activeProvider: null });

      await flow
        .step('Explicitly unset active provider to null')
        .spec()
        .put(`${s.baseUrl}/llms/active`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody({ provider: null })
        .expectStatus(200)
        .expectJsonLike({ activeProvider: null });
    });

    afterAll(async () => {
      await flow.cleanup();
    });
  });

  describe('User Isolation', () => {
    it('should isolate LLM configs between users', async () => {
      const userA = await h.createUserWithSession('llm-isolation-a');
      const userB = await h.createUserWithSession('llm-isolation-b');

      // UserA saves config
      await h
        .authenticatedRequest(userA.sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withBody(ANTHROPIC_CONFIG)
        .expectStatus(200);

      // UserB sees empty
      await h
        .authenticatedRequest(userB.sessionKey)
        .get(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: false });

      // UserB saves own config
      await h
        .authenticatedRequest(userB.sessionKey)
        .put(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .withBody(GOOGLE_CONFIG)
        .expectStatus(200);

      // UserA unaffected by UserB's config
      await h
        .authenticatedRequest(userA.sessionKey)
        .get(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: false });

      // UserB deletes own config
      await h
        .authenticatedRequest(userB.sessionKey)
        .delete(`${s.baseUrl}/llms/${LlmProvider.GOOGLE_GEMINI}`)
        .expectStatus(204);

      // UserA's config still intact
      await h
        .authenticatedRequest(userA.sessionKey)
        .get(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: true });
    });
  });

  describe('API Key Preservation', () => {
    const flow = e2e('API Key Preservation');

    it('should preserve API key through model updates', async () => {
      const { sessionKey } = await h.createUserWithSession('llm-key-preserve');

      await flow
        .step('Save config with apiKey')
        .spec()
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody(ANTHROPIC_CONFIG)
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: true });

      await flow
        .step('Update model without apiKey — hasApiKey still true')
        .spec()
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody(ANTHROPIC_CONFIG_NO_KEY)
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: true });

      await flow
        .step('Update with new apiKey — hasApiKey still true')
        .spec()
        .put(`${s.baseUrl}/llms/${LlmProvider.ANTHROPIC}`)
        .withCookies(`$S{${sessionKey}}`)
        .withBody({ ...ANTHROPIC_CONFIG, apiKey: 'another-fake-key' })
        .expectStatus(200)
        .expectJsonLike({ hasApiKey: true });
    });

    afterAll(async () => {
      await flow.cleanup();
    });
  });
});
