import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activateHausRelease } from '../src/haus-server-activation.ts';

const nextRevision = '2222222222222222222222222222222222222222';

test('bootstraps an unloaded Server only after switching the initial release', async () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-initial-activation-'));
    const next = makeRelease(root, nextRevision, 'next');

    try {
        await activateHausRelease({
            deployRoot: root,
            restartServer: () => {
                throw new Error('initial activation must not restart an unloaded label');
            },
            serverHealthy: (previousPid) => Promise.resolve(previousPid === null),
            sourceRevision: nextRevision,
            startServer: () => {
                expect(readlinkSync(join(root, 'current'))).toBe(next);
                return Promise.resolve({ introducedLabel: true, previousPid: null });
            },
            stopServer: () => {
                throw new Error('healthy initial activation must keep the label loaded');
            },
        });

        expect(readlinkSync(join(root, 'current'))).toBe(next);
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('activates an initial release through an already loaded Server label', async () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-loaded-initial-activation-'));
    const next = makeRelease(root, nextRevision, 'next');
    let stops = 0;

    try {
        await activateHausRelease({
            deployRoot: root,
            restartServer: () => null,
            serverHealthy: (previousPid) => Promise.resolve(previousPid === '301'),
            sourceRevision: nextRevision,
            startServer: () => ({ introducedLabel: false, previousPid: '301' }),
            stopServer: () => {
                stops += 1;
            },
        });

        expect(readlinkSync(join(root, 'current'))).toBe(next);
        expect(stops).toBe(0);
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('preserves current when a failed start cannot prove the Server label stopped', async () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-initial-bootstrap-failure-'));
    const next = makeRelease(root, nextRevision, 'next');
    let stops = 0;

    try {
        await expect(
            activateHausRelease({
                deployRoot: root,
                restartServer: () => null,
                serverHealthy: () => Promise.resolve(true),
                sourceRevision: nextRevision,
                startServer: () => {
                    throw new Error('launchctl failed with exit code 5.');
                },
                stopServer: () => {
                    stops += 1;
                },
            })
        ).rejects.toThrow('current remains on the failed release');

        expect(stops).toBe(0);
        expect(readlinkSync(join(root, 'current'))).toBe(next);
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('preserves current when a preloaded Server fails initial health', async () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-loaded-initial-failure-'));
    const next = makeRelease(root, nextRevision, 'next');
    let stops = 0;

    try {
        await expect(
            activateHausRelease({
                deployRoot: root,
                restartServer: () => null,
                serverHealthy: () => Promise.resolve(false),
                sourceRevision: nextRevision,
                startServer: () => ({ introducedLabel: false, previousPid: '301' }),
                stopServer: () => {
                    stops += 1;
                },
            })
        ).rejects.toThrow('current remains on the failed release');

        expect(stops).toBe(0);
        expect(readlinkSync(join(root, 'current'))).toBe(next);
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('boots out an introduced label before removing a failed initial release', async () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-initial-rollback-'));
    const next = makeRelease(root, nextRevision, 'next');
    let listening = true;
    let stops = 0;

    try {
        await expect(
            activateHausRelease({
                deployRoot: root,
                restartServer: () => null,
                serverHealthy: () => Promise.resolve(false),
                sourceRevision: nextRevision,
                startServer: () => ({ introducedLabel: true, previousPid: null }),
                stopServer: () => {
                    expect(readlinkSync(join(root, 'current'))).toBe(next);
                    listening = false;
                    stops += 1;
                },
            })
        ).rejects.toThrow('rolled back');

        expect(stops).toBe(1);
        expect(listening).toBeFalse();
        expect(existsSync(join(root, 'current'))).toBeFalse();
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('preserves current when bootout cannot stop its introduced label', async () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-initial-bootout-failure-'));
    const next = makeRelease(root, nextRevision, 'next');

    try {
        let failure: unknown;
        try {
            await activateHausRelease({
                deployRoot: root,
                restartServer: () => null,
                serverHealthy: () => Promise.resolve(false),
                sourceRevision: nextRevision,
                startServer: () => ({ introducedLabel: true, previousPid: null }),
                stopServer: () => {
                    throw new Error('launchctl failed with exit code 5.');
                },
            });
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain('could not stop the introduced Server label');
        expect((failure as Error).cause).toBeInstanceOf(AggregateError);
        expect(((failure as Error).cause as AggregateError).errors).toHaveLength(2);
        expect(readlinkSync(join(root, 'current'))).toBe(next);
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

function makeRelease(root: string, sourceRevision: string, content: string) {
    const releaseRoot = join(root, 'releases', sourceRevision);
    mkdirSync(join(releaseRoot, 'bin'), { recursive: true });
    writeFileSync(join(releaseRoot, 'bin/haus-server'), content);
    writeFileSync(
        join(releaseRoot, 'release.json'),
        `${JSON.stringify({
            productVersion: '2.0.0',
            releaseId: `1.0.0+git.${sourceRevision.slice(0, 12)}`,
            serverVersion: '1.0.0',
            sourceRevision,
        })}\n`
    );
    return releaseRoot;
}
