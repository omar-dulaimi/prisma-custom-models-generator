import { promises as fs } from 'fs';
import path from 'path';
import {
  Manifest,
  MANIFEST_FILENAME,
  hashContents,
  manifestKey,
} from './manifest';

export type WriteAction =
  /** File did not exist. We created it. */
  | 'created'
  /** We previously wrote it, it is untouched, and the scaffold changed. */
  | 'updated'
  /** We previously wrote it, it is untouched, and the scaffold is identical. */
  | 'unchanged'
  /** We previously wrote it and the user has since edited it. Left alone. */
  | 'preserved'
  /** It exists but we have never written it. Left alone. */
  | 'foreign'
  /** Model is gone from the schema and the pristine scaffold was removed. */
  | 'removed'
  /** Model is gone but the file was edited, so it was kept. */
  | 'orphaned'
  /** Divergence was overwritten because `force` was enabled. */
  | 'overwritten';

export type WriteResult = {
  /** Output-relative POSIX path. */
  file: string;
  action: WriteAction;
};

export type PlannedFile = {
  /** Absolute path of the file to emit. */
  filePath: string;
  /** Full text to emit. */
  contents: string;
};

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Reconcile the planned scaffolds with what is already on disk.
 *
 * The contract, in one sentence: this generator only ever writes a file that it
 * created and that nobody has edited since, and only ever deletes a file that
 * it created and that nobody has edited since.
 *
 * Everything else on disk is somebody else's property. That includes files the
 * user dropped into the output directory, files another tool generated there,
 * and any scaffold the user has started filling in. Those are the files the
 * previous behaviour destroyed, and they are the whole reason this tool exists.
 *
 * `manifest` is mutated in place to reflect the new state and should be written
 * back by the caller once every file has been processed.
 */
export async function reconcile(
  outputDir: string,
  planned: PlannedFile[],
  manifest: Manifest,
  options: { force: boolean },
): Promise<WriteResult[]> {
  const results: WriteResult[] = [];
  const plannedKeys = new Set<string>();

  for (const { filePath, contents } of planned) {
    const key = manifestKey(outputDir, filePath);
    plannedKeys.add(key);

    const nextHash = hashContents(contents);
    const existing = await readIfExists(filePath);

    if (existing === null) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contents, 'utf8');
      manifest.files[key] = nextHash;
      results.push({ file: key, action: 'created' });
      continue;
    }

    const recordedHash = manifest.files[key];
    const currentHash = hashContents(existing);

    if (recordedHash === undefined) {
      // Never written by us. Adopting it would mean silently taking ownership
      // of a file we might later delete, so we leave it entirely alone.
      if (!options.force) {
        results.push({ file: key, action: 'foreign' });
        continue;
      }
      await fs.writeFile(filePath, contents, 'utf8');
      manifest.files[key] = nextHash;
      results.push({ file: key, action: 'overwritten' });
      continue;
    }

    if (currentHash !== recordedHash) {
      // The user has edited our scaffold. That edit is the product of this
      // tool; destroying it is the defect we are fixing. Keep the recorded
      // hash so a later run still recognises the file as diverged.
      if (!options.force) {
        results.push({ file: key, action: 'preserved' });
        continue;
      }
      await fs.writeFile(filePath, contents, 'utf8');
      manifest.files[key] = nextHash;
      results.push({ file: key, action: 'overwritten' });
      continue;
    }

    if (currentHash === nextHash) {
      results.push({ file: key, action: 'unchanged' });
      continue;
    }

    // Ours, pristine, and the scaffold shape changed (new version, new
    // behavior, renamed client import). Safe to refresh.
    await fs.writeFile(filePath, contents, 'utf8');
    manifest.files[key] = nextHash;
    results.push({ file: key, action: 'updated' });
  }

  // Models removed from the schema leave scaffolds behind. Clean up only the
  // ones that are still exactly as we wrote them.
  for (const key of Object.keys(manifest.files)) {
    if (plannedKeys.has(key)) continue;

    const filePath = path.join(outputDir, key);
    const existing = await readIfExists(filePath);

    if (existing === null) {
      delete manifest.files[key];
      continue;
    }

    if (hashContents(existing) === manifest.files[key]) {
      await fs.unlink(filePath);
      delete manifest.files[key];
      results.push({ file: key, action: 'removed' });
      continue;
    }

    // Edited scaffold for a model that no longer exists. Deleting it would
    // throw away hand-written code, so it stays and stops being our problem.
    delete manifest.files[key];
    results.push({ file: key, action: 'orphaned' });
  }

  return results;
}

/**
 * Human-readable summary printed to stderr after a run.
 *
 * `prisma generate` shows generator stderr, so this is where the user finds out
 * that a scaffold was skipped because they had edited it. Silence there would
 * look identical to the old destructive behaviour succeeding.
 */
export function summarize(results: WriteResult[]): string[] {
  const lines: string[] = [];
  const by = (action: WriteAction) =>
    results.filter((result) => result.action === action).map((r) => r.file);

  const preserved = by('preserved');
  const foreign = by('foreign');
  const orphaned = by('orphaned');
  const overwritten = by('overwritten');
  const removed = by('removed');

  if (preserved.length) {
    lines.push(
      `kept your edits in ${preserved.length} file(s): ${preserved.join(', ')}`,
    );
  }
  if (foreign.length) {
    lines.push(
      `left ${foreign.length} pre-existing file(s) untouched: ${foreign.join(', ')}`,
    );
  }
  if (orphaned.length) {
    lines.push(
      `these models are gone from your schema but the files were edited, so they were kept: ${orphaned.join(', ')}`,
    );
  }
  if (removed.length) {
    lines.push(
      `removed ${removed.length} unedited scaffold(s) for deleted models: ${removed.join(', ')}`,
    );
  }
  if (overwritten.length) {
    lines.push(
      `force enabled: overwrote ${overwritten.length} file(s): ${overwritten.join(', ')}`,
    );
  }
  return lines;
}

export { MANIFEST_FILENAME };
