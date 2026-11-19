import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { RuntimeResumeRejectedError } from '../turn/resume-rejected.ts';
import { openPiStorage, piSessionFile } from './pi-storage.ts';

const context = BACKGROUND_CONTEXT;
const sessionId = '0193a2b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b';
const directories: string[] = [];

afterEach(async () => {
    for (const directory of directories.splice(0)) {
        await rm(directory, { force: true, recursive: true });
    }
});

async function agentDir() {
    const directory = await mkdtemp(join(tmpdir(), 'haus-pi-storage-'));
    directories.push(directory);
    return directory;
}

async function openHarness(dir: string, resume: boolean) {
    const storage = await openPiStorage(dir, { nativeSessionId: sessionId, resume });
    return await Harness.open(
        storage,
        { models: createModels(), registry: createRegistry() },
        context
    );
}

describe('Pi session storage', () => {
    test('a committed entry survives closing and reopening the SQLite store under Bun', async () => {
        const dir = await agentDir();
        const first = await openHarness(dir, false);
        const root = await first.root(context, {
            agent: { model: { modelId: 'grok-4.7', provider: 'xai' } },
        });
        await root.submit(
            { entry: { data: 'kept across a restart', kind: 'haus.probe' }, type: 'write' },
            context
        );
        await first.close(context);

        const second = await openHarness(dir, true);
        const reopened = await second.root(context);
        const page = await reopened.entries({ order: 'ascending' }, 10, undefined, context);
        await second.close(context);

        expect(piSessionFile(dir, sessionId)).toBe(join(dir, 'pi', sessionId, 'session.sqlite'));
        expect(reopened.id).toBe(root.id);
        expect(page.items.map((entry) => [entry.kind, entry.data])).toEqual([
            ['haus.probe', 'kept across a restart'],
        ]);
    });

    test('resuming a session whose store is gone or whose id is foreign is a resume rejection', async () => {
        const dir = await agentDir();

        const missing = openPiStorage(dir, { nativeSessionId: sessionId, resume: true });
        await expect(missing).rejects.toBeInstanceOf(RuntimeResumeRejectedError);
        await expect(missing).rejects.toMatchObject({ harness: 'pi-durable', reason: 'missing' });
        await expect(
            openPiStorage(dir, { nativeSessionId: '../../etc', resume: true })
        ).rejects.toMatchObject({
            harness: 'pi-durable',
            reason: 'invalid-state',
        });
    });
});
