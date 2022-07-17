import { DMMF as PrismaDMMF } from '@prisma/client/runtime';
import { parseEnvValue, getDMMF } from '@prisma/internals';
import { EnvValue, GeneratorOptions } from '@prisma/generator-helper';
import { promises as fs } from 'fs';
import path from 'path';
import { Scope, StructureKind } from 'ts-morph';
import pluralize from 'pluralize';
import removeDir from './utils/removeDir';
import { generatePrismaClientImport } from './helpers';
import { project } from './project';
import { configSchema } from './config';
import { ModelsPlural } from './types';

export async function generate(options: GeneratorOptions) {
  const outputDir = parseEnvValue(options.generator.output as EnvValue);
  const results = configSchema.safeParse(options.generator.config);
  if (!results.success) throw new Error('Invalid options passed');
  const config = results.data;

  await fs.mkdir(outputDir, { recursive: true });
  await removeDir(outputDir, true);

  const prismaClientProvider = options.otherGenerators.find(
    (it) => parseEnvValue(it.provider) === 'prisma-client-js',
  );

  const prismaClientDmmf = await getDMMF({
    datamodel: options.datamodel,
    previewFeatures: prismaClientProvider?.previewFeatures,
  });

  const modelsPlural = prismaClientDmmf.mappings.modelOperations.reduce(
    (result: ModelsPlural, current: PrismaDMMF.ModelMapping) => {
      const modelName = current.model.toLowerCase();
      const plural = pluralize(modelName);
      result[modelName] = {
        pluralCamelCase: plural.slice(0, 1).toUpperCase() + plural.slice(1),
        singularLowerCase:
          current.model.slice(0, 1).toLowerCase() + current.model.slice(1),
        singularCamelCase:
          current.model.slice(0, 1).toUpperCase() + current.model.slice(1),
      };
      return result;
    },
    {},
  );

  prismaClientDmmf.datamodel.models.forEach((model) => {
    const modelName = modelsPlural[model.name.toLowerCase()];
    const { pluralCamelCase, singularCamelCase, singularLowerCase } = modelName;
    const modelFile = project.createSourceFile(
      path.resolve(outputDir, `${pluralCamelCase}.ts`),
      undefined,
      { overwrite: true },
    );

    if (config.behavior === 'WRAP') {
      modelFile.addClass({
        name: pluralCamelCase,
        isExported: true,
        ctors: [
          {
            kind: StructureKind.Constructor,
            parameters: [
              {
                name: `prisma${singularCamelCase}`,
                type: `PrismaClient['${singularLowerCase}']`,
                isReadonly: true,
                scope: Scope.Private,
              },
            ],
          },
        ],
      });
    } else if (config.behavior === 'EXTEND') {
      modelFile.addFunction({
        name: pluralCamelCase,
        isExported: true,
        parameters: [
          {
            name: `prisma${singularCamelCase}`,
            type: `PrismaClient['${singularLowerCase}']`,
          },
        ],
        statements: [
          `return Object.assign(prisma${singularCamelCase}, {
            // define methods here, comma-separated
           });`,
        ],
      });
    }

    generatePrismaClientImport(modelFile);

    modelFile.formatText({
      indentSize: 2,
    });
  });

  await project.save();
}
