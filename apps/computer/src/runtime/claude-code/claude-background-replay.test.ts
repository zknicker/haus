import { expect, test } from 'bun:test';
import type { TurnEvent } from '../turn-event.ts';
import { CLAUDE_CODE_VERSION } from './claude-install.ts';
import { ClaudeTurn } from './claude-turn.ts';
import { collect, replayConnection } from './fixtures/fixture-replay.ts';

/**
 * Background sub-agents against streams recorded from Claude Code 2.1.317 (fixtures
 * `background-*.jsonl`, specs/runtime-drivers.md "Background work"). The turn that starts a
 * sub-agent ends at its own result, and later turns on the same process still settle on theirs.
 */
const turnOn = (
    connection: ReturnType<typeof replayConnection>['connection'],
    signal = new AbortController().signal
) => new ClaudeTurn(connection, { signal });

const textOf = (events: TurnEvent[]) =>
    events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : [])).join('');

// Ported from botiverse/raft-source packages/daemon/src/agentProcessManager.claude.test.ts (FSL-1.1-ALv2)
// "task #1260: a turn ending with a background task outstanding shows waiting, not Idle, and
// stays protocol-idle for delivery", adapted: the Haus turn settles and the session stays usable.
test('the turn that starts a background sub-agent ends at its own result while the task runs', async () => {
    const replay = replayConnection('background-subagent');
    // The handshake reports the release, which is the pin the fixtures were recorded with.
    expect(await replay.connection.initialize()).toBe(CLAUDE_CODE_VERSION);
    const first = turnOn(replay.connection);
    await first.start('start a background sub-agent');
    const events = await collect(first.events);
    expect(events.at(-1)?.type).toBe('turn-finish');
    expect(textOf(events)).toBe('started');

    const second = turnOn(replay.connection);
    await second.start('Reply with exactly: pong');
    expect(textOf(await collect(second.events))).toBe('pong');
});

test('an interrupt of a later turn stops only that turn', async () => {
    const replay = replayConnection('background-interrupt');
    await replay.connection.initialize();
    const first = turnOn(replay.connection);
    await first.start('start a background sub-agent');
    await collect(first.events);

    const stop = new AbortController();
    const second = turnOn(replay.connection, stop.signal);
    await second.start('run a long command');
    const events: TurnEvent[] = [];
    for await (const event of second.events) {
        events.push(event);
        if (event.type === 'tool-call') {
            stop.abort();
        }
    }
    expect(events.at(-1)).toEqual({ type: 'abort' });
    expect(JSON.parse(replay.process.writes.at(-1) ?? '{}').request).toEqual({
        cancel_queued: true,
        subtype: 'interrupt',
    });
});

test('a completion that lands mid-turn folds into that turn: one result', async () => {
    const replay = replayConnection('background-fold');
    await replay.connection.initialize();
    const first = turnOn(replay.connection);
    await first.start('start a background sub-agent');
    await collect(first.events);
    const second = turnOn(replay.connection);
    await second.start('run a long command');
    const events = await collect(second.events);
    expect(events.filter((event) => event.type === 'turn-finish')).toHaveLength(1);
    expect(textOf(events)).toContain('fg-done');
});

// Ported from botiverse/raft-source packages/daemon/src/agentProcessManager.claude.test.ts (FSL-1.1-ALv2)
// "task #1260: a restart forgets the old process's background tasks", adapted: the resumed
// process reports the orphan itself and records it without calling the model.
test('a resumed process reports an orphaned sub-agent without disturbing the next turn', async () => {
    const replay = replayConnection('background-orphan', 1);
    await replay.connection.initialize();
    const turn = turnOn(replay.connection);
    await turn.start('Reply with exactly: pong');
    const events = await collect(turn.events);
    expect(textOf(events)).toBe('pong');
    expect(events.filter((event) => event.type === 'turn-finish')).toHaveLength(1);
});
