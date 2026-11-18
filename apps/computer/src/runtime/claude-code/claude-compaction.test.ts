import { expect, test } from 'bun:test';
import { ONE_HOUR_CACHE_MS } from '../idle-compaction.ts';
import { cumulativeDifference } from './claude-idle-activity.ts';
import { ClaudeTurn } from './claude-turn.ts';
import { collect, replayConnection } from './fixtures/fixture-replay.ts';

/**
 * The recorded `/compact` (fixtures `compaction.jsonl`, Claude Code 2.1.317) run the way idle
 * compaction runs it: on a parked connection, between turns, with nothing woken.
 */
async function parkedAfterOneTurn() {
    const wakes: string[] = [];
    const { connection, process } = replayConnection('compaction', 0, {
        absorbed: () => wakes.push('absorbed'),
        changed: () => undefined,
        lost: () => wakes.push('lost'),
        wake: () => wakes.push('wake'),
    });
    const turn = new ClaudeTurn(connection, {
        adopted: connection.adoptSelfStartedTurn({ wake: false }),
        collectPlanUsage: false,
        signal: new AbortController().signal,
    });
    await turn.start('Reply with exactly: ok');
    const events = await collect(turn.events);
    expect(events.at(-1)?.type).toBe('turn-finish');
    return { connection, process, wakes };
}

test('after a turn the session knows its last request: one-hour cache, whole prompt size', async () => {
    const { connection } = await parkedAfterOneTurn();
    expect(connection.idleCompactionSnapshot()).toMatchObject({
        cacheTtlMs: ONE_HOUR_CACHE_MS,
        contextTokens: 10 + 14_186 + 7397,
        minTokens: 200_000,
        nearUsageLimit: false,
    });
});

test('compact runs /compact on the parked process and reports tokens, summary, and spend', async () => {
    const { connection, process, wakes } = await parkedAfterOneTurn();
    const result = await connection.compact();
    expect(JSON.parse(process.writes.at(-1) ?? '{}')).toMatchObject({
        message: { content: [{ text: '/compact', type: 'text' }], role: 'user' },
        type: 'user',
    });
    expect(result).toMatchObject({ tokensAfter: 3160, tokensBefore: 21_635 });
    expect(result.summary).toContain('This session is being continued');
    // The result itself reports zero usage; the cumulative totals' difference is the spend.
    expect(result.costUsd).toBeCloseTo(0.026_203_3 - 0.016_554, 9);
    expect(result.usage).toEqual({
        cacheReadTokens: 35_769 - 14_186,
        cacheWriteTokens: 7445 - 7397,
        inputTokens: 1446 - 10 + (35_769 - 14_186) + (7445 - 7397),
        outputTokens: 1240 - 41,
        totalTokens: 1446 - 10 + (35_769 - 14_186) + (7445 - 7397) + (1240 - 41),
    });
    expect(result.endedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
    // Nothing of it was a wake, and nothing keeps the process from parking or closing.
    expect(wakes).toEqual([]);
    expect(connection.holdsBackgroundWork).toBe(false);
    expect(connection.alive).toBe(true);
    // The session's prompt is now the summary's size: it will not arm again.
    expect(connection.idleCompactionSnapshot()?.contextTokens).toBe(3160);
});

test('a process that exits mid-compaction rejects it', async () => {
    const { connection, process } = await parkedAfterOneTurn();
    const compaction = connection.compact();
    await process.stop();
    await expect(compaction).rejects.toThrow('Claude Code exited');
});

test('the cumulative difference counts only what moved, per model', () => {
    expect(
        cumulativeDifference(
            { costUsd: 1, models: { a: { inputTokens: 10, outputTokens: 5 } } },
            {
                costUsd: 1.5,
                models: {
                    a: { cacheReadInputTokens: 100, inputTokens: 12, outputTokens: 9 },
                    b: { cacheCreationInputTokens: 3, inputTokens: 1, outputTokens: 1 },
                },
            }
        )
    ).toEqual({
        costUsd: 0.5,
        usage: {
            cacheReadTokens: 100,
            cacheWriteTokens: 3,
            inputTokens: 3 + 100 + 3,
            outputTokens: 5,
            totalTokens: 111,
        },
    });
    expect(
        cumulativeDifference({ costUsd: null, models: {} }, { costUsd: null, models: {} })
    ).toEqual({ costUsd: null, usage: null });
});
