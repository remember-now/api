import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DeleteSelfSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Current password is required to delete account')
    .max(60),
  confirmationText: z.string().refine((val) => val === 'DELETE MY ACCOUNT', {
    message: 'Please type "DELETE MY ACCOUNT" to confirm account deletion',
  }),
});

export class DeleteSelfDto extends createZodDto(DeleteSelfSchema) {}
