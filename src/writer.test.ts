import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emptyManifest,
  hashContents,
  readManifest,
  writeManifest,
} from './manifest';
import { PlannedFile, reconcile, summarize } from './writer';

let outputDir: string;

beforeEach(async () => {
  outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcmg-writer-'));
});

afterEach(async () => {
  await fs.rm(outputDir, { recursive: true, force: true });
});

const plan = (name: string, contents: string): PlannedFile => ({
  filePath: path.join(outputDir, name),
  contents,
});

const read = (name: string) => fs.readFile(path.join(outputDir, name), 'utf8');
const exists = async (name: string) =>
  fs
    .access(path.join(outputDir, name))
    .then(() => true)
    .catch(() => false);

const fresh = () => emptyManifest('test');

describe('reconcile', () => {
  it('creates files that do not exist', async () => {
    const manifest = fresh();
    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'scaffold')],
      manifest,
      { force: false },
    );

    expect(results).toEqual([{ file: 'Users.ts', action: 'created' }]);
    expect(await read('Users.ts')).toBe('scaffold');
    expect(manifest.files['Users.ts']).toBe(hashContents('scaffold'));
  });

  // This is the regression test for the defect that made the tool unusable:
  // `prisma generate` wiped the output directory, destroying the hand-written
  // methods the scaffolds exist to hold.
  it('preserves a scaffold the user has edited', async () => {
    const manifest = fresh();
    await reconcile(outputDir, [plan('Users.ts', 'scaffold')], manifest, {
      force: false,
    });

    const edited = 'scaffold\n// my hand-written method\n';
    await fs.writeFile(path.join(outputDir, 'Users.ts'), edited);

    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'scaffold')],
      manifest,
      { force: false },
    );

    expect(results).toEqual([{ file: 'Users.ts', action: 'preserved' }]);
    expect(await read('Users.ts')).toBe(edited);
  });

  it('keeps preserving across repeated runs', async () => {
    const manifest = fresh();
    await reconcile(outputDir, [plan('Users.ts', 'scaffold')], manifest, {
      force: false,
    });
    const edited = 'scaffold\n// mine\n';
    await fs.writeFile(path.join(outputDir, 'Users.ts'), edited);

    for (let run = 0; run < 3; run += 1) {
      const results = await reconcile(
        outputDir,
        [plan('Users.ts', 'scaffold')],
        manifest,
        { force: false },
      );
      expect(results).toEqual([{ file: 'Users.ts', action: 'preserved' }]);
      expect(await read('Users.ts')).toBe(edited);
    }
  });

  // The other half of the same defect: files that merely happened to live in
  // the output directory were deleted too.
  it('never touches files it did not write', async () => {
    await fs.writeFile(path.join(outputDir, 'NOTES.md'), 'notes');
    await fs.mkdir(path.join(outputDir, 'nested'), { recursive: true });
    await fs.writeFile(path.join(outputDir, 'nested/deep.ts'), 'deep');

    const manifest = fresh();
    await reconcile(outputDir, [plan('Users.ts', 'scaffold')], manifest, {
      force: false,
    });

    expect(await read('NOTES.md')).toBe('notes');
    expect(await read('nested/deep.ts')).toBe('deep');
    expect(manifest.files['NOTES.md']).toBeUndefined();
  });

  it('refuses to adopt a pre-existing file at a scaffold path', async () => {
    await fs.writeFile(path.join(outputDir, 'Users.ts'), 'written by hand');

    const manifest = fresh();
    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'scaffold')],
      manifest,
      { force: false },
    );

    expect(results).toEqual([{ file: 'Users.ts', action: 'foreign' }]);
    expect(await read('Users.ts')).toBe('written by hand');
    expect(manifest.files['Users.ts']).toBeUndefined();
  });

  it('refreshes its own pristine file when the scaffold changes', async () => {
    const manifest = fresh();
    await reconcile(outputDir, [plan('Users.ts', 'v1')], manifest, {
      force: false,
    });

    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'v2')],
      manifest,
      {
        force: false,
      },
    );

    expect(results).toEqual([{ file: 'Users.ts', action: 'updated' }]);
    expect(await read('Users.ts')).toBe('v2');
  });

  it('reports unchanged when nothing moved', async () => {
    const manifest = fresh();
    await reconcile(outputDir, [plan('Users.ts', 'same')], manifest, {
      force: false,
    });
    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'same')],
      manifest,
      { force: false },
    );
    expect(results).toEqual([{ file: 'Users.ts', action: 'unchanged' }]);
  });

  it('removes a pristine scaffold whose model left the schema', async () => {
    const manifest = fresh();
    await reconcile(
      outputDir,
      [plan('Users.ts', 'u'), plan('Posts.ts', 'p')],
      manifest,
      { force: false },
    );

    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'u')],
      manifest,
      {
        force: false,
      },
    );

    expect(results).toContainEqual({ file: 'Posts.ts', action: 'removed' });
    expect(await exists('Posts.ts')).toBe(false);
    expect(manifest.files['Posts.ts']).toBeUndefined();
  });

  it('keeps an edited scaffold whose model left the schema', async () => {
    const manifest = fresh();
    await reconcile(
      outputDir,
      [plan('Users.ts', 'u'), plan('Posts.ts', 'p')],
      manifest,
      { force: false },
    );
    await fs.writeFile(path.join(outputDir, 'Posts.ts'), 'p\n// mine\n');

    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'u')],
      manifest,
      {
        force: false,
      },
    );

    expect(results).toContainEqual({ file: 'Posts.ts', action: 'orphaned' });
    expect(await read('Posts.ts')).toBe('p\n// mine\n');
  });

  it('drops manifest entries for files the user deleted', async () => {
    const manifest = fresh();
    await reconcile(outputDir, [plan('Users.ts', 'u')], manifest, {
      force: false,
    });
    await fs.unlink(path.join(outputDir, 'Users.ts'));

    await reconcile(outputDir, [], manifest, { force: false });
    expect(manifest.files['Users.ts']).toBeUndefined();
  });

  it('overwrites edits only when force is enabled', async () => {
    const manifest = fresh();
    await reconcile(outputDir, [plan('Users.ts', 'scaffold')], manifest, {
      force: false,
    });
    await fs.writeFile(path.join(outputDir, 'Users.ts'), 'edited');

    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'scaffold')],
      manifest,
      { force: true },
    );

    expect(results).toEqual([{ file: 'Users.ts', action: 'overwritten' }]);
    expect(await read('Users.ts')).toBe('scaffold');
  });

  it('creates missing parent directories', async () => {
    const manifest = fresh();
    await reconcile(outputDir, [plan('a/b/Users.ts', 'x')], manifest, {
      force: false,
    });
    expect(await read('a/b/Users.ts')).toBe('x');
    expect(manifest.files['a/b/Users.ts']).toBe(hashContents('x'));
  });
});

describe('manifest durability', () => {
  it('treats a corrupt manifest as empty, so existing files are left alone', async () => {
    await fs.writeFile(
      path.join(outputDir, '.prisma-custom-models.json'),
      '{ not json',
    );
    await fs.writeFile(path.join(outputDir, 'Users.ts'), 'precious');

    const manifest = await readManifest(outputDir, 'test');
    const results = await reconcile(
      outputDir,
      [plan('Users.ts', 'scaffold')],
      manifest,
      { force: false },
    );

    expect(results).toEqual([{ file: 'Users.ts', action: 'foreign' }]);
    expect(await read('Users.ts')).toBe('precious');
  });

  it('treats an unknown manifest version as empty', async () => {
    await fs.writeFile(
      path.join(outputDir, '.prisma-custom-models.json'),
      JSON.stringify({ version: 999, files: { 'Users.ts': 'deadbeef' } }),
    );
    const manifest = await readManifest(outputDir, 'test');
    expect(manifest.files).toEqual({});
  });

  it('round-trips through disk', async () => {
    const manifest = fresh();
    manifest.files['Users.ts'] = hashContents('x');
    await writeManifest(outputDir, manifest);
    const reread = await readManifest(outputDir, 'test');
    expect(reread.files).toEqual(manifest.files);
  });
});

describe('summarize', () => {
  it('tells the user their edits were kept', () => {
    const lines = summarize([{ file: 'Users.ts', action: 'preserved' }]);
    expect(lines.join('\n')).toContain('kept your edits');
    expect(lines.join('\n')).toContain('Users.ts');
  });

  it('says nothing when every file was simply created', () => {
    expect(summarize([{ file: 'Users.ts', action: 'created' }])).toEqual([]);
  });
});
