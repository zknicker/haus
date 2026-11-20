import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Provider } from '@earendil-works/pi-ai';
import {
    type InvocationOutcome,
    type InvocationOutput,
    type ModelSignInProvider,
    type RunnerUpFrame,
    runnerSocketPath,
    runnerUpFrameSchema,
} from '@haus/api';
import { openDispatchLedger } from './dispatch/ledger.ts';
import type { InvocationClock } from './invocations/invocation-clock.ts';
import { createConnectionBook } from './model-connections/connection-book.ts';
import type { RunStart, TurnHost } from './run-context.ts';
import { openServerLink } from './server-link.ts';

export const runnerToken = 'runner-token-0123456789abcdef0123456789';
export const runCredential = `grtr_${'a'.repeat(43)}`;
export const cleanups: (() => Promise<void> | void)[] = [];

export type StandInRoutes = Record<
    string,
    (body: unknown, url: URL, request: Request) => Response | Promise<Response>
>;

export interface StandInRequest {
    readonly authorization: string | null;
    readonly body: unknown;
    readonly dispatchId: string | null;
    readonly method: string;
    readonly path: string;
}

export function live() {
    return new AbortController().signal;
}

export async function drainCleanups() {
    for (const cleanup of cleanups.splice(0)) {
        await cleanup();
    }
}

export async function attachRunner(
    server: ServerStandIn,
    options: {
        invocationClock?: InvocationClock;
        signInProvider?: (provider: ModelSignInProvider) => Provider;
    } = {}
) {
    const dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-link-'));
    const host = turnHostDriver();
    const book = createConnectionBook();
    const link = openServerLink({
        book,
        config: { runnerToken, serverUrl: server.url },
        ...options,
        ledger: openDispatchLedger(dataDir),
        log: () => undefined,
        reconnectDelaysMs: [0],
        turnHost: host.turnHost,
    });
    cleanups.push(async () => {
        link.close();
        await rm(dataDir, { force: true, recursive: true });
    });
    await link.ready;
    return { book, dataDir, host, link: link.link };
}

export async function startedRun(
    routes: StandInRoutes = {},
    options: { invocationClock?: InvocationClock } = {}
) {
    const server = serverStandIn(routes);
    const runner = await attachRunner(server, options);
    await server.frame('runner-inventory');
    server.start();
    return { run: await runner.host.started, runner, server };
}

function turnHostDriver() {
    let onStart: (run: RunStart) => void = () => undefined;
    let onStop: (stop: { agentId: string; runId: string }) => void = () => undefined;
    const started = new Promise<RunStart>((resolve) => {
        onStart = resolve;
    });
    const stopped = new Promise<{ agentId: string; runId: string }>((resolve) => {
        onStop = resolve;
    });
    const starts: string[] = [];
    const turnHost: TurnHost = {
        notice: async () => undefined,
        start: async (run) => {
            starts.push(run.start.runId);
            onStart(run);
        },
        stop: async (agentId, runId) => onStop({ agentId, runId }),
    };
    return { started, starts, stopped, turnHost };
}

export type ServerStandIn = ReturnType<typeof serverStandIn>;

export function serverStandIn(routes: StandInRoutes = {}) {
    const received: RunnerUpFrame[] = [];
    const waiters: { resolve(frame: RunnerUpFrame): void; type: string }[] = [];
    const requests: StandInRequest[] = [];
    const attested: unknown[] = [];
    let runner: { close(): void; send(text: string): unknown } | null = null;
    const handlers: StandInRoutes = {
        '/api/agent/events/visible': (body) => {
            const { messages } = body as { messages: { id: string }[] };
            attested.push(messages);
            return Response.json({ accepted: messages.map((message) => message.id) });
        },
        '/api/agent/messages/send': () =>
            Response.json({
                message: chatMessage('msg_sent', 7),
                recentUnread: [{ message: chatMessage('msg_new', 8), target: '#all' }],
                state: 'sent',
            }),
        ...routes,
    };
    const server = Bun.serve({
        fetch: async (request, bun) => {
            const url = new URL(request.url);
            if (url.pathname === runnerSocketPath) {
                return bun.upgrade(request, { data: undefined })
                    ? undefined
                    : new Response('upgrade failed', { status: 400 });
            }
            const text = await request.text();
            const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
            if (url.pathname !== '/api/agent/events/visible') {
                const { nonce: _nonce, ...stable } = body ?? {};
                requests.push({
                    authorization: request.headers.get('authorization'),
                    body: body ? stable : null,
                    dispatchId: request.headers.get('haus-dispatch-id'),
                    method: request.method,
                    path: `${url.pathname}${url.search}`,
                });
            }
            const handler = handlers[url.pathname];
            return handler
                ? handler(body, url, request)
                : Response.json({ code: 'NOT_FOUND', message: url.pathname }, { status: 404 });
        },
        hostname: '127.0.0.1',
        port: 0,
        websocket: {
            message(socket, data) {
                const frame = runnerUpFrameSchema.parse(JSON.parse(String(data)));
                if (frame.type === 'runner-hello' && frame.token === runnerToken) {
                    runner = socket;
                    socket.send(JSON.stringify({ type: 'runner-hello-accepted' }));
                    return;
                }
                const waiter = waiters.findIndex((entry) => entry.type === frame.type);
                if (waiter >= 0) {
                    waiters.splice(waiter, 1)[0]?.resolve(frame);
                } else {
                    received.push(frame);
                }
            },
        },
    });
    cleanups.push(() => server.stop(true));
    const send = (frame: unknown) => runner?.send(JSON.stringify(frame));
    return {
        answer(result: {
            exitCode?: number;
            outcome: InvocationOutcome;
            output?: InvocationOutput;
            runId: string;
            seq: number;
            toolCallId: string;
        }) {
            send({
                agentId: 'agt_1',
                output: { kind: 'text', text: '' },
                truncated: false,
                type: 'invocation-result',
                ...result,
            });
        },
        attested,
        disconnect() {
            runner?.close();
            runner = null;
        },
        frame(type: RunnerUpFrame['type']) {
            const index = received.findIndex((frame) => frame.type === type);
            if (index >= 0) {
                return Promise.resolve(received.splice(index, 1)[0]);
            }
            return new Promise<RunnerUpFrame>((resolve) => waiters.push({ resolve, type }));
        },
        received,
        requests,
        send,
        start(
            frame: {
                modelConnectionId?: string | null;
                modelId?: string;
                reasoningEffort?: string;
                runId?: string;
            } = {}
        ) {
            const { modelConnectionId = null, modelId, reasoningEffort, runId } = frame;
            send({
                modelConnectionId,
                ...(reasoningEffort ? { reasoningEffort } : {}),
                runCredential,
                start: {
                    ...startCommand(),
                    ...(modelId ? { modelId } : {}),
                    ...(runId ? { runId } : {}),
                },
                type: 'runner-start',
            });
        },
        url: `http://127.0.0.1:${server.port}`,
    };
}

export function driveRoutes(handle: string, files: Map<string, string>) {
    const ids = new Map([...files.keys()].map((path, index) => [path, `art_${index}`]));
    const routes: StandInRoutes = {
        '/api/agent/artifacts/by-path': (_body, url) => {
            const path = url.searchParams.get('path') ?? '';
            const id = ids.get(path);
            return id && files.has(path)
                ? Response.json({ artifact: { artifact_id: id, path } })
                : Response.json({ code: 'NOT_FOUND', message: path }, { status: 404 });
        },
        '/api/agent/profile': () => Response.json({ profile: { handle } }),
    };
    for (const [path, id] of ids) {
        routes[`/api/agent/artifacts/${id}/download`] = (_body, url) =>
            Response.json({ download_url: new URL(`/drive-bytes/${id}`, url).href });
        routes[`/drive-bytes/${id}`] = () => new Response(files.get(path) ?? '');
    }
    return routes;
}

function startCommand() {
    return {
        agentId: 'agt_1',
        agentName: 'blippy',
        chatId: 'chat_1',
        drainItemIds: [],
        inboxDelivery: 'notice',
        modelId: 'claude-opus-4-5',
        runId: 'run_1',
        runtimeId: 'claude-agent-sdk',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
        warmDrainItemIds: [],
    };
}

function chatMessage(id: string, sequence: number) {
    return {
        attachments: [],
        author: { id: 'usr_operator', kind: 'user', label: 'Operator', metadata: {} },
        body_kind: 'text',
        chat_id: 'chat_messages',
        content: `body-${id}`,
        created_at: '2026-11-19T12:00:00.000Z',
        deleted_at: null,
        delivery_id: null,
        id,
        metadata: {},
        nonce: null,
        role: 'user',
        sender: { description: null, handle: 'operator', type: 'human' },
        sequence,
    };
}
