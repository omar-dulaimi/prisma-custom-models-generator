import { z } from 'zod';

/**
 * Every value in a `generator` block arrives as a string, so booleans have to
 * be parsed rather than validated.
 */
const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) =>
    typeof value === 'boolean' ? value : value === 'true' || value === '1',
  );

export const BEHAVIORS = ['WRAP', 'EXTEND', 'EXTEND_CLIENT'] as const;

export const configSchema = z.object({
  /**
   * WRAP           class wrapping a single model delegate
   * EXTEND         Object.assign onto a model delegate
   * EXTEND_CLIENT  Prisma Client extension via Prisma.defineExtension
   *
   * EXTEND_CLIENT is the approach Prisma recommends; the other two are the
   * older documented approaches and are kept because they still work.
   */
  behavior: z.enum(BEHAVIORS).default('WRAP'),
  /**
   * Overwrite files even when they have been edited. Off by default: this
   * generator's output is meant to be hand-edited, so clobbering is opt-in.
   */
  force: booleanish.default(false),
});

export type Config = z.infer<typeof configSchema>;
export type Behavior = Config['behavior'];
