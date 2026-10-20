import {
    encodeError,
    encodeNotification,
    encodeRequest,
    encodeResult,
    JsonRpcConnectionClosedError,
    type JsonRpcErrorBody,
    type JsonRpcId,
    JsonRpcRequestError,
    jsonRpcMethodNotFound,
    parseJsonRpcLine,
} from './json-rpc.ts';

/** Writes one encoded line to the peer; resolves once the bytes are accepted. */
export interface JsonRpcTransport {
    write(line: string): Promise<void>;
}

/** Answers a peer → client request; throw `JsonRpcHandlerError` for a JSON-RPC error reply. */
export type JsonRpcRequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown;

export type JsonRpcNotificationListener = (method: string, params: unknown) => void;

/** An error the client returns to the peer for one of its requests. */
export class JsonRpcHandlerError extends Error {
    constructor(readonly body: JsonRpcErrorBody) {
        super(body.message);
        this.name = 'JsonRpcHandlerError';
    }
}

interface Pending {
    readonly method: string;
    readonly reject: (error: unknown) => void;
    readonly resolve: (value: unknown) => void;
}

/**
 * The client side of one JSON-RPC line stream (Codex app-server, Grok ACP): request/response
 * correlation, notifications, peer → client requests, foreign JSON lines, and one close that
 * fails every request still waiting.
 */
export class JsonRpcConnection {
    private nextId = 1;
    private readonly pending = new Map<JsonRpcId, Pending>();
    private readonly listeners = new Set<JsonRpcNotificationListener>();
    private readonly foreignListeners = new Set<(value: Record<string, unknown>) => void>();
    private readonly invalidLineListeners = new Set<(line: string) => void>();
    private requestHandler: JsonRpcRequestHandler = () => {
        throw new JsonRpcHandlerError({ code: jsonRpcMethodNotFound, message: 'Method not found' });
    };
    private closeReason: Error | null = null;

    constructor(private readonly transport: JsonRpcTransport) {}

    get closed(): Error | null {
        return this.closeReason;
    }

    /** Sends a request; a local abort stops waiting (the peer's late answer is dropped). */
    request(method: string, params: unknown, options: { signal?: AbortSignal } = {}) {
        if (this.closeReason) {
            return Promise.reject(this.closedError(method));
        }
        options.signal?.throwIfAborted();
        const id = this.nextId++;
        const { promise, reject, resolve } = Promise.withResolvers<unknown>();
        this.pending.set(id, { method, reject, resolve });
        const onAbort = () => {
            if (this.pending.delete(id)) {
                reject(options.signal?.reason);
            }
        };
        options.signal?.addEventListener('abort', onAbort, { once: true });
        this.transport.write(encodeRequest(id, method, params)).catch((error: unknown) => {
            if (this.pending.delete(id)) {
                reject(this.closeReason ? this.closedError(method) : error);
            }
        });
        return promise.finally(() => options.signal?.removeEventListener('abort', onAbort));
    }

    async notify(method: string, params: unknown): Promise<void> {
        if (this.closeReason) {
            throw this.closedError(method);
        }
        await this.transport.write(encodeNotification(method, params));
    }

    onNotification(listener: JsonRpcNotificationListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** A JSON object that is no JSON-RPC message; without a listener it counts as invalid. */
    onForeign(listener: (value: Record<string, unknown>) => void): () => void {
        this.foreignListeners.add(listener);
        return () => this.foreignListeners.delete(listener);
    }

    onInvalidLine(listener: (line: string) => void): () => void {
        this.invalidLineListeners.add(listener);
        return () => this.invalidLineListeners.delete(listener);
    }

    setRequestHandler(handler: JsonRpcRequestHandler): void {
        this.requestHandler = handler;
    }

    /** Feeds one line the peer wrote. */
    receiveLine(line: string): void {
        if (line.trim().length === 0) {
            return;
        }
        const message = parseJsonRpcLine(line);
        if (!message || (message.kind === 'foreign' && this.foreignListeners.size === 0)) {
            this.invalid(line);
            return;
        }
        switch (message.kind) {
            case 'foreign':
                for (const listener of this.foreignListeners) {
                    listener({ ...message.value });
                }
                return;
            case 'notification':
                for (const listener of this.listeners) {
                    listener(message.method, message.params);
                }
                return;
            case 'request':
                void this.answer(message.id, message.method, message.params);
                return;
            case 'result':
                this.settle(message.id, line, (pending) => pending.resolve(message.result));
                return;
            case 'error':
                if (message.id !== null) {
                    this.settle(message.id, line, (pending) =>
                        pending.reject(new JsonRpcRequestError(pending.method, message.error))
                    );
                }
                return;
        }
    }

    /** Fails every waiting request; later calls fail fast with the same reason. */
    close(reason: Error): void {
        if (this.closeReason) {
            return;
        }
        this.closeReason = reason;
        for (const [id, pending] of this.pending) {
            this.pending.delete(id);
            pending.reject(this.closedError(pending.method));
        }
    }

    private invalid(line: string) {
        for (const listener of this.invalidLineListeners) {
            listener(line);
        }
    }

    private settle(id: JsonRpcId, line: string, settle: (pending: Pending) => void): void {
        const pending = this.pending.get(id);
        if (!pending) {
            // An answer to nothing this client asked (or already abandoned).
            this.invalid(line);
            return;
        }
        this.pending.delete(id);
        settle(pending);
    }

    private async answer(id: JsonRpcId, method: string, params: unknown): Promise<void> {
        let line: string;
        try {
            line = encodeResult(id, (await this.requestHandler(method, params)) ?? null);
        } catch (error) {
            line = encodeError(
                id,
                error instanceof JsonRpcHandlerError
                    ? error.body
                    : { code: -32_603, message: error instanceof Error ? error.message : 'Failed' }
            );
        }
        if (this.closeReason) {
            return;
        }
        // A reply the closed peer can no longer read has nowhere to go; the close owns the error.
        await this.transport.write(line).catch(() => undefined);
    }

    private closedError(method: string): JsonRpcConnectionClosedError {
        const reason = this.closeReason ?? new Error('closed');
        return new JsonRpcConnectionClosedError(`${method} failed: ${reason.message}`, {
            cause: reason,
        });
    }
}
