import { expect, test } from 'bun:test';
import type { ClaudeConnection, TurnSink } from './claude-connection.ts';
import { type ParsedClaudeLine, parseClaudeLine } from './claude-messages.ts';
import { ClaudeTurn } from './claude-turn.ts';

/** The slice of a live connection a turn drives, recording every user message written. */
function fakeConnection() {
    let sink: TurnSink | null = null;
    const written: Array<{ text: string; uuid: string }> = [];
    const connection = {
        attach(next: TurnSink) {
            sink = next;
            return () => {
                sink = null;
            };
        },
        control: () => Promise.resolve({}),
        normalizer: { apiErrorReported: false, beginTurn: () => undefined, normalize: () => [] },
        process: { stderrTail: () => [], stop: () => Promise.resolve() },
        sendUser(text: string, options: { uuid: string }) {
            written.push({ text, uuid: options.uuid });
            return Promise.resolve();
        },
        supportsLifecycle: true,
    };
    const emit = (json: Record<string, unknown>) => {
        const line = parseClaudeLine(JSON.stringify(json)) as ParsedClaudeLine;
        if (line.message.kind === 'lifecycle') {
            sink?.onLifecycle(line.message.message);
        }
        sink?.onLine(line);
    };
    return {
        connection: connection as unknown as ClaudeConnection,
        lifecycle: (uuid: string, state: string) =>
            emit({ command_uuid: uuid, state, type: 'command_lifecycle' }),
        result: (uuid: string) =>
            emit({ result: 'ok', subtype: 'success', type: 'result', user_message_uuid: uuid }),
        uuidOf: (text: string) => written.find((entry) => entry.text === text)?.uuid ?? '',
    };
}

const newTurn = (connection: ClaudeConnection) =>
    new ClaudeTurn(connection, {
        collectPlanUsage: false,
        signal: new AbortController().signal,
        steerAckMs: 10,
    });

test('a steer written to Claude Code is never dropped when its receipt is late', async () => {
    const fake = fakeConnection();
    const turn = newTurn(fake.connection);
    await turn.start('prompt');

    // The stdin write succeeded, so the CLI holds the message: never re-send it next turn.
    expect(await turn.steer('notice')).toEqual({ delivered: true });
    expect(turn.unconsumedSteers()).toEqual(['notice']);

    // The prompt's result does not settle the turn while the late steer may still run.
    fake.result(fake.uuidOf('prompt'));
    expect(turn.isSettled).toBe(false);

    fake.lifecycle(fake.uuidOf('notice'), 'started');
    expect(turn.unconsumedSteers()).toEqual([]);
    fake.result(fake.uuidOf('notice'));
    await turn.settle();
    expect(turn.isSettled).toBe(true);
});

test('a result for a message this turn never wrote does not finish it', async () => {
    const fake = fakeConnection();
    const turn = newTurn(fake.connection);
    await turn.start('prompt');

    // A stray result from an earlier turn's late steer, arriving on the warm connection.
    fake.result('an-earlier-turns-steer');
    expect(turn.isSettled).toBe(false);

    fake.result(fake.uuidOf('prompt'));
    await turn.settle();
    expect(turn.isSettled).toBe(true);
});
