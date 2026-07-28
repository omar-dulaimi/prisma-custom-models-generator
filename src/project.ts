import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  CompilerOptions,
} from 'ts-morph';

const compilerOptions: CompilerOptions = {
  target: ScriptTarget.ES2023,
  module: ModuleKind.ESNext,
  moduleResolution: ModuleResolutionKind.Bundler,
  esModuleInterop: true,
  strict: true,
};

/**
 * ts-morph is used purely as a code formatter here, never as a file writer.
 *
 * Using an in-memory file system means emission is a pure function from the
 * DMMF to a string. Nothing reaches disk until `writer.reconcile` has decided
 * that writing is safe, which is what stops the generator from clobbering
 * hand-written code.
 */
export function createProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { ...compilerOptions },
  });
}
