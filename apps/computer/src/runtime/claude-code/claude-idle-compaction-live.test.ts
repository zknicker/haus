import { expect, test } from 'bun:test';
import type { ClaudeResumeState } from '../resume-state.ts';
import {
    lastContextTokens,
    ledger,
    liveLog,
    openIdleCompactionLive,
    runLiveTurn,
    textOf,
} from './fixtures/idle-compaction-live.ts';

// Haus idle compaction on a real Claude Code session (specs/runtime-drivers.md "Idle
// compaction"): a turn loads past the 100K floor, the process parks warm with the setting on,
// the pool's armed timer runs `/compact` on the parked process, and the next turn resumes the
// compacted conversation and still answers from the summary.
//
// Shortened timer (fires 5s after the last request; runs with the Claude live lane):
//   HAUS_RUN_LIVE_CLAUDE_CODE_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-idle-compaction-live.test.ts
// Real-time variant (Claude Code's own 54-minute timer under the default 60-minute idle close;
// about an hour):
//   HAUS_RUN_LIVE_CLAUDE_IDLE_COMPACT_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-idle-compaction-live.test.ts
const shortTest = process.env.HAUS_RUN_LIVE_CLAUDE_CODE_TEST === '1' ? test : test.skip;
const realTimeTest = process.env.HAUS_RUN_LIVE_CLAUDE_IDLE_COMPACT_TEST === '1' ? test : test.skip;

shortTest(
    'a parked session compacts on the armed timer and the next turn answers from the summary',
    () => compactsWhileParked({ dueInMs: 5000, timeoutMs: 6 * 60_000 }),
    8 * 60_000
);

realTimeTest(
    'the real 54-minute timer compacts a parked session before the 60-minute idle close',
    () => compactsWhileParked({ timeoutMs: 58 * 60_000 }),
    70 * 60_000
);

async function compactsWhileParked(options: { dueInMs?: number; timeoutMs: number }) {
    // Claude Code floors its threshold at 100K; set low so only that floor applies.
    const live = await openIdleCompactionLive({
        ...(options.dueInMs === undefined ? {} : { dueInMs: options.dueInMs }),
        env: { CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS: '1' },
    });
    try {
        const first = await live.driver().openSession({
            resumeFrom: undefined,
            sessionId: 'agt_idle-compact',
        });
        const loaded = await runLiveTurn(
            first,
            `The vault word is PERSIMMON. Remember it.\n\n${ledger('Ledger', 8000)}\n\nReply with exactly: loaded`
        );
        expect(loaded.at(-1)).toMatchObject({ type: 'turn-finish' });
        const loadedContext = lastContextTokens(loaded);
        liveLog(`turn 1 context ${loadedContext} tokens; parked, waiting for the compaction`);
        expect(loadedContext).toBeGreaterThan(100_000);
        const parked = (await first.detach()) as ClaudeResumeState;

        const started = Date.now();
        const result = await withTimeout(live.compacted, options.timeoutMs);
        liveLog(
            `compacted after ${Math.round((Date.now() - started) / 1000)}s: ${JSON.stringify({
                ...result,
                summary: result.summary?.slice(0, 300),
            })}`
        );
        expect(result.tokensBefore).toBeGreaterThan(100_000);
        expect(result.tokensAfter).toBeLessThan((result.tokensBefore ?? 0) / 2);
        expect(result.summary).toBeTruthy();
        expect(result.costUsd).toBeGreaterThan(0);
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
        expect(live.pool.size).toBe(1);

        // The next turn claims the same warm process and continues from the summary.
        const second = await live.driver().openSession({
            resumeFrom: parked,
            sessionId: 'agt_idle-compact',
        });
        const recall = await runLiveTurn(
            second,
            'What is the vault word from my first message? Reply with the word only.'
        );
        const recallContext = lastContextTokens(recall);
        liveLog(JSON.stringify({ recallContext, reply: textOf(recall), skips: live.skips }));
        await second.stop();
        // A compaction is never a sub-agent report: nothing may ask for a wake.
        expect(live.wakes).toEqual([]);
        expect(recallContext).toBeLessThan(loadedContext / 2);
        expect(textOf(recall).toUpperCase()).toContain('PERSIMMON');
    } finally {
        await live.close();
    }
}

async function withTimeout<Value>(promise: Promise<Value>, ms: number): Promise<Value> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () =>
                reject(new Error(`No idle compaction within ${Math.round(ms / 60_000)} minutes.`)),
            ms
        );
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}
