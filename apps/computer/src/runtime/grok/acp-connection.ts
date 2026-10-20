import {
    AcpConnectionClosedError,
    AcpRequestError,
    encodeError,
    encodeNotification,
    encodeRequest,
    encodeResult,
    type JsonRpcErrorBody,
    type JsonRpcId,
    jsonRpcMethodNotFound,
    parseJsonRpcLine,
} from './json-rpc.ts';

/** Writes one encoded line to the agent; resolves once the bytes are accepted. */
export interface AcpTransport {
    write(line: string): Promise<void>;
}

/** Answers an agent → client request; throw `AcpHandlerError` for a JSON-RPC error reply. */
export type AcpRequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown;

export type AcpNotificationListener = (method: string, params: unknown) => void;

/** An error the client returns to the agent for one of its requests. */
export class AcpHandlerError extends Error {
    constructor(readonly body: JsonRpcErrorBody) {
        super(body.message);
        this.name = 'AcpHandlerError';
    }
}

interface Pending {
    readonly method: string;
    readonly reject: (error: unknown) => void;
    readonly resolve: (value: unknown) => void;
}

/**
 * The client side of one ACP JSON-RPC stream: request/response correlation, notifications,
 * agent → client requests, and one close that fails every request still waiting.
 */
export class AcpConnection {
    private nextId = 1;
    private readonly pending = new Map<JsonRpcId, Pending>();
    private readonly listeners = new Set<AcpNotificationListener>();
    private readonly invalidLineListeners = new Set<(line: string) => void>();
    private requestHandler: AcpRequestHandler = () => {
        throw new AcpHandlerError({ code: jsonRpcMethodNotFound, message: 'Method not found' });
    };
    private closeReason: Error | null = null;

    constructor(private readonly transport: AcpTransport) {}

    get closed(): Error | null {
        return this.closeReason;
    }

    /** Sends a request; a local abort stops waiting (the agent's late answer is dropped). */
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
                reject(error);
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

    onNotification(listener: AcpNotificationListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    onInvalidLine(listener: (line: string) => void): () => void {
        this.invalidLineListeners.add(listener);
        return () => this.invalidLineListeners.delete(listener);
    }

    setRequestHandler(handler: AcpRequestHandler): void {
        this.requestHandler = handler;
    }

    /** Feeds one line the agent wrote. */
    receiveLine(line: string): void {
        if (line.trim().length === 0) {
            return;
        }
        const message = parseJsonRpcLine(line);
        if (!message) {
            for (const listener of this.invalidLineListeners) {
                listener(line);
            }
            return;
        }
        switch (message.kind) {
            case 'notification':
                for (const listener of this.listeners) {
                    listener(message.method, message.params);
                }
                return;
            case 'request':
                void this.answer(message.id, message.method, message.params);
                return;
            case 'result':
                this.settle(message.id, (pending) => pending.resolve(message.result));
                return;
            case 'error':
                if (message.id !== null) {
                    this.settle(message.id, (pending) =>
                        pending.reject(new AcpRequestError(pending.method, message.error))
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

    private settle(id: JsonRpcId, settle: (pending: Pending) => void): void {
        const pending = this.pending.get(id);
        if (pending) {
            this.pending.delete(id);
            settle(pending);
        }
    }

    private async answer(id: JsonRpcId, method: string, params: unknown): Promise<void> {
        let line: string;
        try {
            line = encodeResult(id, (await this.requestHandler(method, params)) ?? null);
        } catch (error) {
            line = encodeError(
                id,
                error instanceof AcpHandlerError
                    ? error.body
                    : { code: -32_603, message: error instanceof Error ? error.message : 'Failed' }
            );
        }
        if (this.closeReason) {
            return;
        }
        // A reply the closed agent can no longer read has nowhere to go; the close owns the error.
        await this.transport.write(line).catch(() => undefined);
    }

    private closedError(method: string): AcpConnectionClosedError {
        const reason = this.closeReason ?? new Error('closed');
        return new AcpConnectionClosedError(`${method} failed: ${reason.message}`, {
            cause: reason,
        });
    }
}
