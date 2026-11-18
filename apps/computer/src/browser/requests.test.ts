import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { parseBrowserRequest, runBrowserRequest } from './requests.ts';
import { disconnectBrowserService } from './service.ts';
import { getComputerBrowserSettings, saveComputerBrowserSettings } from './settings.ts';

const connection = {
    applicationPath: '/Applications/Google Chrome.app',
    userDataDir: '/not-running',
};

test('managed settings become disconnected without deleting profile data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-browser-migrate-'));
    try {
        await mkdir(join(root, 'profiles', 'work'), { recursive: true });
        const marker = join(root, 'profiles', 'work', 'Preferences');
        await writeFile(marker, 'keep');
        for (const config of [
            { enabled: true, profileName: 'work', updatedAt: '2026-09-21T10:00:00.000Z' },
            {
                enabled: true,
                connection: { kind: 'managed', applicationPath: null, profileName: 'work' },
                updatedAt: '2026-09-21T10:00:00.000Z',
            },
        ]) {
            await writeFile(join(root, 'settings.json'), JSON.stringify(config));
            expect(await getComputerBrowserSettings(root)).toMatchObject({
                connection: null,
                enabled: false,
                configured: false,
            });
            expect(await readFile(marker, 'utf8')).toBe('keep');
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('existing connections migrate and can disconnect even when the browser is unavailable', async () => {
    const runtime = makeDaemonRuntime();
    const root = await mkdtemp(join(tmpdir(), 'haus-browser-settings-'));
    try {
        await writeFile(
            join(root, 'settings.json'),
            JSON.stringify({
                enabled: true,
                connection: { kind: 'existing', ...connection },
                updatedAt: '2026-09-21T10:00:00.000Z',
            })
        );
        expect(await getComputerBrowserSettings(root)).toMatchObject({
            connection,
            enabled: true,
            configured: true,
        });
        const result = await runBrowserRequest(
            root,
            {
                type: 'browser-request',
                requestId: 'req_browser000000000',
                operation: { kind: 'save', input: { enabled: false } },
            },
            runtime
        );
        expect(result.result?.value).toMatchObject({ enabled: false, connection });
        await expect(saveComputerBrowserSettings(root, { enabled: true }, runtime)).rejects.toThrow(
            'available browser'
        );
        expect((await getComputerBrowserSettings(root)).enabled).toBe(false);
        await expect(
            saveComputerBrowserSettings(
                root,
                { connection: { applicationPath: '/not-installed', userDataDir: '/other' } },
                runtime
            )
        ).rejects.toThrow('available browser');
        expect((await getComputerBrowserSettings(root)).connection).toEqual(connection);
    } finally {
        await disconnectBrowserService();
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    }
});

test('Browser protocol has no launch or restart operation', () => {
    for (const kind of ['open', 'restart']) {
        expect(
            parseBrowserRequest({
                type: 'browser-request',
                requestId: 'req_browser000000000',
                operation: { kind },
            })
        ).toBeNull();
    }
});
