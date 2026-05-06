import { randomUUID } from 'node:crypto';

import { z } from 'zod';

export enum EpisodeType {
  message = 'message',
  json = 'json',
  text = 'text',
}

export const NodeBaseSchema = z.object({
  uuid: z.uuid(),
  name: z.string().min(1),
  groupId: z.string().min(1),
  labels: z.array(z.string()),
  createdAt: z.date(),
});

export type NodeBase = z.infer<typeof NodeBaseSchema>;

export function createNodeDefaults(): Omit<NodeBase, 'name' | 'groupId'> {
  return {
    uuid: randomUUID(),
    labels: [],
    createdAt: new Date(),
  };
}
