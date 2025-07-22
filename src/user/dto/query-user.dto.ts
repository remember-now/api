import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const GetUserParamsSchema = z.object({
  id: z.coerce.number().int().gte(1),
});

const GetUsersQuerySchema = z.object({
  page: z.coerce.number().int().gte(1).default(1),

  limit: z.coerce.number().int().gte(1).lte(100).default(10),

  search: z.string().min(1).optional(),
});

export class GetUserParamsDto extends createZodDto(GetUserParamsSchema) {}
export class GetUsersQueryDto extends createZodDto(GetUsersQuerySchema) {}
