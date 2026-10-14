import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import { startCloudAgentWork } from './launch-work.ts';
import { setCloudAgentProvider } from './registry.ts';
import { readCloudAgentSettings, writeCloudAgentSettings } from './settings.ts';

test('Computer default and Claude environment survive restart without changing native settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-cloud-settings-'));
    try {
        expect(await readCloudAgentSettings(root)).toEqual({
            defaultProvider: 'cursor',
            claudeEnvironmentId: null,
        });
        await Promise.all([
            writeCloudAgentSettings(root, { defaultProvider: 'claude' }),
            writeCloudAgentSettings(root, { claudeEnvironmentId: 'env_test' }),
        ]);
        expect(await readCloudAgentSettings(root)).toEqual({
            defaultProvider: 'claude',
            claudeEnvironmentId: 'env_test',
        });
        await writeCloudAgentSettings(root, { claudeEnvironmentId: null });
        expect(await readCloudAgentSettings(root)).toEqual({
            defaultProvider: 'claude',
            claudeEnvironmentId: null,
        });
        expect((await stat(join(root, 'cloud-agents.json'))).mode & 0o777).toBe(0o600);
        expect(await readFile(join(root, 'cloud-agents.json'), 'utf8')).not.toContain('token');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('a Claude journal cannot be read through Cursor after a default changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-cloud-settings-'));
    const ref = {
        provider: 'claude' as const,
        workId: 'work',
        runId: 'run',
        providerAgentId: null,
        providerRunId: null,
    };
    try {
        const journal = new CloudLaunchJournal(root);
        await journal.claim('server', ref);
        expect((await new CloudLaunchJournal(root).read('server', ref))?.provider).toBe('claude');
        await expect(journal.read('server', { ...ref, provider: 'cursor' })).rejects.toThrow(
            'provider'
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('an unavailable selected Claude never falls back to Cursor or records a work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-cloud-settings-'));
    const cursor = createFakeCloudAgentProvider();
    const restoreCursor = setCloudAgentProvider(cursor);
    const restoreClaude = setCloudAgentProvider({
        ...createFakeCloudAgentProvider({ readiness: { ready: false, reason: 'setup-required' } }),
        provider: 'claude',
    });
    try {
        await writeCloudAgentSettings(root, { defaultProvider: 'claude' });
        await expect(
            startCloudAgentWork({
                dataRoot: root,
                runnerToken: 'not-sent',
                serverId: 'server',
                serverOrigin: 'https://not-used.invalid',
                request: {
                    content: 'Delegating',
                    instructions: 'Read-only task',
                    nonce: 'one',
                    repository: 'owner/repo',
                    startingRef: 'main',
                    target: '#all',
                    title: 'Probe',
                },
                supervisor: {
                    report() {
                        throw new Error('No work should be recorded.');
                    },
                    watch() {
                        throw new Error('No work should be watched.');
                    },
                    async reconcile() {
                        throw new Error('No work should be reconciled.');
                    },
                },
            })
        ).rejects.toThrow('secure hosted hooks');
        expect(cursor.launches).toHaveLength(0);
    } finally {
        restoreClaude();
        restoreCursor();
        await rm(root, { recursive: true, force: true });
    }
});
