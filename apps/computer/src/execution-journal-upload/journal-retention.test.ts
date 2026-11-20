import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { journalDirectoryPath } from '../harness/execution-journal.ts';
import { pruneSyncedJournals } from './journal-upload-ledger.ts';

let agentsDir: string;
afterEach(async () => {
    await rm(agentsDir, { force: true, recursive: true });
});

test('uploaded journals past the cutoff are deleted, and unsynced or recent ones stay', async () => {
    agentsDir = await mkdtemp(join(tmpdir(), 'haus-journal-retention-'));
    const directory = journalDirectoryPath(join(agentsDir, 'agt_alpha'));
    await mkdir(directory, { recursive: true });
    const old = new Date('2026-09-01T00:00:00Z');
    for (const runId of ['run_old_synced', 'run_old_unsynced', 'run_new_synced']) {
        await writeFile(join(directory, `${runId}.json`), '{}');
        await writeFile(join(directory, `${runId}.ndjson`), '');
    }
    await writeFile(join(directory, 'run_old_synced.uploaded'), '{}');
    await writeFile(join(directory, 'run_new_synced.uploaded'), '{}');
    await utimes(join(directory, 'run_old_synced.uploaded'), old, old);
    await utimes(join(directory, 'run_old_unsynced.json'), old, old);

    await pruneSyncedJournals({ agentsDir, before: Date.parse('2026-10-21T00:00:00Z') });

    expect((await readdir(directory)).sort()).toEqual([
        'run_new_synced.json',
        'run_new_synced.ndjson',
        'run_new_synced.uploaded',
        'run_old_unsynced.json',
        'run_old_unsynced.ndjson',
    ]);
});
