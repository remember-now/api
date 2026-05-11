import { z } from 'zod';

export const UuidSchema = z.uuid().brand<'Uuid'>();

export type Uuid = z.infer<typeof UuidSchema>;
