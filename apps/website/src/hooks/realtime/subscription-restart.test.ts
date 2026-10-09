import { describe, expect, test } from 'bun:test';
import {
    createSubscriptionRestart,
    isSubscriptionRefusal,
    subscriptionRestartDelayMs,
} from './subscription-restart.ts';

function harness() {
    const timers = new Map<number, { delayMs: number; run: () => void }>();
    const reports: string[] = [];
    let nextHandle = 1;
    const restart = createSubscriptionRestart({
        cancel: (handle) => timers.delete(handle as unknown as number),
        report: (message) => reports.push(message),
        schedule: (run, delayMs) => {
            const handle = nextHandle++;
            timers.set(handle, { delayMs, run });
            return handle as unknown as ReturnType<typeof setTimeout>;
        },
        stream: 'chat.onEvent',
    });
    const fire = () => {
        const [entry] = [...timers.entries()];
        if (!entry) {
            throw new Error('No restart is pending.');
        }
        timers.delete(entry[0]);
        entry[1].run();
    };
    return { fire, reports, restart, timers };
}

const transient = new Error('socket hiccup');

function trpcError(code: string) {
    return Object.assign(new Error(code), { data: { code } });
}

describe('subscription restart', () => {
    test('backs off exponentially to a 30 s cap', () => {
        expect([0, 1, 2, 3, 4, 5, 6].map(subscriptionRestartDelayMs)).toEqual([
            1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
        ]);
    });

    test('reports each failure and restarts after the next delay', () => {
        const { fire, reports, restart, timers } = harness();
        let restarts = 0;

        restart.failed(transient, () => restarts++);
        expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([1000]);
        fire();
        restart.failed(transient, () => restarts++);
        expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([2000]);
        fire();

        expect(restarts).toBe(2);
        expect(reports).toEqual([
            '[haus] chat.onEvent failed; restarting in 1000 ms',
            '[haus] chat.onEvent failed; restarting in 2000 ms',
        ]);
    });

    test('a start resets the backoff and says whether it recovered a failure', () => {
        const { fire, restart, timers } = harness();

        expect(restart.started()).toBe(false);
        restart.failed(transient, () => undefined);
        fire();
        restart.failed(transient, () => undefined);
        fire();
        expect(restart.started()).toBe(true);
        expect(restart.started()).toBe(false);

        restart.failed(transient, () => undefined);
        expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([1000]);
    });

    test('a start or dispose cancels a pending restart', () => {
        const { restart, timers } = harness();

        restart.failed(transient, () => undefined);
        restart.started();
        expect(timers.size).toBe(0);
        restart.failed(transient, () => undefined);
        restart.dispose();
        expect(timers.size).toBe(0);
    });

    test('a refusal is reported and never restarted', () => {
        const { reports, restart, timers } = harness();

        for (const code of ['FORBIDDEN', 'NOT_FOUND', 'UNAUTHORIZED']) {
            restart.failed(trpcError(code), () => undefined);
        }

        expect(timers.size).toBe(0);
        expect(reports).toHaveLength(3);
        expect(isSubscriptionRefusal(trpcError('INTERNAL_SERVER_ERROR'))).toBe(false);
        expect(isSubscriptionRefusal(transient)).toBe(false);
    });
});
