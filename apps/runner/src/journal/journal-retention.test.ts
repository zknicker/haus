import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJournalUploads } from './journal-uploads.ts';

let dataDir: string;
afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
});

test('a stored upload prunes uploaded journals past the window while the runner stays connected', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-journal-retention-'));
    const directory = join(dataDir, 'agents', 'agt_alpha', 'runtime', 'execution-journal');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'run_old.json'), '{}');
    await writeFile(join(directory, 'run_old.uploaded'), '{}');
    const old = new Date('2026-09-01T00:00:00Z');
    await utimes(join(directory, 'run_old.uploaded'), old, old);
    const uploads = createJournalUploads({
        dataDir,
        environment: {},
        log: () => undefined,
        now: () => Date.parse('2026-11-20T00:00:00Z'),
        runnerToken: 'runner-token-0123456789abcdef0123456789',
    });
    uploads.connected(() => true);
    await uploads.pruned();
    await writeFile(join(directory, 'run_later.json'), '{}');
    await writeFile(join(directory, 'run_later.uploaded'), '{}');
    await utimes(join(directory, 'run_later.uploaded'), old, old);

    uploads.acknowledge({
        agentId: 'agt_alpha',
        runId: 'run_current',
        status: 'stored',
        throughSequence: 1,
        type: 'agent-execution-journal-ack',
    });
    await uploads.pruned();

    expect(await readdir(directory)).toEqual([]);
});
