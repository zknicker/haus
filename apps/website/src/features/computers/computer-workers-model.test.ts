import { expect, test } from 'bun:test';
import {
    planLeftLine,
    runtimeAttention,
    workerLimitChoices,
    workerRuntimeViews,
} from './computer-workers-model.ts';

const device = { canChangeWorkers: true, canEnableWorkers: true, workerLimit: 4 };

test('Run Workers here offers Off or Up to N, keeping an odd stored limit', () => {
    const choices = workerLimitChoices({ ...device, workerLimit: 5, workersEnabled: true });
    expect(choices.value).toBe('5');
    expect(choices.options.map(({ label }) => label)).toContain('Up to 5');
    expect(choices.options[0]).toEqual({ id: 'off', label: 'Off' });
    expect(choices.disabled).toEqual([]);
});

test('a steward who did not attach it can only lower it or turn it off', () => {
    const on = workerLimitChoices({ ...device, canEnableWorkers: false, workersEnabled: true });
    expect(on.disabled).toEqual(['6', '8', '10', '12', '16', '20']);
    const off = workerLimitChoices({ ...device, canEnableWorkers: false, workersEnabled: false });
    expect(off.value).toBe('off');
    expect(off.disabled).toContain('1');
    const member = workerLimitChoices({
        ...device,
        canChangeWorkers: false,
        canEnableWorkers: false,
        workersEnabled: false,
    });
    expect(member.isDisabled).toBe(true);
});

test('a ready runtime stays quiet, and every other state names its exception', () => {
    expect(runtimeAttention('ready')).toBeNull();
    expect(runtimeAttention('not-ready')).toBe('Not signed in');
    expect(runtimeAttention('signed-out')).toBe('Sign-in failed');
    expect(runtimeAttention('missing')).toBe('Not installed');
});

test('a runtime is ready, not signed in, missing, or failing its sign-in', () => {
    const views = workerRuntimeViews({
        detected: new Set(['codex']),
        failedSignIns: new Set(),
        now: 0,
        readiness: [{ detail: null, ready: true, runtime: 'claude-code' }],
        usage: null,
    });
    expect(views.map(({ id, status }) => [id, status])).toEqual([
        ['claude-code', 'ready'],
        ['codex', 'not-ready'],
    ]);
    expect(
        workerRuntimeViews({
            detected: new Set(),
            failedSignIns: new Set(),
            now: 0,
            readiness: [],
            usage: null,
        })[1]?.status
    ).toBe('missing');
    expect(
        workerRuntimeViews({
            detected: new Set(),
            failedSignIns: new Set(['codex']),
            now: 0,
            readiness: [],
            usage: null,
        })[1]?.status
    ).toBe('signed-out');
});

test('plan usage is one line, marked when the Computer last reported long ago', () => {
    const week = { id: 'current-week', label: 'Weekly Limit', resetsAt: null, usedPercent: 3 };
    expect(planLeftLine({ stale: false, week })).toBe('97% of the week left');
    expect(planLeftLine({ stale: true, week })).toBe('97% of the week left · out of date');
});
