import { JsonRpcConnection } from '../../json-rpc-connection.ts';
import type { TurnEvent } from '../../turn-event.ts';
import type { GrokLive } from '../grok-live.ts';
import { grokRequestHandler } from '../grok-permissions.ts';
import { GrokSession } from '../grok-session.ts';
import { createWorkspacePaths } from '../workspace-paths.ts';

/** A Grok that answers each method with `respond`, and can send its own messages. */
export function fakeGrok(respond: (method: string, params: Record<string, unknown>) => unknown) {
    const written: Record<string, unknown>[] = [];
    let connection: JsonRpcConnection;
    const send = (message: Record<string, unknown>) =>
        connection.receiveLine(JSON.stringify({ jsonrpc: '2.0', ...message }));
    connection = new JsonRpcConnection({
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
    const session = new GrokSession(live, {
        isResume: false,
        park: () => Promise.resolve(),
        relaunch: () => Promise.reject(new Error('no relaunch')),
    });
    return { send, session, written };
}

export const update = (sessionUpdate: string, extra: Record<string, unknown> = {}) => ({
    method: 'session/update',
    params: { sessionId: 's-1', update: { sessionUpdate, ...extra } },
});

export async function drain(events: AsyncIterable<TurnEvent>) {
    const seen: TurnEvent[] = [];
    for await (const event of events) {
        seen.push(event);
    }
    return seen;
}
