import { describe, expect, test } from 'bun:test';
import type { ComputerUpdateStep, HausUpdateView } from './haus-update-model.ts';
import { waitForUpdateStepChange } from './wait-for-update-step.ts';

describe('update step observation', () => {
    test('returns as soon as the Computer disconnects', async () => {
        let polls = 0;
        await waitForUpdateStepChange(step(), {
            readView: () => view(step({ connected: polls < 3 })),
            refreshComputers: async () => {
                polls += 1;
            },
            sleep: async () => undefined,
        });

        expect(polls).toBe(3);
    });

    test('gives up on an unchanged step the Computer does not report', async () => {
        let polls = 0;
        const unchanged = step({ phase: 'idle' });
        await expect(
            waitForUpdateStepChange(unchanged, {
                readView: () => view(unchanged),
                refreshComputers: async () => {
                    polls += 1;
                },
                sleep: async () => undefined,
            })
        ).rejects.toThrow('Home did not finish updating.');
        expect(polls).toBe(150);
    });

    test('keeps waiting on a freshly reported Agent wait until the projection stalls it', async () => {
        // Past the old 30-minute cap: an unchanged waiting-for-agents step is healthy
        // while the Computer keeps reporting; only the stall projection ends it.
        const stalledAfterPolls = 2400;
        let polls = 0;
        const waiting = step({
            detail: 'Waiting for 1 active Agent.',
            phase: 'waiting-for-agents',
        });
        await waitForUpdateStepChange(waiting, {
            readView: () =>
                view(
                    polls < stalledAfterPolls
                        ? waiting
                        : step({ failedPhase: 'waiting-for-agents', phase: 'failed' })
                ),
            refreshComputers: async () => {
                polls += 1;
            },
            sleep: async () => undefined,
        });

        expect(polls).toBe(stalledAfterPolls);
    });

    test('returns when the step changes', async () => {
        let polls = 0;
        await waitForUpdateStepChange(step(), {
            readView: () => view(step({ progress: polls > 1 ? 0.5 : null })),
            refreshComputers: async () => {
                polls += 1;
            },
            sleep: async () => undefined,
        });

        expect(polls).toBe(2);
    });
});

function step(overrides: Partial<ComputerUpdateStep> = {}): ComputerUpdateStep {
    return {
        connected: true,
        currentVersion: '1.4.8',
        detail: null,
        failedPhase: null,
        id: 'cmp_home',
        kind: 'computer',
        label: 'Home',
        name: 'Home',
        phase: 'downloading',
        progress: null,
        targetVersion: '1.4.9',
        ...overrides,
    };
}

function view(current: ComputerUpdateStep): HausUpdateView {
    return {
        componentFacts: [],
        detail: '',
        headline: '',
        phase: 'updating',
        primaryAction: null,
        steps: [current],
        version: '1.9.0',
    };
}
