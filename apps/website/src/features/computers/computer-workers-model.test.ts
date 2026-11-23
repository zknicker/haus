import { expect, test } from 'bun:test';
import { workerLimitOptions, workersSwitchEnabled } from './computer-workers-model.ts';

test('only the attacher turns Workers on, and a steward turns them off', () => {
    const off = { canChangeWorkers: true, canEnableWorkers: false, workersEnabled: false };
    expect(workersSwitchEnabled(off)).toBe(false);
    expect(workersSwitchEnabled({ ...off, canEnableWorkers: true })).toBe(true);
    expect(workersSwitchEnabled({ ...off, workersEnabled: true })).toBe(true);
    expect(workersSwitchEnabled({ ...off, canChangeWorkers: false, workersEnabled: true })).toBe(
        false
    );
});

test('the limit picker always offers the current limit in order', () => {
    expect(workerLimitOptions(4)).toEqual([1, 2, 3, 4, 6, 8, 10, 12, 16, 20]);
    expect(workerLimitOptions(37)).toEqual([1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 37]);
});
