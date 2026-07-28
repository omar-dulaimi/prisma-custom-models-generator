import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Name of the bookkeeping file written into the output directory.
 *
 * Its only job is to let a later run tell three cases apart:
 *   1. a file this generator wrote and the user has not touched,
 *   2. a file this generator wrote and the user has since edited,
 *   3. a file this generator has never written.
 *
 * Without it the generator cannot distinguish its own output from the user's
 * work, which is exactly why previous versions resorted to deleting the whole
 * output directory on every run.
 */
export const MANIFEST_FILENAME = '.prisma-custom-models.json';

export const MANIFEST_VERSION = 1;

export type Manifest = {
  /** Schema version of this file, so future releases can migrate it. */
  version: number;
  /** Written for humans debugging a diff; never read back. */
  generator: string;
  /**
   * Map of output-relative POSIX path -> sha256 of the exact bytes we wrote.
   * A file is "ours and pristine" only if its current hash matches.
   */
  files: Record<string, string>;
};

export function emptyManifest(generator: string): Manifest {
  return { version: MANIFEST_VERSION, generator, files: {} };
}

export function hashContents(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

/** Normalise to a POSIX-style relative key so manifests survive OS changes. */
export function manifestKey(outputDir: string, filePath: string): string {
  return path.relative(outputDir, filePath).split(path.sep).join('/');
}

/**
 * Read the manifest, tolerating every kind of damage.
 *
 * A missing, truncated, hand-edited or wrong-version manifest must never abort
 * `prisma generate`, and must never be treated as "these files are mine". We
 * fall back to an empty manifest, which makes the generator maximally cautious:
 * it will then refuse to touch any file that already exists.
 */
export async function readManifest(
  outputDir: string,
  generator: string,
): Promise<Manifest> {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf8');
  } catch {
    return emptyManifest(generator);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    if (parsed.version !== MANIFEST_VERSION) return emptyManifest(generator);
    if (!parsed.files || typeof parsed.files !== 'object') {
      return emptyManifest(generator);
    }
    const files: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.files)) {
      if (typeof value === 'string') files[key] = value;
    }
    return { version: MANIFEST_VERSION, generator, files };
  } catch {
    return emptyManifest(generator);
  }
}

export async function writeManifest(
  outputDir: string,
  manifest: Manifest,
): Promise<void> {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  const ordered: Record<string, string> = {};
  for (const key of Object.keys(manifest.files).sort()) {
    ordered[key] = manifest.files[key];
  }
  const body = JSON.stringify(
    {
      version: manifest.version,
      generator: manifest.generator,
      files: ordered,
    },
    null,
    2,
  );
  await fs.writeFile(manifestPath, `${body}\n`, 'utf8');
}
