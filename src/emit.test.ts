import { describe, expect, it } from 'vitest';
import { configSchema } from './config';
import {
  emitModelFile,
  fileNameFor,
  findFileNameCollisions,
  modelNames,
} from './emit';
import { resolveClientImport } from './helpers';
import type { GeneratorConfig } from '@prisma/generator';

const env = (value: string | null) => ({ fromEnvVar: null, value });

const generator = (
  provider: string,
  output: string | null,
  config: Record<string, string> = {},
  isCustomOutput = true,
): GeneratorConfig =>
  ({
    name: 'client',
    provider: env(provider),
    output: output ? env(output) : null,
    isCustomOutput,
    config,
    binaryTargets: [],
    previewFeatures: [],
    sourceFilePath: '/app/prisma/schema.prisma',
  }) as unknown as GeneratorConfig;

describe('modelNames', () => {
  it('derives the three casings used by the scaffolds', () => {
    expect(modelNames('User')).toEqual({
      pluralPascalCase: 'Users',
      singularCamelCase: 'user',
      singularPascalCase: 'User',
    });
  });

  it('pluralises irregular nouns', () => {
    expect(modelNames('Person').pluralPascalCase).toBe('People');
    expect(modelNames('Category').pluralPascalCase).toBe('Categories');
  });

  it('handles an already-plural model name', () => {
    expect(modelNames('Settings').pluralPascalCase).toBe('Settings');
  });

  it('names files after the plural form', () => {
    expect(fileNameFor('User')).toBe('Users.ts');
  });
});

describe('findFileNameCollisions', () => {
  it('finds nothing for a normal schema', () => {
    expect(findFileNameCollisions(['User', 'Post', 'Comment'])).toEqual([]);
  });

  // Previously both models were written to one path and the last one won, so
  // one model silently got no scaffold.
  it('catches a singular and plural pair', () => {
    expect(findFileNameCollisions(['Setting', 'Settings'])).toEqual([
      { fileName: 'Settings.ts', models: ['Setting', 'Settings'] },
    ]);
  });

  it('catches irregular plurals', () => {
    expect(findFileNameCollisions(['Person', 'People'])).toEqual([
      { fileName: 'People.ts', models: ['Person', 'People'] },
    ]);
    expect(findFileNameCollisions(['User', 'Users'])).toEqual([
      { fileName: 'Users.ts', models: ['User', 'Users'] },
    ]);
  });

  // macOS and Windows file systems are case-insensitive, so these are one file
  // there even though they are two on Linux.
  it('treats names differing only by case as colliding', () => {
    const found = findFileNameCollisions(['Data', 'data']);
    expect(found).toHaveLength(1);
    expect(found[0].models).toEqual(['Data', 'data']);
  });

  it('reports every colliding group', () => {
    expect(
      findFileNameCollisions([
        'Setting',
        'Settings',
        'Person',
        'People',
        'Post',
      ]),
    ).toHaveLength(2);
  });
});

describe('resolveClientImport', () => {
  it('uses @prisma/client for the legacy provider with default output', () => {
    expect(
      resolveClientImport(
        '/app/prisma/models',
        generator('prisma-client-js', null, {}, false),
      ),
    ).toBe('@prisma/client');
  });

  // The old code hardcoded '@prisma/client', which does not resolve under the
  // provider Prisma 7 recommends, so every emitted file failed to compile.
  it('points at the generated client.ts for the prisma-client provider', () => {
    expect(
      resolveClientImport(
        '/app/src/models',
        generator('prisma-client', '/app/src/generated/prisma'),
      ),
    ).toBe('../generated/prisma/client');
  });

  it('appends the client importFileExtension so ESM output resolves', () => {
    expect(
      resolveClientImport(
        '/app/src/models',
        generator('prisma-client', '/app/src/generated/prisma', {
          importFileExtension: 'js',
          moduleFormat: 'esm',
        }),
      ),
    ).toBe('../generated/prisma/client.js');
  });

  it('handles a custom output for the legacy provider', () => {
    expect(
      resolveClientImport(
        '/app/src/models',
        generator('prisma-client-js', '/app/src/generated/client'),
      ),
    ).toBe('../generated/client');
  });

  it('falls back to @prisma/client when no client generator is present', () => {
    expect(resolveClientImport('/app/src/models', undefined)).toBe(
      '@prisma/client',
    );
  });
});

describe('emitModelFile', () => {
  it('emits a class for WRAP', () => {
    const text = emitModelFile({
      modelName: 'User',
      behavior: 'WRAP',
      clientImport: '@prisma/client',
    });
    expect(text).toContain(
      'import type { PrismaClient } from "@prisma/client"',
    );
    expect(text).toContain('export class Users');
    expect(text).toContain("PrismaClient['user']");
  });

  it('emits an Object.assign function for EXTEND', () => {
    const text = emitModelFile({
      modelName: 'User',
      behavior: 'EXTEND',
      clientImport: '@prisma/client',
    });
    expect(text).toContain('export function Users');
    expect(text).toContain('Object.assign(prismaUser');
  });

  it('emits a Prisma.defineExtension for EXTEND_CLIENT', () => {
    const text = emitModelFile({
      modelName: 'User',
      behavior: 'EXTEND_CLIENT',
      clientImport: '../generated/prisma/client',
    });
    expect(text).toContain(
      'import { Prisma } from "../generated/prisma/client"',
    );
    expect(text).toContain(
      'export const UsersExtension = Prisma.defineExtension',
    );
    expect(text).toContain('model: {');
    expect(text).toContain('user: {');
  });

  // Byte-stability matters: the manifest stores a hash of what was emitted, so
  // any run-to-run variation would make untouched files look edited.
  it('is byte-stable across calls', () => {
    const once = emitModelFile({
      modelName: 'User',
      behavior: 'EXTEND_CLIENT',
      clientImport: '@prisma/client',
    });
    const twice = emitModelFile({
      modelName: 'User',
      behavior: 'EXTEND_CLIENT',
      clientImport: '@prisma/client',
    });
    expect(once).toBe(twice);
  });

  it('contains no CRLF line endings', () => {
    const text = emitModelFile({
      modelName: 'User',
      behavior: 'WRAP',
      clientImport: '@prisma/client',
    });
    expect(text).not.toContain('\r');
  });

  it('tells the reader the file is safe to edit', () => {
    const text = emitModelFile({
      modelName: 'User',
      behavior: 'WRAP',
      clientImport: '@prisma/client',
    });
    expect(text).toContain('This file is yours to edit');
  });
});

describe('configSchema', () => {
  it('defaults to WRAP and force off', () => {
    expect(configSchema.parse({})).toEqual({ behavior: 'WRAP', force: false });
  });

  it('accepts the new EXTEND_CLIENT behavior', () => {
    expect(configSchema.parse({ behavior: 'EXTEND_CLIENT' }).behavior).toBe(
      'EXTEND_CLIENT',
    );
  });

  // Generator block values arrive as strings, never booleans.
  it('parses force from the string Prisma actually passes', () => {
    expect(configSchema.parse({ force: 'true' }).force).toBe(true);
    expect(configSchema.parse({ force: 'false' }).force).toBe(false);
  });

  it('rejects an unknown behavior instead of silently emitting nothing', () => {
    expect(configSchema.safeParse({ behavior: 'NOPE' }).success).toBe(false);
  });
});
