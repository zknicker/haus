// Permission and steering cases ported from botiverse/raft-source
// packages/daemon/src/drivers/grok.test.ts (FSL-1.1-ALv2), on an in-memory Grok.
import { expect, test } from 'bun:test';
import type { TurnEvent } from '../turn-event.ts';
import { AcpConnection } from './acp-connection.ts';
import { grokLaunchArgs } from './grok-launch.ts';
import type { GrokLive } from './grok-live.ts';
import { grokRequestHandler } from './grok-permissions.ts';
import { GrokSession } from './grok-session.ts';
import { createWorkspacePaths } from './workspace-paths.ts';

/** A Grok that answers each method with `respond`, and can send its own messages. */
function fakeGrok(respond: (method: string, params: Record<string, unknown>) => unknown) {
    const written: Record<string, unknown>[] = [];
    let connection: AcpConnection;
    const send = (message: Record<string, unknown>) =>
        connection.receiveLine(JSON.stringify({ jsonrpc: '2.0', ...message }));
    connection = new AcpConnection({
        write: (line) => {
            const message = JSON.parse(line) as Record<string, unknown>;
            written.push(message);
            if (typeof message.method === 'string' && message.id !== undefined) {
                const id = message.id;
                const methodNotFound = (error: Error) => ({
                    error: { code: -32_601, message: error.message },
                    id,
                });
                Promise.resolve(
                    respond(message.method, message.params as Record<string, unknown>)
                ).then(
                    (answer) =>
                        send(
                            answer instanceof Error
                                ? methodNotFound(answer)
                                : { id, result: answer }
                        ),
                    () => undefined
                );
            }
            return Promise.resolve();
        },
    });
    const live = {
        credential: { kind: 'api-key' },
        fingerprint: 'f',
        hostServerName: 'haus',
        hostTools: { close: () => undefined, mcp: {} as never, replaceTools: () => undefined },
        isResume: false,
        modelId: 'grok-4.6',
        paths: createWorkspacePaths([]),
        process: {
            connection,
            exited: new Promise(() => undefined),
            pid: 1,
            stderrTail: () => '',
            terminate: () => Promise.resolve(),
        },
        sessionId: 's-1',
        turnRunning: false,
    } as GrokLive;
    connection.setRequestHandler(
        grokRequestHandler({
            autoApprove: true,
            isTurnRunning: () => live.turnRunning,
            sessionId: () => live.sessionId,
        })
    );
    const session = new GrokSession(live, () => Promise.reject(new Error('no relaunch')), {
        isResume: false,
    });
    return { send, session, written };
}

const update = (sessionUpdate: string, extra: Record<string, unknown> = {}) => ({
    method: 'session/update',
    params: { sessionId: 's-1', update: { sessionUpdate, ...extra } },
});

async function drain(events: AsyncIterable<TurnEvent>) {
    const seen: TurnEvent[] = [];
    for await (const event of events) {
        seen.push(event);
    }
    return seen;
}

test('an unsupported interjection is unsupported, never a failed turn', async () => {
    let finishPrompt: (value: unknown) => void = () => undefined;
    const grok = fakeGrok((method) =>
        method === '_x.ai/interject'
            ? new Error('Method not found: _x.ai/interject')
            : new Promise((resolve) => {
                  finishPrompt = resolve;
              })
    );
    const turn = await grok.session.startTurn({
        prompt: 'start',
        signal: new AbortController().signal,
    });
    grok.send(update('agent_message_chunk', { content: { text: 'working', type: 'text' } }));

    expect(await grok.session.steer('steer')).toEqual({ delivered: false, reason: 'unsupported' });
    finishPrompt({ stopReason: 'end_turn' });
    const events = await drain(turn.events);
    expect(events.at(-1)).toMatchObject({ type: 'turn-finish' });
    expect(events.filter((event) => event.type === 'error')).toEqual([]);
});

test('an interjection the running turn refuses is failed with its error', async () => {
    let finishPrompt: (value: unknown) => void = () => undefined;
    const grok = fakeGrok((method) =>
        // The interjection stays unanswered here; the test answers it with an error below.
        method === '_x.ai/interject'
            ? Promise.reject(new Error('answered by the test'))
            : new Promise((resolve) => {
                  finishPrompt = resolve;
              })
    );
    await grok.session.startTurn({ prompt: 'start', signal: new AbortController().signal });
    grok.send(update('agent_message_chunk', { content: { text: 'working', type: 'text' } }));
    const refusal = grok.session.steer('steer');
    await Bun.sleep(0);
    expect(grok.written.at(-1)).toMatchObject({ id: 2, method: '_x.ai/interject' });
    grok.send({ error: { code: -32_603, message: 'Internal error', data: 'queue full' }, id: 2 });

    expect(await refusal).toMatchObject({ delivered: false, reason: 'failed' });
    finishPrompt({ stopReason: 'end_turn' });
});

test('a blank final answer is an ordinary turn end; a late terminal notification is only progress', async () => {
    const grok = fakeGrok((method) =>
        method === 'session/prompt' ? { stopReason: 'end_turn' } : {}
    );
    const turn = await grok.session.startTurn({
        prompt: 'start',
        signal: new AbortController().signal,
    });
    grok.send({
        method: '_x.ai/session_notification',
        params: {
            sessionId: 's-1',
            update: {
                prompt_id: 'previous',
                sessionUpdate: 'turn_completed',
                stop_reason: 'end_turn',
            },
        },
    });

    const events = await drain(turn.events);
    expect(events.at(-1)).toEqual({ claudePlanUsage: null, type: 'turn-finish', usage: null });
    expect(events.filter((event) => event.type === 'error')).toEqual([]);
});

test('always-approve selects the offered allow-once option for the active session during a turn', async () => {
    let finishPrompt: (value: unknown) => void = () => undefined;
    const grok = fakeGrok(
        () =>
            new Promise((resolve) => {
                finishPrompt = resolve;
            })
    );
    const turn = await grok.session.startTurn({
        prompt: 'start',
        signal: new AbortController().signal,
    });
    const options = [
        { kind: 'allow_once', name: 'Allow', optionId: 'allow-once' },
        { kind: 'reject_once', name: 'Reject', optionId: 'reject-once' },
    ];
    grok.send({
        id: 'permission-1',
        method: 'session/request_permission',
        params: { options, sessionId: 's-1', toolCall: { toolCallId: 't' } },
    });
    grok.send({
        id: 'permission-2',
        method: 'session/request_permission',
        params: { options, sessionId: 'other', toolCall: { toolCallId: 't' } },
    });
    grok.send({
        id: 'permission-3',
        method: 'session/request_permission',
        params: { options: options.slice(1), sessionId: 's-1', toolCall: { toolCallId: 't' } },
    });
    grok.send({
        id: 'fs-1',
        method: 'fs/read_text_file',
        params: { path: '/etc/hosts', sessionId: 's-1' },
    });
    await Bun.sleep(0);
    finishPrompt({ stopReason: 'end_turn' });
    await turn.settle();
    grok.send({
        id: 'permission-late',
        method: 'session/request_permission',
        params: { options, sessionId: 's-1', toolCall: { toolCallId: 't' } },
    });
    await Bun.sleep(0);

    const answer = (id: string) => grok.written.find((message) => message.id === id);
    expect(answer('permission-1')).toMatchObject({
        result: { outcome: { optionId: 'allow-once', outcome: 'selected' } },
    });
    expect(answer('permission-2')).toMatchObject({
        error: {
            code: -32_602,
            message: expect.stringContaining('does not match the active Grok session'),
        },
    });
    expect(answer('permission-3')).toMatchObject({
        error: {
            code: -32_602,
            message: expect.stringContaining('does not offer an allow_once option'),
        },
    });
    expect(answer('fs-1')).toMatchObject({ error: { code: -32_601 } });
    expect(answer('permission-late')).toMatchObject({
        error: {
            code: -32_602,
            message: expect.stringContaining('outside an active always-approve turn'),
        },
    });
});

test('without the launch yolo fact nothing is auto-approved', () => {
    const handler = grokRequestHandler({
        autoApprove: false,
        isTurnRunning: () => true,
        sessionId: () => 's-1',
    });

    expect(grokLaunchArgs('default')).toContain('--always-approve');
    expect(() =>
        handler('session/request_permission', {
            options: [{ kind: 'allow_once', optionId: 'a' }],
            sessionId: 's-1',
        })
    ).toThrow('outside an active always-approve turn');
});

test('one turn at a time; an aborted signal before the prompt is an immediate abort', async () => {
    let finishPrompt: (value: unknown) => void = () => undefined;
    const grok = fakeGrok(
        () =>
            new Promise((resolve) => {
                finishPrompt = resolve;
            })
    );
    await grok.session.startTurn({ prompt: 'one', signal: new AbortController().signal });

    await expect(
        grok.session.startTurn({ prompt: 'two', signal: new AbortController().signal })
    ).rejects.toThrow('already running');
    finishPrompt({ stopReason: 'end_turn' });
    await Bun.sleep(0);
    const aborted = AbortSignal.abort();
    const events = await drain(
        (await grok.session.startTurn({ prompt: 'three', signal: aborted })).events
    );
    expect(events).toEqual([{ type: 'abort' }]);
});
