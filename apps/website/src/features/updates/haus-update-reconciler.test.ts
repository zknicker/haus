import { describe, expect, test } from 'bun:test';
import {
    createHausUpdateController,
    type HausUpdateSequence,
    runHausUpdateSequence,
} from './haus-update-reconciler.ts';
import { computer, desktop, operations, replaceStep, view } from './reconciler-test-fixtures.ts';

describe('Haus update reconciler', () => {
    test('downloads the App, then updates each Computer, and never restarts the App', async () => {
        let state = view([
            computer('alpha', 'available'),
            computer('beta', 'available'),
            desktop('available'),
        ]);
        const calls: string[] = [];
        const sequences: HausUpdateSequence[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                downloadDesktop: async () => {
                    calls.push('download:desktop');
                    state = replaceStep(state, desktop('downloading'));
                },
                onSequence: (sequence) => sequences.push(sequence),
                updateComputer: async ({ computerId }) => {
                    calls.push(`start:${computerId}`);
                    state = replaceStep(state, computer(computerId, 'downloading'));
                },
                waitForChange: async (step) => {
                    calls.push(`wait:${step.id}`);
                    state = replaceStep(
                        state,
                        step.kind === 'desktop-app'
                            ? desktop('restart-required')
                            : computer(step.id, 'current')
                    );
                },
            })
        );

        expect(result).toEqual({ appReady: true, kind: 'complete' });
        expect(calls).toEqual([
            'download:desktop',
            'wait:desktop-app',
            'start:alpha',
            'wait:alpha',
            'start:beta',
            'wait:beta',
        ]);
        expect(sequences.map((sequence) => sequence.activeStepId)).toEqual([
            'desktop-app',
            'alpha',
            'beta',
            null,
        ]);
        expect(sequences[0]?.stepIds).toEqual(['desktop-app', 'alpha', 'beta']);
    });

    test('updates Computers alone when the App was already downloaded', async () => {
        let state = view([computer('alpha', 'available'), desktop('restart-required')]);
        const calls: string[] = [];
        const sequences: HausUpdateSequence[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                downloadDesktop: async () => {
                    calls.push('download');
                },
                onSequence: (sequence) => sequences.push(sequence),
                updateComputer: async ({ computerId }) => {
                    calls.push(`start:${computerId}`);
                    state = replaceStep(state, computer(computerId, 'current'));
                },
            })
        );

        expect(result).toEqual({ appReady: true, kind: 'complete' });
        expect(calls).toEqual(['start:alpha']);
        expect(sequences[0]?.stepIds).toEqual(['alpha']);
    });

    test('reports no ready App when only Computers updated', async () => {
        let state = view([computer('alpha', 'available'), computer('beta', 'available')]);
        const result = await runHausUpdateSequence(
            operations(() => state, {
                updateComputer: async ({ computerId }) => {
                    state = replaceStep(state, computer(computerId, 'current'));
                },
            })
        );

        expect(result).toEqual({ appReady: false, kind: 'complete' });
    });

    test('continues to the Computers when the App download fails', async () => {
        let state = view([computer('alpha', 'available'), desktop('available')]);
        const calls: string[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                downloadDesktop: async () => {
                    state = replaceStep(state, { ...desktop('failed'), detail: 'Disk full.' });
                },
                updateComputer: async ({ computerId }) => {
                    calls.push(computerId);
                    state = replaceStep(state, computer(computerId, 'current'));
                },
            })
        );

        expect(calls).toEqual(['alpha']);
        expect(result).toEqual({
            appReady: false,
            failures: [{ detail: 'Disk full.', stepId: 'desktop-app' }],
            kind: 'failed',
        });
    });

    test('records a thrown App download and still updates the Computers', async () => {
        let state = view([computer('alpha', 'available'), desktop('available')]);
        const calls: string[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                downloadDesktop: async () => {
                    throw new Error('Network lost.');
                },
                updateComputer: async ({ computerId }) => {
                    calls.push(computerId);
                    state = replaceStep(state, computer(computerId, 'current'));
                },
            })
        );

        expect(calls).toEqual(['alpha']);
        expect(result).toEqual({
            appReady: false,
            failures: [{ detail: 'Network lost.', stepId: 'desktop-app' }],
            kind: 'failed',
        });
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
            appReady: false,
            failures: [{ detail: 'Signature failed.', stepId: 'alpha' }],
            kind: 'failed',
        });
    });

    test('skips current and offline Computers and observes one already updating', async () => {
        let state = view([
            computer('alpha', 'current'),
            computer('beta', 'downloading'),
            computer('gamma', 'available', null, false),
            computer('delta', 'available'),
        ]);
        const starts: string[] = [];
        const waits: string[] = [];
        const result = await runHausUpdateSequence(
            operations(() => state, {
                updateComputer: async ({ computerId }) => {
                    starts.push(computerId);
                    state = replaceStep(state, computer(computerId, 'downloading'));
                },
                waitForChange: async (step) => {
                    waits.push(step.id);
                    state = replaceStep(state, computer(step.id, 'current'));
                },
            })
        );

        expect(result).toEqual({ appReady: false, kind: 'complete' });
        expect(starts).toEqual(['delta']);
        expect(waits).toEqual(['beta', 'delta']);
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

        expect(result).toEqual({ appReady: false, kind: 'complete' });
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
        await expect(first).resolves.toEqual({ appReady: true, kind: 'complete' });
    });
});
