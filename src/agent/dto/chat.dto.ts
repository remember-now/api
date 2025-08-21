import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
});

export class ChatRequestDto extends createZodDto(chatRequestSchema) {}
