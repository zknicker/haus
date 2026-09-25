import { expect, test } from 'bun:test';
import { AgentTurnTimings } from './agent-turn-timings.ts';

test('distinguishes first events, repeated sends, and trailing work on a monotonic clock', async () => {
    let now = 100;
    const timings = new AgentTurnTimings(() => now);
    timings.setReasoningEffort('medium');
    now = 110;
    timings.mark('harness_ready');
    const session = {};
    expect(
        await timings.measure('session_create', async () => {
            now = 130;
            return session;
        })
    ).toBe(session);
    now = 140;
    timings.mark('first_stream');
    now = 150;
    timings.mark('first_tool');
    now = 160;
    timings.mark('first_tool');
    timings.recordSend({ chatId: 'cht_a', done: false });
    now = 180;
    timings.recordSend({ chatId: 'cht_b', done: true });
    now = 200;
    timings.recordSend({ chatId: 'cht_a', done: true });
    now = 250;
    expect(timings.snapshot()).toEqual({
        'haus.reasoning.effort': 'medium',
        'haus.turn.harness_ready_ms': 10,
        'haus.turn.session_create_ms': 20,
        'haus.turn.first_stream_ms': 40,
        'haus.turn.first_tool_ms': 50,
        'haus.turn.first_send_ms': 60,
        'haus.turn.last_send_ms': 100,
        'haus.turn.after_last_send_ms': 50,
        'haus.turn.done_chats': 2,
        'haus.turn.sent_chats': 2,
    });
});

test('retains failed phase duration without inventing sends or replacing the error', async () => {
    let now = 0;
    const timings = new AgentTurnTimings(() => now);
    const failure = new Error('session rejected');
    await expect(
        timings.measure('session_create', async () => {
            now = 5;
            throw failure;
        })
    ).rejects.toBe(failure);
    expect(timings.snapshot()).toEqual({ 'haus.turn.session_create_ms': 5 });
});

test('counts a Chat whose latest send omitted --done as sent but not done', () => {
    const timings = new AgentTurnTimings(() => 0);
    timings.recordSend({ chatId: 'cht_a', done: true });
    timings.recordSend({ chatId: 'cht_a', done: false });
    timings.recordSend({ chatId: 'cht_b', done: false });
    expect(timings.snapshot()).toMatchObject({
        'haus.turn.done_chats': 0,
        'haus.turn.sent_chats': 2,
    });
});
