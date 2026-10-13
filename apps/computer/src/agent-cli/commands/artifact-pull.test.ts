import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../parse.ts';
import { ARTIFACT_SUBCOMMANDS } from './agent-artifact.ts';
import { localTargetUnder } from './artifact-local-files.ts';
import { runArtifactPull } from './artifact-pull.ts';
import { createTestDrive } from './artifact-test-drive.ts';

const spec = {
    ...ARTIFACT_SUBCOMMANDS.find((sub) => sub.name === 'pull'),
    section: 'artifact',
} as Parameters<typeof parseArgs>[0];
let stdout: ReturnType<typeof spyOn>;
let stderr: ReturnType<typeof spyOn>;
let work: string;
beforeEach(() => {
    stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
    work = mkdtempSync(join(tmpdir(), 'haus-pull-'));
});
afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
    rmSync(work, { recursive: true, force: true });
});

async function pull(drive: ReturnType<typeof createTestDrive>, ...argv: string[]) {
    stdout.mockClear();
    const code = await runArtifactPull(parseArgs(spec, argv), drive.client);
    return {
        code,
        report: JSON.parse(stdout.mock.calls.map((call: unknown[]) => String(call[0])).join('')),
    };
}
const manifest = (root: string) =>
    JSON.parse(readFileSync(join(root, '.haus-artifacts.json'), 'utf8'));

test('a folder pull pages through the drive, keeps relative paths, and records a manifest', async () => {
    const drive = createTestDrive(2);
    const check = drive.seed('kit/scripts/check.py', 'print(1)\n');
    drive.seed('kit/README.md', '# Kit\n');
    drive.seed('kit/data/a.csv', 'a\n');
    drive.seed('other/x.md', 'x\n');
    const root = join(work, 'kit');
    const { code, report } = await pull(drive, 'kit', root);
    expect(code).toBe(0);
    expect(report.kind).toBe('folder');
    expect(report.updated).toHaveLength(3);
    expect(readFileSync(join(root, 'scripts/check.py'), 'utf8')).toBe('print(1)\n');
    expect(existsSync(join(root, 'x.md'))).toBe(false);
    expect(statSync(join(root, 'scripts/check.py')).mode & 0o200).toBe(0o200);
    const recorded = manifest(root);
    expect(recorded.folder).toBe('kit');
    expect(recorded.files['scripts/check.py']).toEqual({
        artifact_id: check.artifact_id,
        path: 'kit/scripts/check.py',
        revision_id: check.revision_id,
        sha256: check.sha256,
    });
});

test('pulling again updates clean files, keeps local edits, and stages conflicting ones beside them', async () => {
    const drive = createTestDrive();
    drive.seed('kit/a.md', 'a1\n');
    drive.seed('kit/b.md', 'b1\n');
    drive.seed('kit/c.md', 'c1\n');
    const root = join(work, 'kit');
    await pull(drive, 'kit', root);
    expect((await pull(drive, 'kit', root)).report.unchanged).toBe(3);

    drive.seed('kit/a.md', 'a2\n');
    writeFileSync(join(root, 'b.md'), 'b-local\n');
    const theirs = drive.seed('kit/c.md', 'c2\n');
    writeFileSync(join(root, 'c.md'), 'c-local\n');
    const { report } = await pull(drive, 'kit', root);
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe('a2\n');
    expect(report.kept_local_edits).toEqual([expect.stringMatching(/b\.md$/u)]);
    expect(readFileSync(join(root, 'b.md'), 'utf8')).toBe('b-local\n');
    expect(readFileSync(join(root, 'c.md'), 'utf8')).toBe('c-local\n');
    expect(readFileSync(join(root, 'c.md.haus-theirs'), 'utf8')).toBe('c2\n');
    expect(report.merge).toEqual([
        expect.objectContaining({ path: 'kit/c.md', revision_id: theirs.revision_id }),
    ]);
    expect(manifest(root).files['c.md'].revision_id).toBe(theirs.revision_id);
});

test('files gone from the drive are removed locally only when unedited', async () => {
    const drive = createTestDrive();
    drive.seed('kit/keep.md', 'k\n');
    drive.seed('kit/gone.md', 'g\n');
    drive.seed('kit/edited.md', 'e\n');
    const root = join(work, 'kit');
    await pull(drive, 'kit', root);
    drive.remove('kit/gone.md');
    drive.remove('kit/edited.md');
    writeFileSync(join(root, 'edited.md'), 'mine\n');
    const { report } = await pull(drive, 'kit', root);
    expect(existsSync(join(root, 'gone.md'))).toBe(false);
    expect(report.removed).toEqual([expect.stringMatching(/gone\.md$/u)]);
    expect(report.orphaned).toEqual([expect.stringMatching(/edited\.md$/u)]);
    expect(Object.keys(manifest(root).files)).toEqual(['keep.md']);
});

test('a single-file pull inside a pulled folder updates that folder’s manifest', async () => {
    const drive = createTestDrive();
    drive.seed('kit/a.md', 'a1\n');
    const root = join(work, 'kit');
    await pull(drive, 'kit', root);
    const next = drive.seed('kit/a.md', 'a2\n');
    const { report } = await pull(drive, 'kit/a.md', join(root, 'a.md'));
    expect(report.kind).toBe('file');
    expect(readFileSync(join(root, 'a.md'), 'utf8')).toBe('a2\n');
    expect(manifest(root).files['a.md'].revision_id).toBe(next.revision_id);
});

test('local targets never escape the pulled folder', async () => {
    const root = join(work, 'root');
    mkdirSync(root);
    await expect(localTargetUnder(root, '../escape.md')).rejects.toThrow(/Refusing/u);
    await expect(localTargetUnder(root, '/etc/passwd')).rejects.toThrow(/Refusing/u);
    await expect(localTargetUnder(root, 'a/.haus-artifacts.json')).rejects.toThrow(/reserved/u);
    const outside = join(work, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(root, 'linked'));
    await expect(localTargetUnder(root, 'linked/file.md')).rejects.toThrow(/plain folder/u);
    symlinkSync(join(outside, 'target.md'), join(root, 'file.md'));
    await expect(localTargetUnder(root, 'file.md')).rejects.toThrow(/not a regular file/u);
    expect(await localTargetUnder(root, 'deep/ok.md')).toBe(
        join(await realRoot(root), 'deep/ok.md')
    );
});

test('a folder pull refuses to write through a symlinked subfolder', async () => {
    const drive = createTestDrive();
    drive.seed('kit/sub/a.md', 'a\n');
    const root = join(work, 'kit');
    const outside = join(work, 'outside');
    mkdirSync(root);
    mkdirSync(outside);
    symlinkSync(outside, join(root, 'sub'));
    await expect(pull(drive, 'kit', root)).rejects.toThrow(/plain folder/u);
    expect(existsSync(join(outside, 'a.md'))).toBe(false);
});

async function realRoot(root: string) {
    const { realpath } = await import('node:fs/promises');
    return realpath(root);
}
