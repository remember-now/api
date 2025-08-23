import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const CreateMemoryBlockSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  value: z.string().min(1, 'Value is required').default(''),
  description: z.string().optional(),
  limit: z.number().int().positive().max(50000).optional().default(20000),
  readOnly: z.boolean().optional().default(false),
});

const UpdateMemoryBlockSchema = z.object({
  value: z.string().optional(),
  description: z.string().optional(),
  limit: z.number().int().positive().optional(),
  readOnly: z.boolean().optional(),
});

const GetMemoryBlockParamsSchema = z.object({
  blockLabel: z.string().min(1, 'Block label is required'),
});

export class CreateMemoryBlockDto extends createZodDto(
  CreateMemoryBlockSchema,
) {}
export class UpdateMemoryBlockDto extends createZodDto(
  UpdateMemoryBlockSchema,
) {}
export class GetMemoryBlockParamsDto extends createZodDto(
  GetMemoryBlockParamsSchema,
) {}
