import { describe, expect, test } from 'bun:test';
import {
    createHausUpdateController,
    type HausUpdateSequence,
    runHausUpdateSequence,
} from './haus-update-reconciler.ts';
import { computer, desktop, operations, replaceStep, view } from './reconciler-test-fixtures.ts';

describe('Haus update reconciler', () => {
    test('restarts the App before any Computer starts and remembers the Computers', async () => {
        let state = view([
            computer('alpha', 'available'),
            computer('beta', 'available'),
            desktop('available'),
        ]);
        const calls: string[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                downloadDesktop: async () => {
                    calls.push('start:desktop');
                    state = replaceStep(state, desktop('downloading'));
                },
                forgetPendingComputers: () => calls.push('forget'),
                rememberPendingComputers: (ids) => calls.push(`remember:${ids.join(',')}`),
                restartDesktop: async () => {
                    calls.push('restart:desktop');
                },
                updateComputer: async ({ computerId }) => {
                    calls.push(`start:${computerId}`);
                },
                waitForChange: async (step) => {
                    calls.push(`wait:${step.id}`);
                    state = replaceStep(state, desktop('restart-required'));
                },
            })
        );

        expect(result).toEqual({ kind: 'restarting', targetVersion: '1.8.40' });
        expect(calls).toEqual([
            'forget',
            'start:desktop',
            'wait:desktop-app',
            'remember:alpha,beta',
            'restart:desktop',
        ]);
    });

    test('updates Computers one at a time in view order', async () => {
        let state = view([computer('alpha', 'available'), computer('beta', 'available')]);
        const calls: string[] = [];
        const sequences: HausUpdateSequence[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                onSequence: (sequence) => sequences.push(sequence),
                updateComputer: async ({ computerId }) => {
                    calls.push(`start:${computerId}`);
                    state = replaceStep(state, computer(computerId, 'downloading'));
                },
                waitForChange: async (step) => {
                    calls.push(`wait:${step.id}`);
                    state = replaceStep(state, computer(step.id, 'current'));
                },
            })
        );

        expect(result).toEqual({ kind: 'complete' });
        expect(calls).toEqual(['start:alpha', 'wait:alpha', 'start:beta', 'wait:beta']);
        expect(sequences.map((sequence) => sequence.activeStepId)).toEqual(['alpha', 'beta', null]);
        expect(sequences[0]?.stepIds).toEqual(['alpha', 'beta']);
    });

    test('restarts a ready App before retrying a settled Computer failure', async () => {
        const calls: string[] = [];
        const result = await runHausUpdateSequence(
            operations(() => view([computer('alpha', 'failed'), desktop('restart-required')]), {
                rememberPendingComputers: (ids) => calls.push(`remember:${ids.join(',')}`),
                restartDesktop: async () => {
                    calls.push('restart');
                },
                updateComputer: async () => {
                    calls.push('computer');
                },
            })
        );

        expect(result).toEqual({ kind: 'restarting', targetVersion: '1.8.40' });
        expect(calls).toEqual(['remember:alpha', 'restart']);
    });

    test('stops before any Computer when the App download fails', async () => {
        let state = view([computer('alpha', 'available'), desktop('available')]);
        const calls: string[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                downloadDesktop: async () => {
                    state = replaceStep(state, { ...desktop('failed'), detail: 'Disk full.' });
                },
                rememberPendingComputers: () => calls.push('remember'),
                updateComputer: async () => {
                    calls.push('computer');
                },
            })
        );

        expect(result).toEqual({
            failures: [{ detail: 'Disk full.', stepId: 'desktop-app' }],
            kind: 'failed',
        });
        expect(calls).toEqual([]);
    });

    test('forgets the remembered Computers when the App cannot restart', async () => {
        const calls: string[] = [];
        const result = await runHausUpdateSequence(
            operations(() => view([computer('alpha', 'available'), desktop('restart-required')]), {
                forgetPendingComputers: () => calls.push('forget'),
                rememberPendingComputers: () => calls.push('remember'),
                restartDesktop: async () => {
                    throw new Error('Haus App could not restart.');
                },
                updateComputer: async () => {
                    calls.push('computer');
                },
            })
        );

        expect(result).toEqual({
            failures: [{ detail: 'Haus App could not restart.', stepId: 'desktop-app' }],
            kind: 'failed',
        });
        expect(calls).toEqual(['forget', 'remember', 'forget']);
    });

    test('isolates a failed Computer and continues to the next', async () => {
        let state = view([computer('alpha', 'available'), computer('beta', 'available')]);
        const calls: string[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                updateComputer: async ({ computerId }) => {
                    calls.push(computerId);
                    if (computerId === 'alpha') {
                        state = replaceStep(
                            state,
                            computer('alpha', 'failed', 'Signature failed.')
                        );
                        throw new Error('Signature failed.');
                    }
                    state = replaceStep(state, computer('beta', 'current'));
                },
            })
        );

        expect(calls).toEqual(['alpha', 'beta']);
        expect(result).toEqual({
            failures: [{ detail: 'Signature failed.', stepId: 'alpha' }],
            kind: 'failed',
        });
    });

    test('settles a Computer that disconnects mid-run without a retryable failure', async () => {
        let state = view([computer('alpha', 'available')]);
        const result = await runHausUpdateSequence(
            operations(() => state, {
                updateComputer: async () => {
                    state = view([computer('alpha', 'downloading')]);
                },
                waitForChange: async () => {
                    state = view([computer('alpha', 'failed', 'Disconnected.', false)]);
                },
            })
        );

        expect(result).toEqual({ kind: 'complete' });
    });

    test('coalesces concurrent controller runs into one run', async () => {
        let releaseDownload: () => void = () => undefined;
        let downloads = 0;
        let state = view([desktop('available')]);
        const controller = createHausUpdateController(
            operations(() => state, {
                downloadDesktop: async () => {
                    downloads += 1;
                    await new Promise<void>((resolve) => {
                        releaseDownload = resolve;
                    });
                    state = view([desktop('restart-required')]);
                },
            })
        );

        const first = controller.run();
        const second = controller.run();
        await Promise.resolve();
        expect(downloads).toBe(1);
        expect(second).toBe(first);

        releaseDownload();
        await expect(first).resolves.toEqual({ kind: 'restarting', targetVersion: '1.8.40' });
    });
});
