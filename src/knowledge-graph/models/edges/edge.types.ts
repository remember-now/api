import { randomUUID } from 'node:crypto';

import { z } from 'zod';

export interface EdgeBase {
  uuid: string;
  groupId: string;
  sourceNodeUuid: string;
  targetNodeUuid: string;
  createdAt: Date;
}

export const EdgeBaseSchema = z.object({
  uuid: z.string().uuid(),
  groupId: z.string(),
  sourceNodeUuid: z.string().uuid(),
  targetNodeUuid: z.string().uuid(),
  createdAt: z.date(),
});

export function createEdgeDefaults(): EdgeBase {
  return {
    uuid: randomUUID(),
    groupId: '',
    sourceNodeUuid: '',
    targetNodeUuid: '',
    createdAt: new Date(),
  };
}
