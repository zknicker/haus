import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDispatchLedger } from '../dispatch/ledger.ts';
import { createConnectionBook } from '../model-connections/connection-book.ts';
import { createTurnHost } from './turn-host.ts';

let dataDir: string;
afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
});

test('a full reset deletes the Agent data on the volume, and a restart or session reset keeps it', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-reset-'));
    const agentDir = (agentId: string) => join(dataDir, 'agents', agentId);
    for (const agentId of ['agt_kept', 'agt_reset']) {
        await mkdir(join(agentDir(agentId), 'claude'), { recursive: true });
        await writeFile(join(agentDir(agentId), 'session.json'), '{"generation":1}');
    }
    const turnHost = createTurnHost({
        book: createConnectionBook(),
        config: { dataDir, maxWarm: 1 },
        ledger: openDispatchLedger(dataDir),
        link: { send: () => undefined },
        log: () => undefined,
    });

    await turnHost.resetAgent('agt_kept', 'restart');
    await turnHost.resetAgent('agt_kept', 'session');
    await turnHost.resetAgent('agt_reset', 'full');
    await expect(turnHost.resetAgent('../agt_kept', 'full')).rejects.toThrow(
        'is not an Agent id that can name a directory.'
    );
    await expect(turnHost.resetAgent('..', 'full')).rejects.toThrow(
        'is not an Agent id that can name a directory.'
    );
    await turnHost.close();

    expect(await readdir(join(dataDir, 'agents'))).toEqual(['agt_kept']);
    expect((await readdir(agentDir('agt_kept'))).toSorted()).toEqual(['claude', 'session.json']);
});
