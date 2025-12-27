import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().gte(1).lte(100).default(10),

  before: z.string().min(1).optional(),
});

export class GetMessagesQueryDto extends createZodDto(GetMessagesQuerySchema) {}

export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>;
