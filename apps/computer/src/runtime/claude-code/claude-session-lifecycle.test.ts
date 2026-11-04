import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { RuntimeSession } from '../driver.ts';
import type { TurnEvent } from '../turn-event.ts';
import { claudeInstallFingerprint, claudeInstallTarget } from './claude-install.ts';
import { createFakeDriverHarness, signal } from './fixtures/fake-driver.ts';
import { collect } from './fixtures/fixture-replay.ts';

let harness: Awaited<ReturnType<typeof createFakeDriverHarness>>;
const sessions: RuntimeSession[] = [];

beforeEach(async () => {
    harness = await createFakeDriverHarness();
});
afterEach(async () => {
    await Promise.all(
        sessions.splice(0).map((session) => session.destroy().catch(() => undefined))
    );
    await harness.close();
});

async function open(resumeFrom?: { claudeSessionId: string; runtime: 'claude-code'; version: 1 }) {
    const session = await harness
        .driver()
        .openSession({ resumeFrom, sessionId: 'agt_test-1', signal: signal() });
    sessions.push(session);
    return session;
}

test('Stop mid-tool interrupts Claude Code and the turn settles as an abort', async () => {
    const session = await open();
    const stop = new AbortController();
    const turn = await session.startTurn({ prompt: 'slow', signal: stop.signal });
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
        if (event.type === 'tool-call') {
            stop.abort();
        }
    }
    await turn.settle();
    expect(events.at(-1)).toEqual({ type: 'abort' });
    // The process survived the interrupt and takes the next turn.
    const next = await collect(
        (await session.startTurn({ prompt: 'hi', signal: signal() })).events
    );
    expect(next.at(-1)?.type).toBe('turn-finish');
    expect(await harness.launches()).toHaveLength(1);
});

test('steering a running turn resolves once Claude Code queues the message', async () => {
    const session = await open();
    const stop = new AbortController();
    const turn = await session.startTurn({ prompt: 'slow', signal: stop.signal });
    for await (const event of turn.events) {
        if (event.type === 'tool-call') {
            expect(await session.steer('more context')).toEqual({ delivered: true });
            stop.abort();
        }
    }
    await turn.settle();
    expect(await session.steer('after')).toEqual({ delivered: false, reason: 'idle' });
    // The interrupt cancelled the queued message: delivered, yet the model never saw it.
    expect(turn.unconsumedSteers()).toEqual(['more context']);
});

test('a steer queued past the turn’s result keeps the turn open until it is answered', async () => {
    const session = await open();
    const turn = await session.startTurn({ prompt: 'hold', signal: signal() });
    let steered: unknown;
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
        if (event.type === 'progress' && event.nativeType === 'system:init') {
            steered = await session.steer('late context');
        }
    }
    expect(steered).toEqual({ delivered: true });
    expect(turn.unconsumedSteers()).toEqual([]);
    const finishes = events.filter((event) => event.type === 'turn-finish');
    expect(finishes).toHaveLength(1);
    // Both results' usage belongs to the one turn.
    expect(finishes[0]).toMatchObject({ usage: { inputTokens: 10, outputTokens: 4 } });
});

test('steering with no turn running is idle', async () => {
    const session = await open();
    expect(await session.steer('hello')).toEqual({ delivered: false, reason: 'idle' });
});

test('a turn started with an aborted signal settles as an abort without prompting', async () => {
    const session = await open();
    const stop = new AbortController();
    stop.abort();
    const turn = await session.startTurn({ prompt: 'hi', signal: stop.signal });
    expect(await collect(turn.events)).toEqual([{ type: 'abort' }]);
    await turn.settle();
    // The process never saw the prompt and stays usable.
    const next = await collect(
        (await session.startTurn({ prompt: 'hi', signal: signal() })).events
    );
    expect(next.at(-1)?.type).toBe('turn-finish');
});

test('a parked process that exits is resumed cold by the next open', async () => {
    const session = await open();
    await collect((await session.startTurn({ prompt: 'one', signal: signal() })).events);
    const state = await session.detach();
    const [launch] = await harness.launches();
    process.kill(launch?.pid ?? 0, 'SIGKILL');
    await Bun.sleep(100);
    expect(harness.pool.size).toBe(0);
    const resumed = await open(
        state as { claudeSessionId: string; runtime: 'claude-code'; version: 1 }
    );
    await collect((await resumed.startTurn({ prompt: 'two', signal: signal() })).events);
    const launches = await harness.launches();
    expect(launches).toHaveLength(2);
    expect(launches[1]?.args).toContain('--resume');
});

test('destroy ends the process with no resume state', async () => {
    const session = await open();
    await collect((await session.startTurn({ prompt: 'one', signal: signal() })).events);
    await session.destroy();
    const [launch] = await harness.launches();
    expect(() => process.kill(launch?.pid ?? 0, 0)).toThrow();
    expect(harness.pool.size).toBe(0);
});

test('the bootstrap fingerprint names the pinned install; a stand-in binary installs nothing', async () => {
    expect(await harness.driver().bootstrapFingerprint()).toBeNull();
    const target = claudeInstallTarget('/host-home', 'darwin-arm64');
    const pinned = harness.driver({ binaryPath: undefined, installTarget: target });
    expect(await pinned.bootstrapFingerprint()).toBe(claudeInstallFingerprint(target));
    expect(target.binaryPath).toBe(
        '/host-home/.haus/cache/claude-code/2.1.317-darwin-arm64/claude'
    );
});
