import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../parse.ts';
import { ARTIFACT_SUBCOMMANDS } from './agent-artifact.ts';
import { runArtifactPull } from './artifact-pull.ts';
import { pushRequestId, runArtifactPush } from './artifact-push.ts';
import { createTestDrive } from './artifact-test-drive.ts';
import type { ArtifactUploader } from './artifact-upload.ts';

const command = (name: string) =>
    ({
        ...ARTIFACT_SUBCOMMANDS.find((sub) => sub.name === name),
        section: 'files',
    }) as Parameters<typeof parseArgs>[0];
let stdout: ReturnType<typeof spyOn>;
let stderr: ReturnType<typeof spyOn>;
let work: string;
beforeEach(() => {
    stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
    work = mkdtempSync(join(tmpdir(), 'haus-push-'));
});
afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
    rmSync(work, { recursive: true, force: true });
});

async function push(upload: ArtifactUploader, ...argv: string[]) {
    stdout.mockClear();
    const code = await runArtifactPush(parseArgs(command('push'), argv), upload);
    return {
        code,
        summary: JSON.parse(stdout.mock.calls.map((call: unknown[]) => String(call[0])).join('')),
    };
}
async function pull(drive: ReturnType<typeof createTestDrive>, ...argv: string[]) {
    await runArtifactPull(parseArgs(command('pull'), argv), drive.client);
}
const write = (file: string, content: string) => {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
};

test('a folder push creates every regular file under the folder name and skips noise', async () => {
    const drive = createTestDrive();
    const kit = join(work, 'kit');
    write(join(kit, 'README.md'), '# Kit\n');
    write(join(kit, 'scripts/check.py'), 'print(1)\n');
    for (const noise of [
        '.DS_Store',
        'node_modules/x/index.js',
        '.git/HEAD',
        'scripts/__pycache__/c.pyc',
        'a.md.haus-theirs',
    ]) {
        write(join(kit, noise), 'noise');
    }
    symlinkSync(join(kit, 'README.md'), join(kit, 'link.md'));
    const { code, summary } = await push(drive.upload, kit);
    expect(code).toBe(0);
    expect(summary.created.map((entry: { path: string }) => entry.path).sort()).toEqual([
        'kit/README.md',
        'kit/scripts/check.py',
    ]);
    expect(summary.skipped).toEqual([expect.stringMatching(/link\.md$/u)]);
    const recorded = JSON.parse(readFileSync(join(kit, '.haus-artifacts.json'), 'utf8'));
    expect(recorded.folder).toBe('kit');
    expect(Object.keys(recorded.files)).toEqual(['README.md', 'scripts/check.py']);

    expect((await push(drive.upload, kit)).summary.unchanged).toBe(2);
    write(join(kit, 'README.md'), '# Kit v2\n');
    const again = await push(drive.upload, kit);
    expect(again.summary.updated).toEqual([expect.objectContaining({ path: 'kit/README.md' })]);
    expect(drive.uploads.at(-1)?.baseRevisionId).toBe(recorded.files['README.md'].revision_id);
    expect(drive.text('kit/README.md')).toBe('# Kit v2\n');
});

test('conflicts are collected per file without stopping the batch, then resolved by pull, merge, push', async () => {
    const drive = createTestDrive();
    drive.seed('kit/a.md', 'a1\n');
    drive.seed('kit/b.md', 'b1\n');
    const kit = join(work, 'kit');
    await pull(drive, 'kit', kit);
    const theirs = drive.seed('kit/a.md', 'a-theirs\n');
    write(join(kit, 'a.md'), 'a-mine\n');
    write(join(kit, 'b.md'), 'b-mine\n');

    const first = await push(drive.upload, kit);
    expect(first.code).toBe(1);
    expect(first.summary.updated).toEqual([expect.objectContaining({ path: 'kit/b.md' })]);
    expect(first.summary.conflicts).toEqual([
        expect.objectContaining({
            path: 'kit/a.md',
            reason: 'changed',
            current: expect.objectContaining({
                revision_id: theirs.revision_id,
                updated_at: theirs.updated_at,
                creator: { type: 'agent', agent_id: 'agt_other' },
            }),
            pull: expect.stringMatching(/^haus files pull kit\/a\.md \S+a\.md$/u),
        }),
    ]);
    expect(drive.text('kit/a.md')).toBe('a-theirs\n');

    await pull(drive, 'kit/a.md', join(kit, 'a.md'));
    expect(readFileSync(join(kit, 'a.md.haus-theirs'), 'utf8')).toBe('a-theirs\n');
    const blocked = await push(drive.upload, kit);
    expect(blocked.code).toBe(1);
    expect(blocked.summary.unmerged).toEqual([expect.stringMatching(/a\.md$/u)]);

    write(join(kit, 'a.md'), 'a-theirs\na-mine\n');
    rmSync(join(kit, 'a.md.haus-theirs'));
    const merged = await push(drive.upload, kit);
    expect(merged.code).toBe(0);
    expect(merged.summary.updated).toEqual([expect.objectContaining({ path: 'kit/a.md' })]);
    expect(drive.text('kit/a.md')).toBe('a-theirs\na-mine\n');
});

test('a new file at a taken path is a conflict unless --replace', async () => {
    const drive = createTestDrive();
    drive.seed('notes.md', 'theirs\n');
    const file = join(work, 'notes.md');
    write(file, 'mine\n');
    const taken = await push(drive.upload, file);
    expect(taken.summary.conflicts).toEqual([
        expect.objectContaining({ reason: 'exists', base_revision_id: null }),
    ]);
    const replaced = await push(drive.upload, file, '--replace');
    expect(replaced.code).toBe(0);
    expect(drive.text('notes.md')).toBe('mine\n');
});

test('rerunning a push after a lost response reuses the request id instead of adding a revision', async () => {
    const drive = createTestDrive();
    const file = join(work, 'report.md');
    write(file, 'v1\n');
    let lose = true;
    const flaky: ArtifactUploader = async (input) => {
        const outcome = await drive.upload(input);
        if (lose) {
            lose = false;
            return { kind: 'unconfirmed', message: 'lost' };
        }
        return outcome;
    };
    const lost = await push(flaky, file, 'reports/report.md');
    expect(lost.summary.errors).toEqual([
        expect.objectContaining({ code: 'ARTIFACT_PUBLISH_UNCONFIRMED' }),
    ]);
    const retried = await push(flaky, file, 'reports/report.md');
    expect(retried.summary.created).toEqual([
        expect.objectContaining({ path: 'reports/report.md' }),
    ]);
    expect(drive.uploads[0]?.requestId).toBe(drive.uploads[1]?.requestId ?? '');
    expect(drive.files.get('reports/report.md')?.artifact.revision_number).toBe(1);
});

test('request ids are stable per path, content, base, and metadata', () => {
    const input = {
        path: 'a.md',
        sha256: 'f'.repeat(64),
        contentType: 'text/markdown',
        replace: false,
    };
    expect(pushRequestId(input)).toBe(pushRequestId({ ...input }));
    expect(pushRequestId(input)).toMatch(/^push-[a-f0-9]{40}$/u);
    for (const changed of [
        { path: 'b.md' },
        { sha256: 'e'.repeat(64) },
        { baseRevisionId: 'rev_1' },
        { replace: true },
        { title: 'A' },
        { contentType: 'text/plain' },
    ]) {
        expect(pushRequestId({ ...input, ...changed })).not.toBe(pushRequestId(input));
    }
});

test('a pulled file that moved on the drive but did not change follows the move', async () => {
    const drive = createTestDrive();
    drive.seed('drafts/plan.md', 'p1\n');
    const local = join(work, 'drafts');
    await pull(drive, 'drafts', local);
    drive.move('drafts/plan.md', 'plans/plan.md');
    write(join(local, 'plan.md'), 'p2\n');
    const { code, summary } = await push(drive.upload, local);
    expect(code).toBe(0);
    expect(summary.updated).toEqual([expect.objectContaining({ path: 'plans/plan.md' })]);
    expect(drive.text('plans/plan.md')).toBe('p2\n');
});

test('--dry-run plans without uploading, and --title needs a single file', async () => {
    const drive = createTestDrive();
    const kit = join(work, 'kit');
    write(join(kit, 'a.md'), 'a\n');
    write(join(kit, 'b.md'), 'b\n');
    const { summary } = await push(drive.upload, kit, 'shared/kit', '--dry-run');
    expect(summary.planned).toEqual([
        expect.objectContaining({ action: 'create', path: 'shared/kit/a.md' }),
        expect.objectContaining({ action: 'create', path: 'shared/kit/b.md' }),
    ]);
    expect(drive.uploads).toHaveLength(0);
    await expect(push(drive.upload, kit, '--title', 'Kit')).rejects.toThrow(/single-file/u);
});
