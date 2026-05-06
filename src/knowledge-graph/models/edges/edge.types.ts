import { randomUUID } from 'node:crypto';

import { z } from 'zod';

export const EdgeBaseSchema = z.object({
  uuid: z.uuid(),
  groupId: z.string().min(1),
  sourceNodeUuid: z.uuid(),
  targetNodeUuid: z.uuid(),
  createdAt: z.date(),
});

export type EdgeBase = z.infer<typeof EdgeBaseSchema>;

export function createEdgeDefaults(): Omit<
  EdgeBase,
  'groupId' | 'sourceNodeUuid' | 'targetNodeUuid'
> {
  return {
    uuid: randomUUID(),
    createdAt: new Date(),
  };
}
