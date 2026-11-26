import { expect, test } from 'bun:test';
import type { TurnEvent } from './turn-event.ts';
import { startTurnTimings } from './turn-timings.ts';

async function* events(clock: { now: number }, steps: readonly [number, TurnEvent][]) {
    for (const [atMs, event] of steps) {
        clock.now = atMs;
        yield event;
    }
}

test('a turn records each milestone once from its start and sums its session-create attempts', async () => {
    const clock = { now: 1000 };
    const timings = startTurnTimings(() => clock.now);

    clock.now = 1012.4;
    timings.mark('harnessReadyMs');
    clock.now = 1020;
    timings.mark('harnessReadyMs');
    await expect(
        timings.measure('sessionCreateMs', async () => {
            clock.now = 1050;
            throw new Error('resume refused');
        })
    ).rejects.toThrow('resume refused');
    await timings.measure('sessionCreateMs', async () => {
        timings.record('slotWaitMs', 6);
        clock.now = 1060;
    });
    const seen: string[] = [];
    for await (const event of timings.observe(
        events(clock, [
            [1100, { nativeType: 'system', type: 'progress' }],
            [1200, { id: 't1', text: 'private-model-reply', type: 'text-delta' }],
            [1300, { input: {}, toolCallId: 'call_1', toolName: 'bash', type: 'tool-call' }],
            [1400, { input: {}, toolCallId: 'call_2', toolName: 'bash', type: 'tool-call' }],
        ])
    )) {
        seen.push(event.type);
    }
    clock.now = 1500;

    expect(seen).toEqual(['progress', 'text-delta', 'tool-call', 'tool-call']);
    expect(timings.snapshot([])).toEqual({
        firstStreamMs: 100,
        firstToolMs: 300,
        harnessReadyMs: 12,
        sessionCreateMs: 40,
        slotWaitMs: 6,
    });
});

test('confirmed sends give first, last and trailing timings and the Chats left typing', () => {
    const clock = { now: 0 };
    const timings = startTurnTimings(() => clock.now);
    clock.now = 900;

    expect(
        timings.snapshot([
            { atMs: 200, chatId: 'chat_a', done: false },
            { atMs: 300, chatId: 'chat_b', done: true },
            { atMs: 400, chatId: null, done: false },
            { atMs: 600, chatId: 'chat_a', done: true },
        ])
    ).toEqual({
        afterLastSendMs: 300,
        doneChats: 2,
        firstSendMs: 200,
        lastSendMs: 600,
        sentChats: 2,
    });
    expect(
        timings.snapshot([
            { atMs: 200, chatId: 'chat_a', done: true },
            { atMs: 250, chatId: 'chat_a', done: false },
        ])
    ).toMatchObject({ doneChats: 0, sentChats: 1 });
});
