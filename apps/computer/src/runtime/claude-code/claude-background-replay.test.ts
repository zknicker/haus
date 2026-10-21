import { expect, test } from 'bun:test';
import type { BackgroundWork } from '../background-work.ts';
import type { TurnEvent } from '../turn-event.ts';
import { ClaudeTurn } from './claude-turn.ts';
import { collect, readFixture, replayConnection } from './fixtures/fixture-replay.ts';

/**
 * Background sub-agents against streams recorded from Claude Code 2.1.284 (fixtures
 * `background-*.jsonl`, specs/runtime-drivers.md "Background work"). The turn that starts a
 * sub-agent ends at its own result; Claude Code later reports the task and, when no Haus turn
 * holds the connection, starts a turn of its own that a Haus wake run adopts.
 */
function open(name: string, processIndex = 0) {
    const changes: BackgroundWork[] = [];
    let onWake: () => void = () => undefined;
    const replay = replayConnection(name, processIndex, {
        changed: (work) => changes.push(work),
        lost: () => changes.push({ subagents: -1, tasks: -1 }),
        wake: () => onWake(),
    });
    return {
        ...replay,
        changes,
        setWake(handler: () => void) {
            onWake = handler;
        },
    };
}

const turnOn = (
    connection: ReturnType<typeof replayConnection>['connection'],
    options: { adopted?: ReturnType<typeof connection.adoptSelfStartedTurn>; wake?: boolean } = {}
) =>
    new ClaudeTurn(connection, {
        collectPlanUsage: false,
        signal: new AbortController().signal,
        ...options,
    });

const textOf = (events: TurnEvent[]) =>
    events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : [])).join('');

// Ported from botiverse/raft-source packages/daemon/src/agentProcessManager.claude.test.ts (FSL-1.1-ALv2)
// "task #1260: a turn ending with a background task outstanding shows waiting, not Idle, and
// stays protocol-idle for delivery", adapted: the Haus turn settles and the session stays usable.
test('the turn that starts a background sub-agent ends at its own result while the task runs', async () => {
    const replay = open('background-subagent');
    await replay.connection.initialize();
    const first = turnOn(replay.connection);
    await first.start('start a background sub-agent');
    const events = await collect(first.events);
    expect(events.at(-1)?.type).toBe('turn-finish');
    expect(textOf(events)).toBe('started');
    expect(replay.connection.backgroundWork).toEqual({ subagents: 1, tasks: 1 });
    expect(replay.connection.holdsBackgroundWork).toBe(true);
    expect(replay.changes[0]).toEqual({ subagents: 1, tasks: 1 });

    // A new message is answered while the sub-agent still runs.
    let adopted: ClaudeTurn | null = null;
    const wake = Promise.withResolvers<void>();
    replay.setWake(() => {
        // The run adopts the turn Claude Code started on its own; here at once, in production
        // whenever the Server's wake run reaches the session.
        adopted = turnOn(replay.connection, {
            adopted: replay.connection.adoptSelfStartedTurn(),
            wake: true,
        });
        void adopted.start('wake prompt is never written');
        wake.resolve();
    });
    const second = turnOn(replay.connection);
    await second.start('Reply with exactly: pong');
    expect(textOf(await collect(second.events))).toBe('pong');

    await wake.promise;
    const reported = adopted as unknown as ClaudeTurn;
    const reportEvents = await collect(reported.events);
    expect(reportEvents.at(-1)?.type).toBe('turn-finish');
    expect(textOf(reportEvents)).toContain('background');
    // Only the two prompts and the handshake were written: the wake wrote nothing.
    expect(replay.process.writes).toHaveLength(3);
    // The sub-agent left a background shell of its own; it ended when stdin closed.
    while (replay.connection.holdsBackgroundWork) {
        await Bun.sleep(1);
    }
    expect(replay.changes.at(-1)).toEqual({ subagents: 0, tasks: 0 });
    expect(replay.changes).toContainEqual({ subagents: 0, tasks: 1 });
});

test('a turn Claude Code started and finished before any run adopted it is not adopted', async () => {
    const replay = open('background-subagent');
    const woke = Promise.withResolvers<void>();
    replay.setWake(() => woke.resolve());
    await replay.connection.initialize();
    for (const prompt of ['start', 'pong']) {
        const turn = turnOn(replay.connection);
        await turn.start(prompt);
        await collect(turn.events);
    }
    await woke.promise;
    // The self-started turn runs to its result with nobody attached; the wake run then prompts.
    while (replay.connection.holdsBackgroundWork) {
        await Bun.sleep(1);
    }
    expect(replay.connection.adoptSelfStartedTurn()).toBeNull();
});

test('an interrupt of a later turn spares the background sub-agent, whose report still wakes', async () => {
    const replay = open('background-interrupt');
    let woke = false;
    replay.setWake(() => {
        woke = true;
    });
    await replay.connection.initialize();
    const first = turnOn(replay.connection);
    await first.start('start a background sub-agent');
    await collect(first.events);

    const stop = new AbortController();
    const second = new ClaudeTurn(replay.connection, {
        collectPlanUsage: false,
        signal: stop.signal,
    });
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
    while (!woke) {
        await Bun.sleep(1);
    }
    // The capture shows the CLI side: with `perTaskStopAffordance` the sub-agent ran to completion.
    const notices = readFixture('background-interrupt')
        .filter((record) => record.stream === 'stdout')
        .map((record) => JSON.parse(record.line) as Record<string, unknown>)
        .filter((message) => message.subtype === 'task_notification');
    expect(notices.at(-1)?.status).toBe('completed');
});

test('a completion that lands mid-turn folds into that turn: one result, no wake', async () => {
    const replay = open('background-fold');
    let woke = false;
    replay.setWake(() => {
        woke = true;
    });
    await replay.connection.initialize();
    const first = turnOn(replay.connection);
    await first.start('start a background sub-agent');
    await collect(first.events);
    const second = turnOn(replay.connection);
    await second.start('run a long command');
    const events = await collect(second.events);
    expect(events.filter((event) => event.type === 'turn-finish')).toHaveLength(1);
    expect(textOf(events)).toContain('fg-done');
    expect(replay.connection.backgroundWork.subagents).toBe(0);
    expect(woke).toBe(false);
});

// Ported from botiverse/raft-source packages/daemon/src/agentProcessManager.claude.test.ts (FSL-1.1-ALv2)
// "task #1260: a restart forgets the old process's background tasks", adapted: the resumed
// process reports the orphan itself, records it without calling the model, and wakes nobody.
test('a resumed process reports an orphaned sub-agent as stopped without starting a model turn', async () => {
    const replay = open('background-orphan', 1);
    let woke = false;
    replay.setWake(() => {
        woke = true;
    });
    await replay.connection.initialize();
    const turn = turnOn(replay.connection);
    await turn.start('Reply with exactly: pong');
    const events = await collect(turn.events);
    expect(textOf(events)).toBe('pong');
    expect(events.filter((event) => event.type === 'turn-finish')).toHaveLength(1);
    expect(woke).toBe(false);
    expect(replay.connection.holdsBackgroundWork).toBe(false);
});
