import type { Page, WebSocketRoute } from '@playwright/test';

/** One tRPC socket message from the App. */
interface ClientMessage {
    id?: number | string;
    method?: string;
    params?: { input?: unknown; path?: string };
}

/** One subscription start the App sent, on the socket it was sent on. */
export interface ProxiedSubscription {
    id: number | string;
    /** The subscription input, serialized: one stream instance per path and input. */
    input: string;
    path: string;
    socket: number;
}

/** The tRPC error codes a refused start answers with. */
const refusalCodes = {
    FORBIDDEN: -32_003,
    INTERNAL_SERVER_ERROR: -32_603,
    UNAUTHORIZED: -32_001,
} as const;

export type ProxyRefusal = keyof typeof refusalCodes;

/**
 * A proxy on the App's tRPC socket (`page.routeWebSocket`) for the realtime
 * incident detector (specs/realtime-events.md, "App e2e"). It records every
 * subscription start and every frame the Server delivers per subscription id,
 * and can hold starts at the proxy, refuse them with a coded error, inject an
 * error frame into a live subscription, and replay or reorder delivered
 * frames. Every App socket (a reconnect opens a new one) is proxied.
 */
export async function installRealtimeProxy(page: Page) {
    const sockets: { client: WebSocketRoute; server: WebSocketRoute }[] = [];
    const subscriptions: ProxiedSubscription[] = [];
    const delivered = new Map<string, unknown[]>();
    const ended = new Set<string>();
    const socketCalls: { path: string; socket: number }[] = [];
    let held: { message: ClientMessage; socket: number }[] = [];
    let holdPaths: ReadonlySet<string> | 'all' = new Set<string>();
    const refusals = new Map<string, ProxyRefusal[]>();
    let duplicateNext: string | null = null;
    let parkNext: { path: string; parked: (() => void) | null } | null = null;

    const forward = (socket: number, message: ClientMessage) => {
        const route = sockets[socket];
        const refusal = message.params?.path
            ? refusals.get(message.params.path)?.shift()
            : undefined;
        if (refusal && message.method === 'subscription') {
            route?.client.send(errorFrame(message.id ?? 0, refusal, message.params?.path ?? ''));
            return;
        }
        route?.server.send(JSON.stringify(message));
    };

    await page.routeWebSocket(/\/trpc/u, (client) => {
        const socket = sockets.length;
        const server = client.connectToServer();
        sockets.push({ client, server });
        client.onMessage((raw) => {
            const messages = parseMessages(raw);
            if (!messages) {
                // Keep-alive PING and anything else that is not a tRPC message.
                server.send(raw);
                return;
            }
            for (const message of messages) {
                fromApp(socket, message);
            }
        });
        server.onMessage((raw) => fromServer(socket, raw));
    });

    /** Records an App message, and holds a start of a held path instead of forwarding it. */
    function fromApp(socket: number, message: ClientMessage) {
        const path = message.params?.path;
        if (message.method === 'subscription' && path && message.id !== undefined) {
            subscriptions.push({
                id: message.id,
                input: JSON.stringify(message.params?.input ?? null),
                path,
                socket,
            });
            if (holdPaths === 'all' || holdPaths.has(path)) {
                held.push({ message, socket });
                return;
            }
        } else if ((message.method === 'mutation' || message.method === 'query') && path) {
            socketCalls.push({ path, socket });
        }
        forward(socket, message);
    }

    /** Records a Server frame, then drops, parks, duplicates, or passes it to the App. */
    function fromServer(socket: number, raw: string | Buffer) {
        const client = sockets[socket]?.client;
        const frame = parseFrame(raw);
        const subscription = subscriptions.find(
            (candidate) => candidate.socket === socket && candidate.id === frame?.id
        );
        if (!(subscription && frame?.result?.type === 'data')) {
            if (!(subscription && ended.has(`${socket}:${subscription.id}`))) {
                client?.send(raw);
            }
            return;
        }
        const key = `${socket}:${subscription.id}`;
        if (ended.has(key)) {
            return;
        }
        delivered.set(key, [...(delivered.get(key) ?? []), frame.result.data]);
        if (parkNext?.path === subscription.path && parkNext.parked === null) {
            // Hold this frame until the next one of its path has gone out.
            parkNext.parked = () => client?.send(raw);
            return;
        }
        client?.send(raw);
        if (parkNext?.path === subscription.path && parkNext.parked) {
            parkNext.parked();
            parkNext = null;
        }
        if (duplicateNext === subscription.path) {
            duplicateNext = null;
            client?.send(raw);
        }
    }

    return {
        /** Server-delivered data frames of one subscription. */
        deliveredTo: (subscription: ProxiedSubscription) =>
            delivered.get(`${subscription.socket}:${subscription.id}`) ?? [],
        /** The next delivered frame of `path` reaches the App twice. */
        duplicateNext(path: string) {
            duplicateNext = path;
        },
        /** Holds new starts of these paths (or of every path) at the proxy. */
        hold(paths: readonly string[] | 'all') {
            holdPaths = paths === 'all' ? 'all' : new Set(paths);
        },
        /** Sends an error frame for a live subscription id, as if the Server ended it. */
        inject(subscription: ProxiedSubscription, code: ProxyRefusal) {
            // An ended subscription delivers nothing more: drop its later frames
            // and tell the Server to stop it, as a real error would.
            ended.add(`${subscription.socket}:${subscription.id}`);
            sockets[subscription.socket]?.server.send(
                JSON.stringify({ id: subscription.id, method: 'subscription.stop' })
            );
            sockets[subscription.socket]?.client.send(
                errorFrame(subscription.id, code, subscription.path)
            );
        },
        /** The most recent start of `path`. */
        latest(path: string) {
            const found = subscriptions.filter((subscription) => subscription.path === path).at(-1);
            if (!found) {
                throw new Error(`The App never started ${path}.`);
            }
            return found;
        },
        /** Delivers the next two frames of `path` in reverse order. */
        reverseNextPair(path: string) {
            parkNext = { parked: null, path };
        },
        /** Answers the next starts of `path` with these errors, in order. */
        refuse(path: string, codes: readonly ProxyRefusal[]) {
            refusals.set(path, [...codes]);
        },
        /** Stops holding and forwards every held start, in order. */
        release() {
            holdPaths = new Set();
            const due = held;
            held = [];
            for (const { message, socket } of due) {
                forward(socket, message);
            }
        },
        socketCalls,
        socketCount: () => sockets.length,
        subscriptions,
    };
}

export type RealtimeProxy = Awaited<ReturnType<typeof installRealtimeProxy>>;

function errorFrame(id: number | string, code: ProxyRefusal, path: string) {
    const httpStatus = { FORBIDDEN: 403, INTERNAL_SERVER_ERROR: 500, UNAUTHORIZED: 401 }[code];
    return JSON.stringify({
        error: {
            code: refusalCodes[code],
            data: { code, httpStatus, path },
            message: `Injected ${code}`,
        },
        id,
    });
}

function parseMessages(raw: string | Buffer): ClientMessage[] | null {
    const text = raw.toString();
    if (!(text.startsWith('{') || text.startsWith('['))) {
        return null;
    }
    const parsed = JSON.parse(text) as ClientMessage | ClientMessage[];
    return Array.isArray(parsed) ? parsed : [parsed];
}

function parseFrame(raw: string | Buffer) {
    const text = raw.toString();
    if (!text.startsWith('{')) {
        return null;
    }
    return JSON.parse(text) as { id?: number | string; result?: { data?: unknown; type?: string } };
}
