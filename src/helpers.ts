import { SourceFile } from 'ts-morph';

export const generatePrismaClientImport = (sourceFile: SourceFile) => {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@prisma/client',
    namedImports: ['PrismaClient'],
  });
};
