import { expect, test } from 'bun:test';
import { createSettleParser } from './run.mjs';
import { stackEnvironment } from './stack.mjs';

test('parses settles from the runner, including names past its pad and split chunks', () => {
    const settled = [];
    const parser = createSettleParser((entry) => settled.push(entry));
    parser.push(
        '▶ 01 placement-quick-fact      starting · 0s\n  · placement-quick-fact — running (3s)\n'
    );
    parser.push(
        '▶ 01 placement-quick-fact      settled · 41s\n  ✓ pass (41s)\n▶ 02 placement-found-the-kit-localfailed · 7'
    );
    parser.push(
        '2s\n  ✗ fail (72s) — AssertionError: result post placement: expected "inline-reply"\n'
    );
    expect(settled).toEqual([
        { name: 'placement-quick-fact', ok: true, reason: '', seconds: 41 },
        {
            name: 'placement-found-the-kit-local',
            ok: false,
            reason: 'AssertionError: result post placement: expected "inline-reply"',
            seconds: 72,
        },
    ]);
});

test('stack children run with the heartbeat clock off, whatever the shell says', () => {
    const previous = process.env.HAUS_HEARTBEAT_QUIET_HOURS;
    process.env.HAUS_HEARTBEAT_QUIET_HOURS = 'on';
    try {
        const env = stackEnvironment('eval-heartbeat-change');
        expect(env.HAUS_HEARTBEAT_QUIET_HOURS).toBe('off');
        expect(env.HAUS_HEARTBEAT_SCHEDULE).toBe('off');
    } finally {
        if (previous === undefined) {
            Reflect.deleteProperty(process.env, 'HAUS_HEARTBEAT_QUIET_HOURS');
        } else {
            process.env.HAUS_HEARTBEAT_QUIET_HOURS = previous;
        }
    }
});

test('stack children get the stack id and never an inherited port override', () => {
    const previous = process.env.HAUS_DEV_PORT_BASE;
    process.env.HAUS_DEV_PORT_BASE = '42000';
    try {
        const env = stackEnvironment('eval-placement-change', {
            HAUS_AGENT_TESTS_MODEL: 'codex/terra',
        });
        expect(env.HAUS_DEV_STACK_ID).toBe('eval-placement-change');
        expect(env.HAUS_AGENT_TESTS_MODEL).toBe('codex/terra');
        expect(env.HAUS_DEV_PORT_BASE).toBeUndefined();
    } finally {
        if (previous === undefined) {
            Reflect.deleteProperty(process.env, 'HAUS_DEV_PORT_BASE');
        } else {
            process.env.HAUS_DEV_PORT_BASE = previous;
        }
    }
});
