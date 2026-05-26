import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { mockDeep } from 'jest-mock-extended';
import { z } from 'zod';

import { invokeStructured, StructuredOutputValidationError } from './invoke-structured';

const EdgeSchema = z.object({
  fact: z.string(),
  validAt: z.iso.datetime().nullable().optional(),
});

const baseMessages = [new SystemMessage('extract'), new HumanMessage('source text')];

describe('invokeStructured', () => {
  let mockModel: ReturnType<typeof mockDeep<BaseChatModel>>;
  let mockRunnable: { invoke: jest.Mock };

  beforeEach(() => {
    mockModel = mockDeep<BaseChatModel>();
    mockRunnable = { invoke: jest.fn() };
    mockModel.withStructuredOutput.mockReturnValue(mockRunnable as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns parsed value on first-attempt success', async () => {
    mockRunnable.invoke.mockResolvedValue({
      fact: 'Alice works at Acme',
      validAt: '2025-04-30T00:00:00Z',
    });

    const result = await invokeStructured(mockModel, EdgeSchema, baseMessages, {
      runName: 'extract-test',
      tags: ['test'],
    });

    expect(result).toEqual({
      fact: 'Alice works at Acme',
      validAt: '2025-04-30T00:00:00Z',
    });
    expect(mockRunnable.invoke).toHaveBeenCalledTimes(1);
    expect(mockRunnable.invoke).toHaveBeenCalledWith(
      baseMessages,
      expect.objectContaining({ runName: 'extract-test', tags: ['test'] }),
    );
  });

  it('retries with appended HumanMessage on ZodError, then succeeds', async () => {
    mockRunnable.invoke
      .mockResolvedValueOnce({ fact: 'Alice works at Acme', validAt: 'next tuesday' })
      .mockResolvedValueOnce({
        fact: 'Alice works at Acme',
        validAt: '2025-04-30T00:00:00Z',
      });

    const result = await invokeStructured(mockModel, EdgeSchema, baseMessages, {
      runName: 'extract-test',
      tags: ['test'],
    });

    expect(result.validAt).toBe('2025-04-30T00:00:00Z');
    expect(mockRunnable.invoke).toHaveBeenCalledTimes(2);

    const [secondMessages, secondConfig] = mockRunnable.invoke.mock.calls[1] as [
      Array<HumanMessage | SystemMessage>,
      { runName?: string; tags?: string[] },
    ];
    expect(secondMessages).toHaveLength(baseMessages.length + 1);
    const feedback = secondMessages[secondMessages.length - 1];
    expect(feedback).toBeInstanceOf(HumanMessage);
    expect(feedback.content).toContain('validAt');
    expect(secondConfig.runName).toBe('extract-test.retry-1');
    expect(secondConfig.tags).toEqual(['test', 'retry']);
  });

  it('throws StructuredOutputValidationError after exhausting attempts', async () => {
    mockRunnable.invoke.mockResolvedValue({
      fact: 'Alice works at Acme',
      validAt: 'never',
    });

    let caught: unknown;
    try {
      await invokeStructured(mockModel, EdgeSchema, baseMessages, {
        runName: 'extract-test',
        maxRetries: 2,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(StructuredOutputValidationError);
    expect(mockRunnable.invoke).toHaveBeenCalledTimes(2);

    const err = caught as StructuredOutputValidationError;
    expect(err.runName).toBe('extract-test');
    expect(err.zodError).toBeInstanceOf(z.ZodError);
    expect((err as unknown as Record<string, unknown>).raw).toBeUndefined();
    expect(err.message).not.toContain('Alice works at Acme');
  });

  it('does not retry when maxRetries=1', async () => {
    mockRunnable.invoke.mockResolvedValue({
      fact: 'Alice works at Acme',
      validAt: 'never',
    });

    await expect(
      invokeStructured(mockModel, EdgeSchema, baseMessages, {
        runName: 'extract-test',
        maxRetries: 1,
      }),
    ).rejects.toBeInstanceOf(StructuredOutputValidationError);

    expect(mockRunnable.invoke).toHaveBeenCalledTimes(1);
  });

  it('passes callbacks through to invoke', async () => {
    mockRunnable.invoke.mockResolvedValue({ fact: 'x' });
    const callbacks = [{ name: 'fake' }] as never;

    await invokeStructured(mockModel, EdgeSchema, baseMessages, {
      runName: 'extract-test',
      callbacks,
    });

    expect(mockRunnable.invoke).toHaveBeenCalledWith(
      baseMessages,
      expect.objectContaining({ callbacks }),
    );
  });
});
