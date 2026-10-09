import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
    computerBootstrapHelloSchema,
    computerHeartbeatNegotiationSchema,
    computerHeartbeatSchema,
    computerProtocolVersion,
} from '@haus/api';
import { WebSocket, WebSocketServer } from 'ws';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { onAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import { emitServerUpdated } from '../haus-api/server-events.ts';
import { sendPendingCoveApplication } from '../onboarding/create-cove.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createAgentThoughts } from '../server-agents/agent-thought.ts';
import type { ThoughtSummarizer } from '../server-agents/agent-thought-summarizer.ts';
import { clearHausAgentState } from '../server-agents/record-haus-agent-state.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { sendCloudAgentReconcile } from './cloud-agent-reports.ts';
import type { ComputerConnections } from './connections.ts';
import { ingestReport } from './ingest-report.ts';
import {
    hashComputerSecret,
    markComputerOffline,
    reportComputerHandshake,
    resolveComputerCredential,
} from './service.ts';
import {
    type ComputerSocketLivenessTiming,
    defaultComputerSocketLiveness,
    watchComputerSocketLiveness,
} from './socket-liveness.ts';

// The app-level heartbeat keeps Raft's cadence; transport pings detect silence sooner.
const heartbeatConfiguration = {
    intervalMs: 30_000,
    timeoutMs: 60_000,
    type: 'heartbeat-configuration',
} as const;

/** The only Server-to-Computer transport: one authenticated outbound socket per Computer. */
export function startComputerAttachmentSocket(
    server: Server,
    db: HausDatabase,
    connections: ComputerConnections,
    delivery: AgentDelivery,
    postCommitWork: ServerPostCommitWork,
    thoughtSummarizer: ThoughtSummarizer | null,
    liveness: ComputerSocketLivenessTiming = defaultComputerSocketLiveness
) {
    const thoughts = createAgentThoughts({ summarizer: thoughtSummarizer });
    // A settled turn drops its held and waiting thoughts (ADR 0036).
    const stopThoughtsOnSettle = onAgentLifecycle((event) => {
        if (event.phase === 'settled') {
            thoughts.endRun(event.runId);
        }
    });
    const sockets = new Map<string, WebSocket>();
    const socketServer = new WebSocketServer({ noServer: true });
    const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (path !== '/computer/attachment') {
            return;
        }
        socketServer.handleUpgrade(request, socket, head, (connection) => {
            socketServer.emit('connection', connection);
        });
    };
    server.on('upgrade', onUpgrade);
    socketServer.on('connection', (socket) => {
        let computerId: string | null = null;
        let attachedServerId: string | null = null;
        let closed = false;
        let ordinary = false;
        let connectionGeneration: string | null = null;
        let disconnectReason: 'heartbeat-timeout' | 'socket-closed' = 'socket-closed';
        let messageQueue = Promise.resolve();
        let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
        let offlineMarked = false;
        const reapSilentSocket = () => {
            disconnectReason = 'heartbeat-timeout';
            socket.terminate();
        };
        const socketLiveness = watchComputerSocketLiveness(socket, liveness, reapSilentSocket);
        const armHeartbeatTimeout = () => {
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
            }
            heartbeatTimeout = setTimeout(reapSilentSocket, heartbeatConfiguration.timeoutMs);
        };
        // Marks this socket's committed handshake offline exactly once. The close
        // can land before the handshake commits, so bootstrap calls this too.
        const markClosedOffline = () => {
            if (offlineMarked || !(closed && computerId && attachedServerId)) {
                return;
            }
            if (!connectionGeneration) {
                return;
            }
            offlineMarked = true;
            const closedComputerId = computerId;
            const serverId = attachedServerId;
            markComputerOffline(db, closedComputerId, connectionGeneration, disconnectReason)
                .then(() => {
                    emitServerUpdated({
                        computerId: closedComputerId,
                        scope: 'computer',
                        serverId,
                    });
                })
                .catch((error: unknown) => {
                    console.error('[haus] failed to mark a closed Computer offline', error);
                });
        };
        const handleHeartbeatFrame = (raw: string) => {
            if (!(computerId && attachedServerId)) {
                return false;
            }
            if (parseComputerHeartbeatNegotiation(raw)) {
                if (!closed) {
                    armHeartbeatTimeout();
                    socket.send(JSON.stringify(heartbeatConfiguration));
                }
                return true;
            }
            const heartbeat = parseComputerHeartbeat(raw);
            if (!heartbeat) {
                return false;
            }
            if (!closed) {
                socket.send(JSON.stringify({ id: heartbeat.id, type: 'heartbeat-ack' }));
                armHeartbeatTimeout();
            }
            return true;
        };
        const bootstrap = async (rawString: string) => {
            const hello = computerBootstrapHelloSchema.parse(JSON.parse(rawString));
            const resolvedComputer = await resolveComputerCredential(
                db,
                hashComputerSecret(hello.credential)
            );
            if (closed) {
                return;
            }
            if (sockets.has(resolvedComputer.id)) {
                socket.close(4409, 'A Computer may have one attachment socket.');
                return;
            }
            computerId = resolvedComputer.id;
            attachedServerId = resolvedComputer.serverId;
            sockets.set(resolvedComputer.id, socket);
            const computer = await reportComputerHandshake(db, resolvedComputer, hello);
            connectionGeneration = computer.connectionGeneration;
            if (closed) {
                markClosedOffline();
                return;
            }
            await clearHausAgentState(db, computer.id);
            if (closed) {
                // The close handler already marked this generation offline.
                return;
            }
            ordinary = hello.protocolVersion === computerProtocolVersion;
            connections.register(computer.id, {
                disconnect: (reason) => socket.close(4000, reason),
                ordinary,
                isOpen: () => socket.readyState === WebSocket.OPEN,
                probe: () => socketLiveness.probe(liveness.probeTimeoutMs),
                send: (frame) => socket.send(JSON.stringify(frame)),
                serverId: computer.serverId,
                updatePhase: hello.update.phase,
            });
            socket.send(
                JSON.stringify({
                    mode: ordinary ? 'ordinary' : 'update-required',
                    type: 'bootstrap-accepted',
                })
            );
            emitServerUpdated({
                computerId: computer.id,
                scope: 'computer',
                serverId: computer.serverId,
            });
            if (!ordinary) {
                return;
            }
            void sendPendingCoveApplication(db, connections, computer.id).catch(() => undefined);
            // Idempotent reconnect: resend unacknowledged deliveries and drain
            // any pending inbox for this Computer's Agents.
            void delivery.onComputerReconnect(computer.id).catch(() => undefined);
            void postCommitWork.run('cloud-agent.reconcile-on-connect', () =>
                sendCloudAgentReconcile(db, connections, computer)
            );
        };
        socket.on('message', (raw) => {
            const rawString = raw.toString();
            if (handleHeartbeatFrame(rawString)) {
                return;
            }
            messageQueue = messageQueue
                .then(async () => {
                    if (computerId && attachedServerId) {
                        // A negotiation can arrive while its bootstrap is still queued.
                        if (handleHeartbeatFrame(rawString)) {
                            return;
                        }
                        await ingestReport(
                            db,
                            connections,
                            delivery,
                            computerId,
                            attachedServerId,
                            ordinary,
                            rawString,
                            postCommitWork,
                            thoughts
                        );
                        return;
                    }
                    try {
                        await bootstrap(rawString);
                    } catch {
                        socket.close(4403, 'Computer credential was rejected.');
                    }
                })
                .catch(() => {
                    socket.close(1011, 'Computer report failed.');
                });
        });
        socket.on('close', () => {
            closed = true;
            socketLiveness.stop();
            if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
            }
            if (computerId && sockets.get(computerId) === socket) {
                sockets.delete(computerId);
                connections.unregister(computerId);
            }
            // Generation-guarded, so a newer attachment's row is never touched.
            markClosedOffline();
        });
    });
    return {
        close: () => {
            server.off('upgrade', onUpgrade);
            stopThoughtsOnSettle();
            for (const socket of sockets.values()) {
                socket.close(1001, 'Server shutting down');
            }
            socketServer.close();
        },
    };
}

function parseComputerHeartbeat(raw: string) {
    try {
        const parsed = computerHeartbeatSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function parseComputerHeartbeatNegotiation(raw: string) {
    try {
        return computerHeartbeatNegotiationSchema.safeParse(JSON.parse(raw)).success;
    } catch {
        return false;
    }
}
