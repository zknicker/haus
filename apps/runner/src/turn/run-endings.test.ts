import { expect, test } from 'bun:test';
import { ClaudeSlots } from '../claude/claude-slots.ts';
import { thrownRunResult } from './run-endings.ts';

test('a turn stopped while it waits for a Claude slot is interrupted, and an unstopped throw still fails', async () => {
    const slots = new ClaudeSlots({ evict: () => undefined, limit: 1 });
    await slots.acquire();
    const stop = new AbortController();
    const waiting = slots.acquire(stop.signal);
    stop.abort();
    const stopped = await waiting.then(
        () => null,
        (error: unknown) => error
    );

    expect(thrownRunResult(stopped, stop.signal)).toEqual({
        failure: null,
        status: 'interrupted',
        tokenUsage: null,
    });
    const failure = new Error('The Claude Agent SDK did not initialize.');
    expect(thrownRunResult(failure, new AbortController().signal)).toEqual({
        failure,
        status: 'failed',
        tokenUsage: null,
    });
});
