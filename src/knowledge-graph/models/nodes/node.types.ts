import { randomUUID } from 'node:crypto';

import { z } from 'zod';

export enum EpisodeType {
  message = 'message',
  json = 'json',
  text = 'text',
}

export interface NodeBase {
  uuid: string;
  name: string;
  groupId: string;
  createdAt: Date;
}

export const NodeBaseSchema = z.object({
  uuid: z.uuid(),
  name: z.string().min(1),
  groupId: z.string().min(1),
  createdAt: z.date(),
});

export function createNodeDefaults(): Omit<NodeBase, 'name' | 'groupId'> {
  return {
    uuid: randomUUID(),
    createdAt: new Date(),
  };
}
