import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';

export interface InvokeStructuredOptions {
  runName: string;
  tags?: string[];
  callbacks?: BaseCallbackHandler[];
  maxRetries?: number;
}

export const DEFAULT_MAX_RETRIES = 3;
