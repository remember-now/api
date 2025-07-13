import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const GetUserParamsSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

const GetUsersQuerySchema = z
  .object({
    page: z
      .string()
      .optional()
      .default('1')
      .transform((val) => parseInt(val, 10)),
    limit: z
      .string()
      .optional()
      .default('10')
      .transform((val) => parseInt(val, 10)),
    search: z.string().optional(),
  })
  .refine((data) => data.page > 0, {
    message: 'Page must be greater than 0',
    path: ['page'],
  })
  .refine((data) => data.limit > 0 && data.limit <= 100, {
    message: 'Limit must be between 1 and 100',
    path: ['limit'],
  });

export class GetUserParamsDto extends createZodDto(GetUserParamsSchema) {}
export class GetUsersQueryDto extends createZodDto(GetUsersQuerySchema) {}
