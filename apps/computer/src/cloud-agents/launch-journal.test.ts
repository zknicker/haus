import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudLaunchJournal } from './launch-journal.ts';

const roots: string[] = [];
const ref = { workId: 'caw_work', runId: 'car_run', providerAgentId: null, providerRunId: null };
const launch = {
    providerAgentId: 'provider-agent',
    providerRunId: 'provider-run',
    providerUrl: null,
    status: 'running' as const,
};

afterEach(async () => {
    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

test('only one concurrent caller admits a launch, and a restart keeps the admission', async () => {
    const root = await directory();
    const journal = new CloudLaunchJournal(root);
    const claims = await Promise.all([journal.claim('server', ref), journal.claim('server', ref)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await new CloudLaunchJournal(root).claim('server', ref)).toBe(false);
    expect(await journal.read('server', ref)).toEqual({ phase: 'launching', workId: ref.workId });
});

test('a saved provider address survives restart and contains no instructions or credential', async () => {
    const root = await directory();
    const journal = new CloudLaunchJournal(root);
    await journal.claim('server', ref);
    await journal.record('server', ref, launch);
    expect(await new CloudLaunchJournal(root).read('server', ref)).toEqual({
        phase: 'launched',
        workId: ref.workId,
        launch,
    });
    const path = await recordPath(root);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(Object.keys(JSON.parse(await readFile(path, 'utf8')))).toEqual([
        'phase',
        'workId',
        'launch',
    ]);
});

test('definite rejection survives a lost failure report', async () => {
    const root = await directory();
    const journal = new CloudLaunchJournal(root);
    await journal.claim('server', ref);
    const rejection = { errorCode: 'provider-launch-rejected', summary: 'No repository access.' };
    await journal.reject('server', ref, rejection);
    expect(await new CloudLaunchJournal(root).read('server', ref)).toEqual({
        phase: 'rejected',
        workId: ref.workId,
        ...rejection,
    });
});

test('a rejection recorded before rejections carried a reason reads as a launch rejection', async () => {
    const root = await directory();
    const journal = new CloudLaunchJournal(root);
    await journal.claim('server', ref);
    await writeFile(
        await recordPath(root),
        JSON.stringify({ phase: 'rejected', workId: ref.workId })
    );
    expect(await journal.read('server', ref)).toEqual({
        phase: 'rejected',
        workId: ref.workId,
        errorCode: 'provider-launch-rejected',
        summary: null,
    });
});

test('corrupt or mismatched records fail closed rather than admitting another launch', async () => {
    const root = await directory();
    const journal = new CloudLaunchJournal(root);
    await journal.claim('server', ref);
    await expect(journal.read('server', { ...ref, workId: 'different' })).rejects.toThrow(
        'identity'
    );
    await writeFile(await recordPath(root), '{');
    await expect(journal.read('server', ref)).rejects.toThrow();
    expect(await journal.claim('server', ref)).toBe(false);
});

test('Server partitions cannot read each other or escape the data root', async () => {
    const root = await directory();
    const journal = new CloudLaunchJournal(root);
    await journal.claim('../server', ref);
    expect(await journal.read('server', ref)).toBeNull();
    expect(await journal.read('../server', ref)).not.toBeNull();
});

async function directory() {
    const root = await mkdtemp(join(tmpdir(), 'haus-cloud-launch-'));
    roots.push(root);
    return root;
}

async function recordPath(root: string) {
    const folder = join(root, 'cloud-agent-launches');
    const [partition] = await readdir(folder);
    if (!partition) {
        throw new Error('Missing journal partition');
    }
    const [file] = await readdir(join(folder, partition));
    if (!file) {
        throw new Error('Missing journal file');
    }
    return join(folder, partition, file);
}
