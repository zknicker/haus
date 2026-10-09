import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { TRPCError } from '@trpc/server';
import { applyWSSHandler, type CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import type { HausContext } from './context.ts';
import { hausRouter } from './router.ts';
import { SocketSession, socketSessionExpiredCloseCode } from './socket-session.ts';

const trpcWebSocketPath = '/trpc';

interface HausWebSocketServerOptions {
    createContext(opts: CreateWSSContextFnOptions): HausContext;
    isAllowedOrigin(origin: string | undefined): boolean;
    /** How long a socket outlives its newest token's expiry; tests shorten it. */
    socketSessionGraceMs?: number;
}

export function startHausWebSocketServer(server: Server, options: HausWebSocketServerOptions) {
    const wss = new WebSocketServer({
        noServer: true,
    });
    let isClosing = false;

    const handler = applyWSSHandler({
        createContext: (opts) => withSocketSession(options, opts),
        onError: reportSocketProcedureError,
        router: hausRouter,
        wss,
    });

    wss.on('connection', (socket) => {
        socket.once('close', (code) => {
            if (!quietCloseCodes.has(code)) {
                console.warn('[haus] App socket closed', { code });
            }
        });
    });

    const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (!(request.url && isTrpcWebSocketRequest(request.url))) {
            return;
        }

        if (isClosing) {
            socket.destroy();
            return;
        }

        if (!options.isAllowedOrigin(request.headers.origin)) {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            return;
        }

        try {
            wss.handleUpgrade(request, socket, head, (webSocket) => {
                wss.emit('connection', webSocket, request);
            });
        } catch {
            socket.destroy();
        }
    };

    server.on('upgrade', handleUpgrade);

    return {
        broadcastReconnectNotification() {
            handler.broadcastReconnectNotification();
        },
        close() {
            isClosing = true;
            server.off('upgrade', handleUpgrade);
            for (const client of wss.clients) {
                client.terminate();
            }
            wss.close();
        },
    };
}

/**
 * Each App socket carries one live Clerk session (see `SocketSession`). The
 * Server closes the socket once that session lapses unrefreshed, and the App
 * reconnects with whatever session it now holds.
 */
function withSocketSession(
    options: HausWebSocketServerOptions,
    opts: CreateWSSContextFnOptions
): HausContext {
    const ctx = options.createContext(opts);
    const socket = opts.res;
    const socketSession = new SocketSession({
        close: () => socket.close(socketSessionExpiredCloseCode, 'Haus session expired'),
        openingToken: ctx.clerkSessionToken,
        timing:
            options.socketSessionGraceMs === undefined
                ? undefined
                : { graceMs: options.socketSessionGraceMs },
    });

    if (socket.readyState === socket.CLOSED || socket.readyState === socket.CLOSING) {
        socketSession.dispose();
    } else {
        socket.once('close', () => socketSession.dispose());
    }
    return { ...ctx, socketSession };
}

/** Normal closure, a page going away, and a client close without a code. */
const quietCloseCodes = new Set([1000, 1001, 1005]);

/**
 * A failed socket procedure — most often a subscription the Server ended — is
 * otherwise invisible: the App only sees the error shape. Logs the procedure
 * path, its tRPC code, and the error class, never input, payloads, or identity.
 */
function reportSocketProcedureError({
    error,
    path,
    type,
}: {
    error: TRPCError;
    path: string | undefined;
    type: string;
}) {
    const cause = error.cause ?? error;
    const log = error.code === 'INTERNAL_SERVER_ERROR' ? console.error : console.warn;
    log('[haus] App socket procedure failed', {
        code: error.code,
        errorClass: cause instanceof Error ? cause.name : typeof cause,
        path: path ?? 'unknown',
        type,
    });
}

function isTrpcWebSocketRequest(requestUrl: string) {
    try {
        return new URL(requestUrl, 'http://localhost').pathname === trpcWebSocketPath;
    } catch {
        return false;
    }
}
