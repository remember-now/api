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
  groupId: z.string(),
  createdAt: z.date(),
});

export function createNodeDefaults(): NodeBase {
  return {
    uuid: randomUUID(),
    name: '',
    groupId: '',
    createdAt: new Date(),
  };
}
