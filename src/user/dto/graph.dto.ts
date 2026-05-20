import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { UuidSchema } from '@/common/schemas';

export const GraphSchema = z
  .object({
    id: UuidSchema,
    userId: UuidSchema,
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Graph' });

export class GraphDto extends createZodDto(GraphSchema) {}

export type Graph = z.infer<typeof GraphSchema>;
