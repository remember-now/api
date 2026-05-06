import { z } from 'zod';

export const NodeLabelsSchema = z
  .array(
    z
      .string()
      .regex(
        /^[A-Za-z_][A-Za-z0-9_]*$/,
        'node label must start with a letter or underscore and contain only alphanumeric characters or underscores',
      ),
  )
  .min(1);
export const GroupIdSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'groupId must be non-empty and contain only alphanumeric characters, underscores, or hyphens',
  );
