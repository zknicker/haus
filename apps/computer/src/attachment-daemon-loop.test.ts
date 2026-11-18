import { expect, test } from 'bun:test';
import {
    type AttachmentConnectionOutcome,
    type AttachmentDaemonHooks,
    runAttachmentDaemon,
} from './attachment-daemon-loop.ts';
import { computerMachineUnlinkedExitCode } from './attachment-recovery.ts';
import { withDaemonRuntime } from './daemon-runtime.ts';

const runDaemon = (hooks: AttachmentDaemonHooks) =>
    withDaemonRuntime((runtime) => runAttachmentDaemon(runtime, hooks));

interface ScriptedDaemon {
    hooks: AttachmentDaemonHooks;
    sleeps: number[];
    unlinkMarks: number;
}

function scriptedDaemon(script: {
    connections?: AttachmentConnectionOutcome[];
    detachAfterIterations?: number;
    oneshot?: boolean;
    validations?: (Error | 'ok')[];
}): ScriptedDaemon {
    const connections = [...(script.connections ?? [])];
    const validations = [...(script.validations ?? [])];
    const daemon: ScriptedDaemon = { hooks: null as never, sleeps: [], unlinkMarks: 0 };
    let iterations = 0;
    daemon.hooks = {
        attachmentExists: () => {
            iterations += 1;
            return Promise.resolve(
                script.detachAfterIterations === undefined ||
                    iterations <= script.detachAfterIterations
            );
        },
        connect: () => {
            const outcome = connections.shift();
            if (!outcome) {
                throw new Error('The script ran out of connection outcomes.');
            }
            return Promise.resolve(outcome);
        },
        isTerminalUnlinkedError: (error) =>
            error instanceof Error && error.message === 'terminally unlinked',
        log: () => undefined,
        markTerminalUnlinked: () => {
            daemon.unlinkMarks += 1;
            return Promise.resolve();
        },
        oneshot: script.oneshot === true,
        sleep: (ms) => {
            daemon.sleeps.push(ms);
            return Promise.resolve();
        },
        validate: () => {
            const validation = validations.shift() ?? 'ok';
            return validation === 'ok' ? Promise.resolve() : Promise.reject(validation);
        },
    };
    return daemon;
}

test('the daemon retries failed validation with capped backoff, then reconnects', async () => {
    const daemon = scriptedDaemon({
        connections: [{ connected: true, deleted: false }],
        detachAfterIterations: 7,
        validations: [
            new Error('down'),
            new Error('down'),
            new Error('down'),
            new Error('down'),
            new Error('down'),
            new Error('down'),
        ],
    });
    expect(await runDaemon(daemon.hooks)).toBe(0);
    // Six validation failures escalate to the cap; the successful connection
    // resets the delay before the final post-close retry.
    expect(daemon.sleeps).toEqual([500, 1000, 2000, 4000, 8000, 15_000, 500]);
});

test('a Server-closed socket reconnects with a fresh backoff each time', async () => {
    const daemon = scriptedDaemon({
        connections: [
            { connected: true, deleted: false },
            { connected: false, deleted: false },
            { connected: true, deleted: false },
        ],
        detachAfterIterations: 3,
    });
    expect(await runDaemon(daemon.hooks)).toBe(0);
    // Close after connect restarts at the initial delay; the following unopened
    // socket escalates; the next successful connection resets again.
    expect(daemon.sleeps).toEqual([500, 1000, 500]);
});

test('a terminally unlinked credential parks the daemon with the unlink exit code', async () => {
    const daemon = scriptedDaemon({ validations: [new Error('terminally unlinked')] });
    expect(await runDaemon(daemon.hooks)).toBe(computerMachineUnlinkedExitCode);
    expect(daemon.unlinkMarks).toBe(1);
    expect(daemon.sleeps).toEqual([]);
});

test('a deleted Server ends the daemon without a reconnect', async () => {
    const daemon = scriptedDaemon({ connections: [{ connected: true, deleted: true }] });
    expect(await runDaemon(daemon.hooks)).toBe(0);
    expect(daemon.sleeps).toEqual([]);
});

test('a detached Server ends the daemon before validation', async () => {
    const daemon = scriptedDaemon({ detachAfterIterations: 0, validations: [new Error('never')] });
    expect(await runDaemon(daemon.hooks)).toBe(0);
    expect(daemon.sleeps).toEqual([]);
});

test('oneshot runs connect once and reports whether the socket opened', async () => {
    const connectedRun = scriptedDaemon({
        connections: [{ connected: true, deleted: false }],
        oneshot: true,
    });
    expect(await runDaemon(connectedRun.hooks)).toBe(0);
    expect(connectedRun.sleeps).toEqual([]);

    const unreachableRun = scriptedDaemon({
        connections: [{ connected: false, deleted: false }],
        oneshot: true,
    });
    expect(await runDaemon(unreachableRun.hooks)).toBe(1);
});

test('a connect that fails before the socket exists retries like a refused socket', async () => {
    const daemon = scriptedDaemon({
        connections: [{ connected: true, deleted: false }],
        detachAfterIterations: 2,
    });
    const scriptedConnect = daemon.hooks.connect;
    let failed = false;
    daemon.hooks.connect = () => {
        if (failed) {
            return scriptedConnect();
        }
        failed = true;
        return Promise.reject(new Error('update progress was unreadable'));
    };
    expect(await runDaemon(daemon.hooks)).toBe(0);
    expect(daemon.sleeps).toEqual([500, 500]);
});

test('oneshot surfaces a connect failure instead of retrying', async () => {
    const daemon = scriptedDaemon({ oneshot: true });
    daemon.hooks.connect = () => Promise.reject(new Error('update progress was unreadable'));
    await expect(runDaemon(daemon.hooks)).rejects.toThrow('update progress was unreadable');
    expect(daemon.sleeps).toEqual([]);
});

test('oneshot propagates a validation failure instead of retrying', async () => {
    const daemon = scriptedDaemon({ oneshot: true, validations: [new Error('down')] });
    await expect(runDaemon(daemon.hooks)).rejects.toThrow('down');
    expect(daemon.sleeps).toEqual([]);
});

test('an attachment read failure retries without terminating the resident daemon', async () => {
    const daemon = scriptedDaemon({
        connections: [{ connected: true, deleted: false }],
        detachAfterIterations: 1,
    });
    const attachmentExists = daemon.hooks.attachmentExists;
    let failed = false;
    daemon.hooks.attachmentExists = () => {
        if (failed) {
            return attachmentExists();
        }
        failed = true;
        return Promise.reject(new Error('attachment state temporarily unreadable'));
    };

    expect(await runDaemon(daemon.hooks)).toBe(0);
    expect(daemon.sleeps).toEqual([500, 500]);
});

test('oneshot surfaces an attachment read failure', async () => {
    const daemon = scriptedDaemon({ oneshot: true });
    daemon.hooks.attachmentExists = () => Promise.reject(new Error('attachment unreadable'));

    await expect(runDaemon(daemon.hooks)).rejects.toThrow('attachment unreadable');
    expect(daemon.sleeps).toEqual([]);
});
