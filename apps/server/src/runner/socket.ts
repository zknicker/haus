import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { runnerHelloSchema, runnerSocketPath } from '@haus/api';
import { WebSocket, WebSocketServer } from 'ws';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { onAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import type { InvocationRouter } from '../agent-invocations/invocation-router.ts';
import {
    defaultComputerSocketLiveness,
    watchComputerSocketLiveness,
} from '../computers/socket-liveness.ts';
import type { HausServerApplicationOptions } from '../haus-server-options.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createAgentThoughts } from '../server-agents/agent-thought.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { ingestRunnerFrame } from './ingest.ts';
import type { RunnerAttachment, RunnerLink } from './runner-link.ts';

export interface RunnerSocketServices {
    db: HausDatabase;
    delivery: AgentDelivery;
    invocations: InvocationRouter;
    postCommitWork: ServerPostCommitWork;
}

export type RunnerSocketSettings = Pick<
    HausServerApplicationOptions,
    'agentLoop' | 'runnerToken' | 'thoughtSummarizer'
>;

export function startRunnerSocket(
    server: Server,
    link: RunnerLink,
    settings: RunnerSocketSettings,
    services: RunnerSocketServices
) {
    const { delivery } = services;
    const hostsLoops = settings.agentLoop === 'runner';
    const thoughts = createAgentThoughts({ summarizer: settings.thoughtSummarizer ?? null });
    const stopThoughtsOnSettle = onAgentLifecycle((event) => {
        if (event.phase === 'settled') {
            thoughts.endRun(event.runId);
        }
    });
    const ingest = { ...services, hostsLoops, link, thoughts };
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
                    services.invocations.runnerAttached();
                    if (hostsLoops) {
                        await delivery.onRunnerReconnect();
                    }
                })
                .catch((error: unknown) => {
                    console.error('[haus] runner frame failed', error);
                    socket.close(1011, 'Runner report failed.');
                });
        });
        socket.on('close', () => {
            sockets.delete(socket);
            liveness.stop();
            link.detach(attachment);
        });
    });
    return {
        close: () => {
            server.off('upgrade', onUpgrade);
            stopThoughtsOnSettle();
            services.invocations.close();
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
