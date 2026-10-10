import { describe, expect, test } from 'bun:test';
import { classifyStreamError } from './realtime-refusal.ts';
import { createSubscriptionRestart, subscriptionRestartDelayMs } from './subscription-restart.ts';

function harness({ signedIn = true }: { signedIn?: boolean } = {}) {
    const timers = new Map<number, { delayMs: number; run: () => void }>();
    const reports: string[] = [];
    let lost = 0;
    let missing = 0;
    let refreshes = 0;
    let nextHandle = 1;
    const restart = createSubscriptionRestart({
        cancel: (handle) => timers.delete(handle as unknown as number),
        onChatMissing: () => {
            missing += 1;
        },
        onMembershipLost: () => {
            lost += 1;
        },
        refreshSession: async () => {
            refreshes += 1;
            return signedIn;
        },
        report: (message) => reports.push(message),
        schedule: (run, delayMs) => {
            const handle = nextHandle++;
            timers.set(handle, { delayMs, run });
            return handle as unknown as ReturnType<typeof setTimeout>;
        },
        stream: 'chat.onRead',
    });
    const fire = () => {
        const [entry] = [...timers.entries()];
        if (!entry) {
            throw new Error('No restart is pending.');
        }
        timers.delete(entry[0]);
        entry[1].run();
    };
    const delays = () => [...timers.values()].map((timer) => timer.delayMs);
    return {
        delays,
        fire,
        lost: () => lost,
        missing: () => missing,
        refreshes: () => refreshes,
        reports,
        restart,
        timers,
    };
}

const transient = new Error('socket hiccup');

function trpcError(code: string, hausRefusal?: string) {
    return Object.assign(new Error(code), { data: { code, hausRefusal } });
}

describe('subscription restart', () => {
    test('backs off exponentially to a 30 s cap', () => {
        expect([0, 1, 2, 3, 4, 5, 6].map(subscriptionRestartDelayMs)).toEqual([
            1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
        ]);
    });

    test('reports each failure and restarts after the next delay', () => {
        const { delays, fire, reports, restart } = harness();
        let restarts = 0;

        restart.failed(transient, () => restarts++);
        expect(delays()).toEqual([1000]);
        fire();
        restart.failed(transient, () => restarts++);
        expect(delays()).toEqual([2000]);
        fire();

        expect(restarts).toBe(2);
        expect(reports).toEqual([
            '[haus] chat.onRead failed; restarting in 1000 ms',
            '[haus] chat.onRead failed; restarting in 2000 ms',
        ]);
    });

    test('a normal completion restarts like a failure', () => {
        const { delays, fire, restart } = harness();
        let restarts = 0;

        restart.completed(() => restarts++);
        expect(delays()).toEqual([1000]);
        fire();
        expect(restarts).toBe(1);
    });

    test('a start resets the backoff', () => {
        const { delays, fire, restart } = harness();

        restart.failed(transient, () => undefined);
        fire();
        restart.failed(transient, () => undefined);
        fire();
        restart.started();

        restart.failed(transient, () => undefined);
        expect(delays()).toEqual([1000]);
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

    test('membership_lost runs the Server-loss path and never restarts', () => {
        const { lost, restart, timers } = harness();

        restart.failed(trpcError('FORBIDDEN', 'membership_lost'), () => undefined);

        expect(lost()).toBe(1);
        expect(timers.size).toBe(0);
    });

    test('role_required stops this stream without clearing anything', () => {
        const { lost, restart, timers } = harness();

        restart.failed(trpcError('FORBIDDEN', 'role_required'), () => undefined);

        expect(lost()).toBe(0);
        expect(timers.size).toBe(0);
    });

    test('chat_missing runs the Chat loss once and never restarts', () => {
        const { lost, missing, restart, timers } = harness();

        restart.failed(trpcError('NOT_FOUND', 'chat_missing'), () => undefined);

        expect(missing()).toBe(1);
        expect(lost()).toBe(0);
        expect(timers.size).toBe(0);
    });

    test('UNAUTHORIZED refreshes the session, then restarts with backoff', async () => {
        const { delays, lost, refreshes, restart } = harness();

        restart.failed(trpcError('UNAUTHORIZED'), () => undefined);
        await Promise.resolve();
        await Promise.resolve();

        expect(refreshes()).toBe(1);
        expect(lost()).toBe(0);
        expect(delays()).toEqual([1000]);
    });

    test('UNAUTHORIZED after a confirmed sign-out stays stopped', async () => {
        const { refreshes, restart, timers } = harness({ signedIn: false });

        restart.failed(trpcError('UNAUTHORIZED'), () => undefined);
        await Promise.resolve();
        await Promise.resolve();

        expect(refreshes()).toBe(1);
        expect(timers.size).toBe(0);
    });

    test('an uncoded FORBIDDEN or NOT_FOUND is not a refusal: it restarts', () => {
        const { delays, lost, restart } = harness();

        restart.failed(trpcError('FORBIDDEN'), () => undefined);
        expect(delays()).toEqual([1000]);
        restart.failed(trpcError('NOT_FOUND'), () => undefined);

        expect(lost()).toBe(0);
        expect(delays()).toEqual([2000]);
    });
});

describe('stream error classes', () => {
    test('only a coded hausRefusal is a refusal', () => {
        expect(classifyStreamError(trpcError('FORBIDDEN', 'membership_lost'))).toBe(
            'membership_lost'
        );
        expect(classifyStreamError(trpcError('FORBIDDEN', 'role_required'))).toBe('role_required');
        expect(classifyStreamError(trpcError('NOT_FOUND', 'chat_missing'))).toBe('chat_missing');
        expect(classifyStreamError(trpcError('UNAUTHORIZED'))).toBe('unauthorized');
        expect(classifyStreamError(trpcError('FORBIDDEN'))).toBe('transient');
        expect(classifyStreamError(trpcError('NOT_FOUND'))).toBe('transient');
        expect(classifyStreamError(trpcError('FORBIDDEN', 'something_else'))).toBe('transient');
        expect(classifyStreamError(trpcError('INTERNAL_SERVER_ERROR'))).toBe('transient');
        expect(classifyStreamError(transient)).toBe('transient');
        expect(classifyStreamError(undefined)).toBe('transient');
    });
});
