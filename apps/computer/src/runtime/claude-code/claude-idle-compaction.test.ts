import { expect, test } from 'bun:test';
import type { HostToolSession } from '../../host-tools/mcp-server.ts';
import type { TurnEvent } from '../turn-event.ts';
import { ClaudeConnection } from './claude-connection.ts';
import { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import type { ClaudeExit, ClaudeProcess } from './claude-process.ts';
import { createWorkspaceStripper } from './claude-tool-names.ts';
import { ClaudeTurn } from './claude-turn.ts';
import { collect, readFixture } from './fixtures/fixture-replay.ts';

/**
 * A compaction Claude Code runs on its own while no Haus turn holds the process (idle
 * compaction, 2.1.299+) prints the same lines as a recorded `/compact` (fixtures
 * `compaction.jsonl`), minus the message it answers: status, `init`, `compact_boundary`, the
 * summary, and a zero-turn result naming no message. It must neither ask for a wake nor settle
 * the next turn (specs/runtime-drivers.md "Between turns").
 */
const idleCompactionLines = (() => {
    const records = readFixture('compaction');
    const compact = records.findIndex(
        (record) => record.stream === 'stdin' && record.line.includes('/compact')
    );
    return records.slice(compact + 1).flatMap((record) => {
        if (record.stream !== 'stdout') {
            return [];
        }
        const message = JSON.parse(record.line) as Record<string, unknown>;
        if (message.type === 'command_lifecycle') {
            return [];
        }
        const { user_message_uuid: _uuid, user_message_uuids: _uuids, ...rest } = message;
        return [JSON.stringify(rest)];
    });
})();

test('an idle compaction between turns wakes nobody and leaves the next turn its own result', async () => {
    const harness = openConnection();
    const first = await runTurn(harness, 'first');
    expect(first.at(-1)?.type).toBe('turn-finish');

    harness.process.emit(...idleCompactionLines);
    await Bun.sleep(0);
    expect(harness.wakes).toEqual([]);
    expect(harness.connection.holdsBackgroundWork).toBe(false);

    const second = await runTurn(harness, 'second');
    expect(textOf(second)).toBe('second-reply');
    // Nothing of the idle compaction was replayed into a turn that started after it ended.
    expect(second.some((event) => event.type === 'tool-call')).toBe(false);
    expect(second.at(-1)?.type).toBe('turn-finish');
});

test('a turn that adopts a running idle compaction journals it and settles only on its own result', async () => {
    const harness = openConnection();
    await runTurn(harness, 'first');
    const resultIndex = idleCompactionLines.findIndex((line) => line.includes('"result"'));
    harness.process.emit(...idleCompactionLines.slice(0, resultIndex));
    await Bun.sleep(0);
    // The compaction is still running: closing now would cut it, but it is no wake.
    expect(harness.connection.holdsBackgroundWork).toBe(true);
    expect(harness.wakes).toEqual([]);

    const turn = new ClaudeTurn(harness.connection, {
        adopted: harness.connection.adoptSelfStartedTurn({ wake: false }),
        collectPlanUsage: false,
        signal: new AbortController().signal,
    });
    await turn.start('second');
    harness.process.emit(...idleCompactionLines.slice(resultIndex));
    await Bun.sleep(0);
    expect(turn.isSettled).toBe(false);
    harness.reply('second');
    const events = await collect(turn.events);
    expect(harness.absorbed).toBe(0);
    expect(events.find((event) => event.type === 'tool-result')).toMatchObject({
        output: { summary: expect.stringContaining('This session is being continued') },
        toolName: 'compaction',
    });
    expect(events).toContainEqual({ nativeType: 'result:self', type: 'progress' });
    expect(textOf(events)).toBe('second-reply');
    expect(events.at(-1)?.type).toBe('turn-finish');
});

async function runTurn(harness: ReturnType<typeof openConnection>, prompt: string) {
    const turn = new ClaudeTurn(harness.connection, {
        adopted: harness.connection.adoptSelfStartedTurn({ wake: false }),
        collectPlanUsage: false,
        signal: new AbortController().signal,
    });
    await turn.start(prompt);
    harness.reply(prompt);
    return await collect(turn.events);
}

/** A connection over a scripted process that answers each prompt only when told to. */
function openConnection() {
    const process = scriptedProcess();
    const hostTools: HostToolSession = {
        close: () => undefined,
        mcp: { headers: { Authorization: 'Bearer t' }, name: 'haus', transport: 'http', url: '' },
        replaceTools: () => undefined,
    };
    const wakes: string[] = [];
    let absorbed = 0;
    const connection = new ClaudeConnection(
        process,
        new ClaudeEventNormalizer({ hostServer: 'haus', strip: createWorkspaceStripper([]) }),
        hostTools,
        'launch',
        'session-1',
        {
            absorbed: () => {
                absorbed += 1;
            },
            changed: () => undefined,
            lost: () => wakes.push('lost'),
            wake: () => wakes.push('wake'),
        }
    );
    return {
        get absorbed() {
            return absorbed;
        },
        connection,
        process,
        /** The model answers the last written prompt with `<prompt>-reply`. */
        reply(prompt: string) {
            const uuid = process.lastUuid();
            process.emit(
                { session_id: 'session-1', subtype: 'init', type: 'system' },
                { status: 'requesting', subtype: 'status', type: 'system' },
                streamText(0, `${prompt}-reply`),
                {
                    is_error: false,
                    num_turns: 1,
                    result: `${prompt}-reply`,
                    subtype: 'success',
                    type: 'result',
                    user_message_uuid: uuid,
                    user_message_uuids: [uuid],
                }
            );
        },
        wakes,
    };
}

function streamText(index: number, text: string): Record<string, unknown>[] {
    const event = (body: Record<string, unknown>) => ({
        event: { index, ...body },
        parent_tool_use_id: null,
        type: 'stream_event',
    });
    return [
        event({ content_block: { text: '', type: 'text' }, type: 'content_block_start' }),
        event({ delta: { text, type: 'text_delta' }, type: 'content_block_delta' }),
        event({ type: 'content_block_stop' }),
    ];
}

function scriptedProcess() {
    const listeners = new Set<(line: string) => void>();
    const exit = Promise.withResolvers<ClaudeExit>();
    const writes: string[] = [];
    const process: ClaudeProcess & {
        emit(...lines: (string | Record<string, unknown> | Record<string, unknown>[])[]): void;
        lastUuid(): string;
    } = {
        alive: true,
        emit(...lines) {
            for (const line of lines.flat()) {
                const text = typeof line === 'string' ? line : JSON.stringify(line);
                for (const listener of listeners) {
                    listener(text);
                }
            }
        },
        exited: exit.promise,
        lastUuid() {
            const last = JSON.parse(writes.at(-1) ?? '{}') as { uuid?: string };
            return last.uuid ?? '';
        },
        onLine(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        pid: undefined,
        stderrTail: () => [],
        stop() {
            exit.resolve({ code: null, signal: 'SIGTERM' });
            return Promise.resolve();
        },
        write(line) {
            writes.push(line);
            return Promise.resolve();
        },
    };
    return process;
}

function textOf(events: TurnEvent[]): string {
    return events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : [])).join('');
}
