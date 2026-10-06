import { describe, expect, test } from 'bun:test';
import { hausUpdateRunProgress, holdPeak, stepFraction } from './haus-update-run-progress.ts';
import { computer, desktop, view } from './reconciler-test-fixtures.ts';

const stepIds = ['desktop-app', 'alpha', 'beta'];

describe('Haus update run progress', () => {
    test('fills the active step slice by its download fraction', () => {
        const run = hausUpdateRunProgress(
            view([{ ...desktop('downloading'), progress: 0.3 }, computer('alpha', 'available')]),
            { activeStepId: 'desktop-app', stepIds }
        );

        expect(run.fraction).toBeCloseTo(0.1);
        expect(run.position).toBe(1);
    });

    test('counts finished and failed earlier steps as their full slice', () => {
        const run = hausUpdateRunProgress(
            view([
                { ...desktop('failed'), detail: 'Disk full.' },
                computer('alpha', 'waiting-for-agents'),
                computer('beta', 'available'),
            ]),
            { activeStepId: 'alpha', stepIds }
        );

        expect(run.fraction).toBeCloseTo((1 + 0.8) / 3);
        expect(run.position).toBe(2);
        expect(run.activeStep?.id).toBe('alpha');
    });

    test('a step about to restart from an earlier failure starts its slice empty', () => {
        const run = hausUpdateRunProgress(
            view([computer('alpha', 'failed'), computer('beta', 'available')]),
            { activeStepId: 'alpha', stepIds: ['alpha', 'beta'] }
        );

        expect(run.fraction).toBe(0);
    });

    test('a finished run is full', () => {
        const run = hausUpdateRunProgress(
            view([desktop('restart-required'), computer('alpha', 'current')]),
            { activeStepId: null, stepIds: ['desktop-app', 'alpha'] }
        );

        expect(run.fraction).toBe(1);
        expect(run.position).toBeNull();
    });

    test('without a run, live active steps share the circle', () => {
        const run = hausUpdateRunProgress(
            view([computer('alpha', 'restarting'), computer('beta', 'verifying')]),
            null
        );

        expect(run.fraction).toBeCloseTo((0.9 + 0.65) / 2);
        expect(run.steps.map((step) => step.id)).toEqual(['alpha', 'beta']);
    });

    test('maps Computer phases to increasing marks', () => {
        const phases = [
            'available',
            'requested',
            'downloading',
            'verifying',
            'installing',
            'waiting-for-agents',
            'restarting',
            'current',
        ] as const;
        const marks = phases.map((phase) => stepFraction(computer('alpha', phase)));

        expect(marks).toEqual([...marks].sort((left, right) => left - right));
        expect(marks[0]).toBe(0);
        expect(marks.at(-1)).toBe(1);
        expect(stepFraction({ ...computer('alpha', 'downloading'), progress: 1 })).toBeCloseTo(0.6);
        expect(stepFraction({ ...computer('alpha', 'downloading'), progress: 1 })).toBeLessThan(
            stepFraction(computer('alpha', 'verifying'))
        );
    });

    test('holds the peak within a run and starts over for a new run', () => {
        const first = holdPeak(null, 'run:a', 0.4);
        const lower = holdPeak(first, 'run:a', 0.3);
        const next = holdPeak(lower, 'run:b', 0.1);

        expect(lower.value).toBe(0.4);
        expect(holdPeak(lower, 'run:a', 0.5).value).toBe(0.5);
        expect(next).toEqual({ key: 'run:b', value: 0.1 });
    });
});
