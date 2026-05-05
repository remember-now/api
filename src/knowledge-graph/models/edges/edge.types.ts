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
  uuid: z.uuid(),
  groupId: z.string(),
  sourceNodeUuid: z.uuid(),
  targetNodeUuid: z.uuid(),
  createdAt: z.date(),
});

export function createEdgeDefaults(): Omit<
  EdgeBase,
  'sourceNodeUuid' | 'targetNodeUuid'
> {
  return {
    uuid: randomUUID(),
    groupId: '',
    createdAt: new Date(),
  };
}
