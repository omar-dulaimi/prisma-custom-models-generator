import { z } from 'zod';

export const configSchema = z.object({
  behavior: z.enum(['WRAP', 'EXTEND']).default('WRAP'),
});

export type Config = z.infer<typeof configSchema>;
