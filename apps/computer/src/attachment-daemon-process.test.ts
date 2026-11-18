import { describe, expect, test } from 'bun:test';
import {
    type AttachmentDaemonProcessInspection,
    AttachmentDaemonProcessRegistry,
    classifyAttachmentDaemonProcess,
    commandRunsAttachmentDaemon,
    parseProcessRecord,
    planAttachmentDaemonStart,
} from './attachment-daemon-process.ts';

const staleProcessKinds: AttachmentDaemonProcessInspection['kind'][] = [
    'zombie',
    'foreign',
    'missing',
];

const marker = {
    credentialHash: 'current-hash',
    pid: 42,
};

describe('attachment daemon process identity', () => {
    test('retains only a verified daemon with the current credential', () => {
        expect(planAttachmentDaemonStart(marker, 'current-hash', { kind: 'verified' })).toEqual({
            kind: 'retain',
        });
    });

    test('restarts a verified daemon when its credential changed', () => {
        expect(planAttachmentDaemonStart(marker, 'new-hash', { kind: 'verified' })).toEqual({
            kind: 'restart',
            pid: 42,
        });
    });

    test.each(staleProcessKinds)('replaces a %s marker without authorizing a signal', (kind) => {
        expect(planAttachmentDaemonStart(marker, 'current-hash', { kind })).toEqual({
            kind: 'start',
        });
    });

    test('trusts an owned reachable child without repeatedly inspecting the host', async () => {
        let inspections = 0;
        let now = 1000;
        const registry = new AttachmentDaemonProcessRegistry(
            async () => {
                inspections += 1;
                return { kind: 'verified' };
            },
            () => true,
            () => now,
            5000
        );
        registry.recordStarted('srv_test', 42);

        expect(await registry.inspect(42, 'srv_test')).toEqual({ kind: 'verified' });
        expect(await registry.inspect(42, 'srv_test')).toEqual({ kind: 'verified' });
        expect(inspections).toBe(0);

        now += 5000;
        expect(await registry.inspect(42, 'srv_test')).toEqual({ kind: 'verified' });
        expect(inspections).toBe(1);
    });

    test('forgets an owned child when it exits', async () => {
        const registry = new AttachmentDaemonProcessRegistry(
            async () => ({ kind: 'foreign' }),
            () => false
        );
        registry.recordStarted('srv_test', 42);
        expect(await registry.inspect(42, 'srv_test')).toEqual({ kind: 'missing' });
    });

    test('reinspection rejects an owned PID that became a zombie', async () => {
        let now = 1000;
        const registry = new AttachmentDaemonProcessRegistry(
            async () => ({ kind: 'zombie' }),
            () => true,
            () => now,
            5000
        );
        registry.recordStarted('srv_test', 42);
        now += 5000;

        expect(await registry.inspect(42, 'srv_test')).toEqual({ kind: 'zombie' });
    });

    test('recognizes zombie process states', () => {
        const record = parseProcessRecord('ZN   <defunct>\n');
        expect(record).toEqual({
            command: '<defunct>',
            state: 'ZN',
        });
        expect(record && classifyAttachmentDaemonProcess(record, 'srv_test')).toEqual({
            kind: 'zombie',
        });
    });

    test('requires the exact attachment daemon argument pair', () => {
        const serverId = 'srv_test';
        expect(
            commandRunsAttachmentDaemon(
                'bun --watch /repo/index.ts __attachment-daemon srv_test',
                serverId
            )
        ).toBe(true);
        expect(
            commandRunsAttachmentDaemon(
                'bun --watch /repo/index.ts __attachment-daemon srv_test_other',
                serverId
            )
        ).toBe(false);
        expect(commandRunsAttachmentDaemon('some-unrelated-process srv_test', serverId)).toBe(
            false
        );
    });
});
