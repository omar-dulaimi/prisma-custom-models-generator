import path from 'path';
import type { EnvValue, GeneratorConfig } from '@prisma/generator';

/** Providers that emit a Prisma Client we can import `PrismaClient`/`Prisma` from. */
export const CLIENT_PROVIDERS = ['prisma-client', 'prisma-client-js'] as const;

export type ClientProvider = (typeof CLIENT_PROVIDERS)[number];

/**
 * Inlined from `@prisma/internals`.
 *
 * Reading one small helper is not worth depending on `@prisma/internals`,
 * which drags in the schema engine, the WASM parser and a large transitive
 * tree. That dependency is also what pinned this generator to its own bundled
 * copy of Prisma and made it incompatible with the Prisma the user installed.
 */
export function parseEnvValue(object: EnvValue): string {
  if (object.fromEnvVar && object.fromEnvVar !== 'null') {
    const value = process.env[object.fromEnvVar];
    if (!value) {
      throw new Error(
        `Attempted to load provider value using \`env(${object.fromEnvVar})\` but it was not present. Please ensure that ${object.fromEnvVar} is present in your Environment Variables`,
      );
    }
    return value;
  }
  return object.value as string;
}

export function findClientGenerator(
  otherGenerators: readonly GeneratorConfig[],
): GeneratorConfig | undefined {
  return otherGenerators.find((generator) => {
    const provider = parseEnvValue(generator.provider);
    return (CLIENT_PROVIDERS as readonly string[]).includes(provider);
  });
}

/** Force a POSIX-style relative specifier, which is what TypeScript wants. */
function toRelativeSpecifier(from: string, to: string): string {
  const relative = path.relative(from, to).split(path.sep).join('/');
  if (relative === '') return '.';
  return relative.startsWith('.') ? relative : `./${relative}`;
}

/**
 * Work out what the emitted files should import `PrismaClient` and `Prisma`
 * from.
 *
 * Hardcoding `@prisma/client` was correct only for the legacy
 * `prisma-client-js` provider with a default output. Under the `prisma-client`
 * provider, which is the recommended one on Prisma 7, the client is emitted
 * into the user's own source tree and `@prisma/client` resolves to nothing
 * useful, so every scaffold this generator wrote would fail to compile.
 *
 * `otherGenerators` carries the client generator's resolved absolute output
 * plus its `importFileExtension`/`moduleFormat` config, so the specifier can be
 * computed exactly rather than guessed.
 */
export function resolveClientImport(
  outputDir: string,
  clientGenerator: GeneratorConfig | undefined,
): string {
  if (!clientGenerator) return '@prisma/client';

  const provider = parseEnvValue(clientGenerator.provider);
  const output = clientGenerator.output
    ? parseEnvValue(clientGenerator.output)
    : null;

  // Legacy provider writing to node_modules/@prisma/client.
  if (provider === 'prisma-client-js' && !clientGenerator.isCustomOutput) {
    return '@prisma/client';
  }
  if (!output) return '@prisma/client';

  const base = toRelativeSpecifier(outputDir, output);

  // The `prisma-client` provider emits `client.ts` inside its output dir; the
  // legacy provider emits an index at the output root.
  const target = provider === 'prisma-client' ? `${base}/client` : base;

  const extension = clientGenerator.config?.importFileExtension;
  if (typeof extension === 'string' && extension.length > 0) {
    return `${target}.${extension}`;
  }
  return target;
}
