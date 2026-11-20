import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { runnerHelloSchema, runnerSocketPath } from '@haus/api';
import { WebSocket, WebSocketServer } from 'ws';
import { onAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import type { InvocationRouter } from '../agent-invocations/invocation-router.ts';
import {
    defaultComputerSocketLiveness,
    watchComputerSocketLiveness,
} from '../computers/socket-liveness.ts';
import type { HausContextDependencies } from '../haus-api/context.ts';
import type { HausServerApplicationOptions } from '../haus-server-options.ts';
import { createAgentThoughts } from '../server-agents/agent-thought.ts';
import { ingestRunnerFrame } from './ingest.ts';
import type { RunnerAttachment } from './runner-link.ts';

export type RunnerSocketServices = Pick<
    HausContextDependencies,
    | 'agentDelivery'
    | 'computerConnections'
    | 'hausDb'
    | 'modelConnections'
    | 'postCommitWork'
    | 'runnerLink'
> & { invocations: InvocationRouter };

export type RunnerSocketSettings = Pick<
    HausServerApplicationOptions,
    'runnerToken' | 'thoughtSummarizer'
>;

export function startRunnerSocket(
    server: Server,
    settings: RunnerSocketSettings,
    services: RunnerSocketServices
) {
    const { agentDelivery: delivery, hausDb: db, invocations, modelConnections } = services;
    const { computerConnections: computers, postCommitWork, runnerLink: link } = services;
    const thoughts = createAgentThoughts({ summarizer: settings.thoughtSummarizer ?? null });
    const stopThoughtsOnSettle = onAgentLifecycle((event) => {
        if (event.phase === 'settled') {
            thoughts.endRun(event.runId);
        }
    });
    const ingest = {
        computers,
        db,
        delivery,
        invocations,
        link,
        modelConnections,
        postCommitWork,
        thoughts,
    };
    const sockets = new Set<WebSocket>();
    const socketServer = new WebSocketServer({ noServer: true });
    const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (new URL(request.url ?? '/', 'http://localhost').pathname !== runnerSocketPath) {
            return;
        }
        socketServer.handleUpgrade(request, socket, head, (connection) => {
            socketServer.emit('connection', connection);
        });
    };
    server.on('upgrade', onUpgrade);
    socketServer.on('connection', (socket: WebSocket) => {
        sockets.add(socket);
        const attachment: RunnerAttachment = {
            close: (code, reason) => socket.close(code, reason),
            isOpen: () => socket.readyState === WebSocket.OPEN,
            send: (frame) => socket.send(JSON.stringify(frame)),
        };
        const liveness = watchComputerSocketLiveness(socket, defaultComputerSocketLiveness, () =>
            socket.terminate()
        );
        let messageQueue = Promise.resolve();
        socket.on('message', (raw) => {
            const rawString = raw.toString();
            messageQueue = messageQueue
                .then(async () => {
                    if (link.isAttached(attachment)) {
                        await ingestRunnerFrame(ingest, rawString);
                        return;
                    }
                    if (!acceptsHello(settings.runnerToken, rawString)) {
                        socket.close(4403, 'Runner token was rejected.');
                        return;
                    }
                    link.attach(attachment);
                    attachment.send({ type: 'runner-hello-accepted' });
                    invocations.runnerAttached();
                    await modelConnections.runnerAttached();
                    await delivery.onRunnerReconnect();
                })
                .catch((error: unknown) => {
                    console.error('[haus] runner frame failed', error);
                    socket.close(1011, 'Runner report failed.');
                });
        });
        socket.on('close', () => {
            sockets.delete(socket);
            liveness.stop();
            if (link.isAttached(attachment)) {
                link.detach(attachment);
                modelConnections.runnerLost();
            }
        });
    });
    return {
        close: () => {
            server.off('upgrade', onUpgrade);
            stopThoughtsOnSettle();
            invocations.close();
            for (const socket of sockets) {
                socket.close(1001, 'Server shutting down');
            }
            socketServer.close();
        },
    };
}

function acceptsHello(token: string | undefined, raw: string) {
    if (!token) {
        return false;
    }
    const hello = parseHello(raw);
    return hello !== null && timingSafeEqual(digest(hello.token), digest(token));
}

function parseHello(raw: string) {
    try {
        const parsed = runnerHelloSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function digest(value: string) {
    return createHash('sha256').update(value).digest();
}
