import { promises as fs } from 'fs';
import path from 'path';
import type { GeneratorOptions } from '@prisma/generator';
import { configSchema } from './config';
import { emitModelFile, fileNameFor, findFileNameCollisions } from './emit';
import {
  findClientGenerator,
  parseEnvValue,
  resolveClientImport,
} from './helpers';
import { readManifest, writeManifest } from './manifest';
import { PlannedFile, reconcile, summarize } from './writer';

const LOG_PREFIX = 'prisma-custom-models-generator:';

/**
 * Log to stdout, never stderr.
 *
 * `@prisma/generator-helper` spawns generators with
 * `stdio: ['pipe', 'inherit', 'pipe', 'ipc']` and uses **stderr as the JSON-RPC
 * transport**: every line the child writes there is `JSON.parse`d, and anything
 * that fails to parse is buried in an internal `errorLogs` buffer that is only
 * surfaced under `DEBUG`. So a message written to stderr is invisible to the
 * user on a successful run, and a message that happens to be valid JSON would
 * corrupt the protocol. stdout is inherited, so it reaches the terminal.
 */
function log(message: string): void {
  process.stdout.write(`${LOG_PREFIX} ${message}\n`);
}

export async function generate(options: GeneratorOptions): Promise<void> {
  if (!options.generator.output) {
    throw new Error(
      'No output directory resolved for prisma-custom-models-generator.',
    );
  }
  const outputDir = parseEnvValue(options.generator.output);

  const parsed = configSchema.safeParse(options.generator.config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `Invalid options passed to custom models generator. ${issues}`,
    );
  }
  const config = parsed.data;

  // Soft replacement for the old `requiresGenerators` manifest entry. A missing
  // client generator is a real problem for the emitted imports, but it is the
  // user's schema to arrange, and aborting the whole `prisma generate` run over
  // it is what made this generator unusable on Prisma 7.
  const clientGenerator = findClientGenerator(options.otherGenerators);
  if (!clientGenerator) {
    log(
      'no `prisma-client` or `prisma-client-js` generator found in your schema; ' +
        "emitted files will import from '@prisma/client', which may not resolve.",
    );
  }
  const clientImport = resolveClientImport(outputDir, clientGenerator);

  // `options.dmmf` is handed to us already parsed. The previous version called
  // `getDMMF` from its own bundled `@prisma/internals`, which re-parsed the
  // schema with a second, older Prisma. That copy demanded a `datasource url`
  // that Prisma 7 rejects, so no single schema could satisfy both parsers.
  const models = options.dmmf.datamodel.models;

  // Fail loudly rather than emit one scaffold for two models. Silently keeping
  // whichever model came last is worse than not generating: the user gets no
  // file for one of their models and no indication why.
  const collisions = findFileNameCollisions(models.map((model) => model.name));
  if (collisions.length > 0) {
    const detail = collisions
      .map(
        ({ fileName, models: names }) =>
          `${names.join(' and ')} both map to ${fileName}`,
      )
      .join('; ');
    throw new Error(
      `Model names collide after pluralisation: ${detail}. ` +
        'File names come from the pluralised model name, so these models cannot ' +
        'each get their own file. Rename one of the models, or point this ' +
        'generator at a schema that does not contain both.',
    );
  }

  const planned: PlannedFile[] = models.map((model) => ({
    filePath: path.resolve(outputDir, fileNameFor(model.name)),
    contents: emitModelFile({
      modelName: model.name,
      behavior: config.behavior,
      clientImport,
    }),
  }));

  // Only now that the schema is known good: a failed run should not leave an
  // empty output directory behind.
  await fs.mkdir(outputDir, { recursive: true });

  const manifest = await readManifest(
    outputDir,
    'prisma-custom-models-generator',
  );
  const results = await reconcile(outputDir, planned, manifest, {
    force: config.force,
  });
  await writeManifest(outputDir, manifest);

  for (const line of summarize(results)) log(line);
}
