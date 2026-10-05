import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    memoryNoticeWindowMs,
    memorySizeLimitBytes,
    takeMemorySizeNotice,
} from './memory-size-notice.ts';

let agentRoot: string;
let workspaceDir: string;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-memory-notice-'));
    workspaceDir = join(agentRoot, 'workspace');
    await mkdir(workspaceDir, { recursive: true });
});

afterEach(async () => {
    await rm(agentRoot, { force: true, recursive: true });
});

async function writeMemory(bytes: number): Promise<void> {
    await writeFile(join(workspaceDir, 'MEMORY.md'), 'x'.repeat(bytes));
}

const start = Date.parse('2026-09-28T12:00:00.000Z');

test('a MEMORY.md at or under 16 KiB produces nothing, and a missing one is not an error', async () => {
    expect(await takeMemorySizeNotice({ agentRoot, now: start, workspaceDir })).toBeNull();
    await writeMemory(memorySizeLimitBytes);
    expect(await takeMemorySizeNotice({ agentRoot, now: start, workspaceDir })).toBeNull();
});

test('one byte over the limit produces the notice with the Manual command', async () => {
    await writeMemory(memorySizeLimitBytes + 1);

    const notice = await takeMemorySizeNotice({ agentRoot, now: start, workspaceDir });

    expect(notice).toContain('MEMORY.md is 16.0 KiB, over 16.0 KiB.');
    expect(notice).toContain('keep hot memory short and move deeper knowledge into notes/');
    expect(notice).toContain(
        'haus manual get recipes/technique/memory-hygiene --intent "MEMORY.md is over its size limit" --reason "I am tidying my memory"'
    );
    expect(notice).toContain('Not a request from anyone');
});

test('the notice repeats at most once per window, and only while still over', async () => {
    await writeMemory(memorySizeLimitBytes * 2);
    expect(await takeMemorySizeNotice({ agentRoot, now: start, workspaceDir })).toContain(
        'MEMORY.md is 32.0 KiB'
    );
    // Every other turn in the window stays quiet.
    expect(
        await takeMemorySizeNotice({
            agentRoot,
            now: start + memoryNoticeWindowMs - 1,
            workspaceDir,
        })
    ).toBeNull();
    // After the window it returns while the file is still over...
    expect(
        await takeMemorySizeNotice({ agentRoot, now: start + memoryNoticeWindowMs, workspaceDir })
    ).not.toBeNull();
    // ...and never once the Agent has trimmed it.
    await writeMemory(1024);
    expect(
        await takeMemorySizeNotice({
            agentRoot,
            now: start + memoryNoticeWindowMs * 3,
            workspaceDir,
        })
    ).toBeNull();
});
