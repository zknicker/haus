import { describe, expect, test } from 'bun:test';
import type {
    ComputerUpdateStep,
    DesktopUpdateStep,
    HausUpdateStep,
    HausUpdateView,
} from './haus-update-model.ts';
import { createHausUpdateController, runHausUpdateSequence } from './haus-update-reconciler.ts';

describe('Haus update reconciler', () => {
    test('starts every Computer and the App before waiting for any one surface', async () => {
        let state = view([
            computer('alpha', 'available'),
            computer('beta', 'available'),
            desktop('pending'),
        ]);
        const calls: string[] = [];

        const result = await runHausUpdateSequence({
            downloadDesktop: async () => {
                calls.push('start:desktop');
                state = replaceStep(state, desktop('downloading'));
            },
            readView: () => state,
            restartDesktop: async () => undefined,
            updateComputer: async ({ computerId }) => {
                calls.push(`start:${computerId}`);
                state = replaceStep(state, computer(computerId, 'downloading'));
            },
            waitForChange: async (step) => {
                calls.push(`wait:${step.id}`);
                state = replaceStep(
                    state,
                    step.kind === 'computer'
                        ? computer(step.id, 'current')
                        : desktop('restart-required')
                );
            },
        });

        expect(result).toEqual({ kind: 'restart-required', targetVersion: '1.8.40' });
        expect(calls.slice(0, 3)).toEqual(['start:alpha', 'start:beta', 'start:desktop']);
        expect(calls).toContain('wait:alpha');
        expect(calls).toContain('wait:beta');
        expect(calls).toContain('wait:desktop-app');
    });

    test('restarts a ready App before retrying a settled Computer failure', async () => {
        const calls: string[] = [];
        const result = await runHausUpdateSequence({
            downloadDesktop: async () => {
                calls.push('download');
            },
            readView: () => view([computer('alpha', 'failed'), desktop('restart-required')]),
            restartDesktop: async () => {
                calls.push('restart');
            },
            updateComputer: async () => {
                calls.push('computer');
            },
            waitForChange: async () => {
                calls.push('wait');
            },
        });

        expect(result).toEqual({ kind: 'restarting', targetVersion: '1.8.40' });
        expect(calls).toEqual(['restart']);
    });

    test('keeps an App restart failure attached to the App surface', async () => {
        const result = await runHausUpdateSequence({
            downloadDesktop: async () => undefined,
            readView: () => view([desktop('restart-required')]),
            restartDesktop: async () => {
                throw new Error('Haus App could not restart.');
            },
            updateComputer: async () => undefined,
            waitForChange: async () => undefined,
        });

        expect(result).toEqual({
            failures: [{ detail: 'Haus App could not restart.', stepId: 'desktop-app' }],
            kind: 'failed',
        });
    });

    test('isolates a failed Computer while the other Computer completes', async () => {
        let state = view([computer('alpha', 'available'), computer('beta', 'available')]);
        const calls: string[] = [];
        const result = await runHausUpdateSequence({
            downloadDesktop: async () => undefined,
            readView: () => state,
            restartDesktop: async () => undefined,
            updateComputer: async ({ computerId }) => {
                calls.push(computerId);
                if (computerId === 'alpha') {
                    state = replaceStep(state, computer('alpha', 'failed', 'Signature failed.'));
                    throw new Error('Signature failed.');
                }
                state = replaceStep(state, computer('beta', 'downloading'));
            },
            waitForChange: async (step) => {
                state = replaceStep(state, computer(step.id, 'current'));
            },
        });

        expect(calls).toEqual(['alpha', 'beta']);
        expect(state.steps.find((step) => step.id === 'beta')?.phase).toBe('current');
        expect(result).toEqual({
            failures: [{ detail: 'Signature failed.', stepId: 'alpha' }],
            kind: 'failed',
        });
    });

    test('retries failed surfaces while starting other safe pending work', async () => {
        let state = view([computer('alpha', 'failed'), desktop('pending')]);
        const starts: string[] = [];
        const result = await runHausUpdateSequence({
            downloadDesktop: async () => {
                starts.push('desktop');
                state = replaceStep(state, desktop('restart-required'));
            },
            readView: () => state,
            restartDesktop: async () => undefined,
            updateComputer: async ({ computerId }) => {
                starts.push(computerId);
                state = replaceStep(state, computer(computerId, 'current'));
            },
            waitForChange: async () => undefined,
        });

        expect(starts).toEqual(['alpha', 'desktop']);
        expect(result).toEqual({ kind: 'restart-required', targetVersion: '1.8.40' });
    });

    test('observes an already active update without submitting it again', async () => {
        let state = view([computer('alpha', 'downloading')]);
        let submissions = 0;
        const result = await runHausUpdateSequence({
            downloadDesktop: async () => undefined,
            readView: () => state,
            restartDesktop: async () => undefined,
            updateComputer: async () => {
                submissions += 1;
            },
            waitForChange: async () => {
                state = view([computer('alpha', 'current')]);
            },
        });

        expect(submissions).toBe(0);
        expect(result).toEqual({ kind: 'complete' });
    });

    test('does not retry an unreachable Computer while starting reachable work', async () => {
        let state = view([computer('alpha', 'failed', null, false), desktop('pending')]);
        const starts: string[] = [];
        const result = await runHausUpdateSequence({
            downloadDesktop: async () => {
                starts.push('desktop');
                state = replaceStep(state, desktop('restart-required'));
            },
            readView: () => state,
            restartDesktop: async () => undefined,
            updateComputer: async () => {
                starts.push('computer');
            },
            waitForChange: async () => undefined,
        });

        expect(starts).toEqual(['desktop']);
        expect(result).toEqual({ kind: 'restart-required', targetVersion: '1.8.40' });
    });

    test('coalesces concurrent controller runs into one operation batch', async () => {
        let releaseDownload: () => void = () => undefined;
        let downloads = 0;
        let state = view([desktop('pending')]);
        const controller = createHausUpdateController({
            downloadDesktop: async () => {
                downloads += 1;
                await new Promise<void>((resolve) => {
                    releaseDownload = resolve;
                });
                state = view([desktop('restart-required')]);
            },
            readView: () => state,
            restartDesktop: async () => undefined,
            updateComputer: async () => undefined,
            waitForChange: async () => undefined,
        });

        const first = controller.run();
        const second = controller.run();
        await Promise.resolve();
        expect(downloads).toBe(1);
        expect(second).toBe(first);

        releaseDownload();
        await expect(first).resolves.toEqual({
            kind: 'restart-required',
            targetVersion: '1.8.40',
        });
    });
});

function computer(
    id: string,
    phase: ComputerUpdateStep['phase'],
    detail: string | null = null,
    connected = true
): ComputerUpdateStep {
    return {
        connected,
        currentVersion: phase === 'current' ? '1.4.9' : '1.4.8',
        detail,
        failedPhase: phase === 'failed' ? 'verifying' : null,
        id,
        kind: 'computer',
        label: id,
        phase,
        progress: null,
        targetVersion: '1.4.9',
    };
}

function desktop(phase: DesktopUpdateStep['phase']): DesktopUpdateStep {
    return {
        currentVersion: phase === 'current' ? '1.8.40' : '1.8.39',
        detail: null,
        id: 'desktop-app',
        kind: 'desktop-app',
        label: 'Haus App',
        phase,
        progress: null,
        targetVersion: '1.8.40',
    };
}

function replaceStep(current: HausUpdateView, step: HausUpdateStep) {
    return view(current.steps.map((candidate) => (candidate.id === step.id ? step : candidate)));
}

function view(steps: HausUpdateStep[]): HausUpdateView {
    return {
        componentFacts: [],
        detail: '',
        headline: '',
        phase: steps.every((step) => step.phase === 'current') ? 'current' : 'available',
        primaryAction: null,
        steps,
        version: '1.9.0',
    };
}
