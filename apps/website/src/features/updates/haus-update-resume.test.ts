import { describe, expect, test } from 'bun:test';
import { type HausUpdateSequence, runHausUpdateSequence } from './haus-update-reconciler.ts';
import { computer, desktop, operations, replaceStep, view } from './reconciler-test-fixtures.ts';

describe('Haus update resume after an App restart', () => {
    test('resumes only remembered Computers and counts the finished App first', async () => {
        let state = view([
            computer('alpha', 'available'),
            computer('beta', 'available'),
            computer('gamma', 'available'),
            desktop('current'),
        ]);
        const starts: string[] = [];
        const sequences: HausUpdateSequence[] = [];
        let forgets = 0;
        const result = await runHausUpdateSequence(
            operations(() => state, {
                forgetPendingComputers: () => {
                    forgets += 1;
                },
                onSequence: (sequence) => sequences.push(sequence),
                updateComputer: async ({ computerId }) => {
                    starts.push(computerId);
                    state = replaceStep(state, computer(computerId, 'current'));
                },
            }),
            { computerIds: ['gamma', 'alpha'] }
        );

        expect(result).toEqual({ kind: 'complete' });
        expect(starts).toEqual(['alpha', 'gamma']);
        expect(forgets).toBe(0);
        expect(sequences[0]).toEqual({
            activeStepId: 'alpha',
            stepIds: ['desktop-app', 'alpha', 'gamma'],
        });
    });

    test('a resumed run skips current and offline Computers and observes active ones', async () => {
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
            }),
            { computerIds: ['alpha', 'beta', 'gamma', 'delta'] }
        );

        expect(result).toEqual({ kind: 'complete' });
        expect(starts).toEqual(['delta']);
        expect(waits).toEqual(['beta', 'delta']);
    });

    test('a fresh press drops Computers an earlier App restart still owed', async () => {
        let state = view([computer('alpha', 'available'), desktop('current')]);
        const calls: string[] = [];
        await runHausUpdateSequence(
            operations(() => state, {
                forgetPendingComputers: () => calls.push('forget'),
                updateComputer: async ({ computerId }) => {
                    calls.push(`start:${computerId}`);
                    state = replaceStep(state, computer(computerId, 'current'));
                },
            })
        );

        expect(calls).toEqual(['forget', 'start:alpha']);
    });
});
