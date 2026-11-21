import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { type CompactionPort, runClaudeCompaction } from './claude-compaction.ts';
import type { TurnSink } from './claude-connection.ts';
import { ClaudeIdleActivity, cumulativeDifference } from './claude-idle-activity.ts';
import { type ParsedClaudeMessage, parseClaudeMessage } from './claude-messages.ts';
import { ClaudeNormalizer } from './claude-normalizer.ts';
import { ONE_HOUR_CACHE_MS } from './idle-compaction.ts';

interface Recorded {
    line: string;
    stream: 'exit' | 'stderr' | 'stdin' | 'stdout';
}

const recorded = readFileSync(new URL('./fixtures/compaction.jsonl', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Recorded);
const writes = recorded.flatMap((record, index) => (record.stream === 'stdin' ? [index] : []));
const outputAfter = (write: number) =>
    recorded
        .slice(writes[write] + 1, writes[write + 1] ?? recorded.length)
        .filter((record) => record.stream === 'stdout')
        .map((record) => record.line);
const compactUuid = (JSON.parse(recorded[writes[1] ?? 0]?.line ?? '{}') as { uuid: string }).uuid;

function parkedAfterOneTurn() {
    const activity = new ClaudeIdleActivity(200_000);
    let ids = 0;
    const normalizer = new ClaudeNormalizer({
        invocations: new Map(),
        newId: () => `block-${++ids}`,
        now: () => 0,
    });
    let sink: TurnSink | null = null;
    const sent: string[] = [];
    const uuids: string[] = [];
    let closed = 0;
    const dispatch = (line: string) => {
        const parsed: ParsedClaudeMessage = parseClaudeMessage(JSON.parse(line));
        activity.observe(parsed);
        if (sink?.accepting) {
            if (parsed.message.kind === 'lifecycle') {
                sink.onLifecycle(parsed.message.message);
            }
            sink.onMessage(parsed);
        }
    };
    for (const line of outputAfter(0)) {
        dispatch(line);
    }
    const port = {
        attach(next: TurnSink) {
            sink = next;
            return () => {
                if (sink === next) {
                    sink = null;
                }
            };
        },
        close: () => {
            closed += 1;
        },
        idleActivity: activity,
        modelId: 'claude-haiku-4-5',
        normalizer,
        sendUser(text: string, options: { uuid: string }) {
            sent.push(text);
            uuids.push(options.uuid);
            if (replaying) {
                for (const line of outputAfter(1)) {
                    dispatch(line.replaceAll(compactUuid, options.uuid));
                }
            }
        },
    } satisfies CompactionPort;
    let replaying = true;
    return {
        activity,
        get closed() {
            return closed;
        },
        dispatch,
        end: (error: Error) => sink?.onEnded(error),
        lastUuid: () => uuids.at(-1) ?? '',
        port,
        quiet() {
            replaying = false;
        },
        sent,
    };
}

test('after a turn the session knows its last request: one-hour cache, whole prompt size', () => {
    const { activity } = parkedAfterOneTurn();
    expect(activity.snapshot()).toMatchObject({
        cacheTtlMs: ONE_HOUR_CACHE_MS,
        contextTokens: 10 + 14_186 + 7397,
        minTokens: 200_000,
        nearUsageLimit: false,
    });
});

test('compact runs /compact on the parked process and reports tokens, summary, and spend', async () => {
    const parked = parkedAfterOneTurn();
    const result = await runClaudeCompaction(parked.port);
    expect(parked.sent).toEqual(['/compact']);
    expect(result).toMatchObject({
        modelId: 'claude-haiku-4-5',
        tokensAfter: 3160,
        tokensBefore: 21_635,
    });
    expect(result.summary).toContain('This session is being continued');
    expect(result.costUsd).toBeCloseTo(0.026_203_3 - 0.016_554, 9);
    expect(result.usage).toEqual({
        cacheReadTokens: 35_769 - 14_186,
        cacheWriteTokens: 7445 - 7397,
        inputTokens: 1446 - 10 + (35_769 - 14_186) + (7445 - 7397),
        outputTokens: 1240 - 41,
        totalTokens: 1446 - 10 + (35_769 - 14_186) + (7445 - 7397) + (1240 - 41),
    });
    expect(result.endedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
    expect(parked.closed).toBe(0);
    expect(parked.activity.snapshot()?.contextTokens).toBe(3160);
});

test('a session that ends mid-compaction rejects it', async () => {
    const parked = parkedAfterOneTurn();
    parked.quiet();
    const compaction = runClaudeCompaction(parked.port);
    parked.end(new Error('exited'));
    await expect(compaction).rejects.toThrow('session ended');
});

test('a compaction that never answers is ended so the next turn resumes cold', async () => {
    const parked = parkedAfterOneTurn();
    parked.quiet();
    await expect(runClaudeCompaction(parked.port, { timeoutMs: 0 })).rejects.toThrow(
        'did not finish compacting in time'
    );
    expect(parked.closed).toBe(1);
});

test('a result that refuses the compaction, or answers without one, rejects it', async () => {
    const refused = parkedAfterOneTurn();
    refused.quiet();
    const first = runClaudeCompaction(refused.port);
    refused.dispatch(
        JSON.stringify({
            is_error: true,
            result: 'Not enough messages to compact.',
            session_id: 's',
            subtype: 'error_during_execution',
            type: 'result',
            user_message_uuid: refused.lastUuid(),
        })
    );
    await expect(first).rejects.toThrow('Not enough messages to compact.');

    const empty = parkedAfterOneTurn();
    empty.quiet();
    const second = runClaudeCompaction(empty.port);
    empty.dispatch(
        JSON.stringify({
            is_error: false,
            result: null,
            session_id: 's',
            subtype: 'success',
            type: 'result',
            user_message_uuid: empty.lastUuid(),
        })
    );
    await expect(second).rejects.toThrow('did not compact');
});

test('a result that answers some other message does not settle the compaction', async () => {
    const parked = parkedAfterOneTurn();
    parked.quiet();
    const compaction = runClaudeCompaction(parked.port);
    parked.dispatch(
        JSON.stringify({
            is_error: true,
            result: 'someone else',
            session_id: 's',
            subtype: 'success',
            type: 'result',
            user_message_uuid: crypto.randomUUID(),
        })
    );
    parked.end(new Error('exited'));
    await expect(compaction).rejects.toThrow('session ended');
});

test('a subagent request, a five-minute cache write and a rejected rate limit change what the session reports', () => {
    const activity = new ClaudeIdleActivity(100_000, () => 5000);
    const stream = (parent: string | null, usage: Record<string, unknown>) => [
        {
            event: { message: { usage }, type: 'message_start' },
            parent_tool_use_id: parent,
            type: 'stream_event',
        },
        { event: { type: 'message_stop' }, parent_tool_use_id: parent, type: 'stream_event' },
    ];
    const feed = (message: unknown) => activity.observe(parseClaudeMessage(message));
    for (const message of stream('toolu_sub', { input_tokens: 999 })) {
        feed(message);
    }
    expect(activity.snapshot()).toBeNull();
    for (const message of stream(null, {
        cache_creation: { ephemeral_5m_input_tokens: 10 },
        cache_creation_input_tokens: 10,
        input_tokens: 5,
    })) {
        feed(message);
    }
    expect(activity.snapshot()).toMatchObject({ activityAt: 5000, cacheTtlMs: 300_000 });
    for (const message of stream(null, { cache_read_input_tokens: 7, input_tokens: 1 })) {
        feed(message);
    }
    expect(activity.snapshot()).toMatchObject({ cacheTtlMs: 300_000, contextTokens: 8 });
    feed({ rate_limit_info: { status: 'rejected' }, type: 'rate_limit_event' });
    expect(activity.snapshot()?.nearUsageLimit).toBe(true);
    feed({ rate_limit_info: { status: 'allowed' }, type: 'rate_limit_event' });
    expect(activity.snapshot()?.nearUsageLimit).toBe(false);
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
