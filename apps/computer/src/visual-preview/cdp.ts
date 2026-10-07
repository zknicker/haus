import * as z from 'zod';

/** One CDP event; `sessionId` is set for events from an attached target. */
export interface CdpEvent {
    method: string;
    params: unknown;
    sessionId?: string;
}

/**
 * The few Chrome DevTools Protocol calls the visual preview needs, over one
 * browser-level connection. Target sessions are flattened onto it, so a
 * `sessionId` addresses a page or frame target.
 */
export interface CdpClient {
    close(): void;
    on(listener: (event: CdpEvent) => void): () => void;
    send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown>;
}

const messageSchema = z.object({
    error: z.object({ message: z.string() }).optional(),
    id: z.number().optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
    sessionId: z.string().optional(),
});

const connectTimeoutMs = 5000;
// Past a render's own 15s cap, so it only bounds calls nothing else bounds
// (Fetch.enable, a wedged browser); a closed socket never answers at all.
const commandTimeoutMs = 20_000;

/** Open a CDP connection to a browser's `webSocketDebuggerUrl`. */
export async function connectCdp(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('Chrome DevTools did not accept a connection.')),
            connectTimeoutMs
        );
        socket.addEventListener('open', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.addEventListener('error', () => {
            clearTimeout(timer);
            reject(new Error('Chrome DevTools connection failed.'));
        });
    });

    let nextId = 0;
    const pending = new Map<
        number,
        { reject: (error: Error) => void; resolve: (value: unknown) => void }
    >();
    const listeners = new Set<(event: CdpEvent) => void>();

    socket.addEventListener('message', (message) => {
        const parsed = messageSchema.safeParse(JSON.parse(String(message.data)));
        if (!parsed.success) {
            return;
        }
        const { error, id, method, params, result, sessionId } = parsed.data;
        if (id !== undefined) {
            const waiter = pending.get(id);
            pending.delete(id);
            if (error) {
                waiter?.reject(new Error(error.message));
            } else {
                waiter?.resolve(result);
            }
            return;
        }
        if (method) {
            for (const listener of listeners) {
                listener({ method, params, sessionId });
            }
        }
    });
    socket.addEventListener('close', () => {
        for (const waiter of pending.values()) {
            waiter.reject(new Error('Chrome DevTools connection closed.'));
        }
        pending.clear();
    });

    return {
        close: () => socket.close(),
        on(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        send(method, params, sessionId) {
            nextId += 1;
            const id = nextId;
            if (socket.readyState !== WebSocket.OPEN) {
                return Promise.reject(new Error('Chrome DevTools connection closed.'));
            }
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.delete(id);
                    reject(new Error(`Chrome DevTools did not answer ${method}.`));
                }, commandTimeoutMs);
                pending.set(id, {
                    reject: (error) => {
                        clearTimeout(timer);
                        reject(error);
                    },
                    resolve: (value) => {
                        clearTimeout(timer);
                        resolve(value);
                    },
                });
                socket.send(JSON.stringify({ id, method, params: params ?? {}, sessionId }));
            });
        },
    };
}
