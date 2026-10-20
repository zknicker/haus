import type { CodexExit, CodexTransport } from './codex-transport.ts';
import { type CodexRequestId, type CodexWireMessage, classifyWireMessage } from './protocol.ts';

/** A JSON-RPC error the app-server answered a request with. */
export class CodexRpcError extends Error {
    readonly code: number | undefined;
    readonly data: unknown;
    readonly method: string;

    constructor(method: string, error: { code?: number; data?: unknown; message?: string }) {
        super(error.message || `Codex app-server request ${method} failed.`);
        this.name = 'CodexRpcError';
        this.code = error.code;
        this.data = error.data;
        this.method = method;
    }
}

/** The app-server exited; every pending request and running turn fails with this. */
export class CodexProcessExitedError extends Error {
    constructor(exit: CodexExit, stderrTail: string) {
        const how = exit.signal ? `signal ${exit.signal}` : `exit code ${exit.code ?? 'unknown'}`;
        super(
            `The Codex app-server exited (${how}).${stderrTail ? ` stderr: ${stderrTail.slice(-2000)}` : ''}`
        );
        this.name = 'CodexProcessExitedError';
    }
}

export type CodexInbound = Extract<CodexWireMessage, { kind: 'foreign' | 'notification' }>;

/** Answers one app-server request; a thrown error becomes a JSON-RPC error response. */
export type CodexServerRequestHandler = (method: string, params: unknown) => unknown;

/**
 * JSON-RPC over one app-server transport: client requests correlate to responses by id, and
 * notifications plus foreign JSON lines go to one listener in arrival order.
 */
export class CodexConnection {
    private readonly pending = new Map<CodexRequestId, PendingRequest>();
    private listener: ((message: CodexInbound) => void) | null = null;
    private nextId = 1;
    private exit: CodexProcessExitedError | null = null;

    constructor(
        private readonly transport: CodexTransport,
        private readonly answer: CodexServerRequestHandler,
        private readonly onInvalidLine: (line: string) => void
    ) {
        transport.onLine((line) => this.receive(line));
        void transport.exited.then((exit) => {
            this.exit = new CodexProcessExitedError(exit, transport.stderrTail());
            for (const request of this.pending.values()) {
                request.reject(this.exit);
            }
            this.pending.clear();
        });
    }

    get exited(): Promise<CodexProcessExitedError> {
        return this.transport.exited.then(
            () => this.exit ?? new CodexProcessExitedError({ code: null, signal: null }, '')
        );
    }

    get alive(): boolean {
        return this.exit === null;
    }

    listen(listener: (message: CodexInbound) => void): void {
        this.listener = listener;
    }

    async request(method: string, params: unknown): Promise<unknown> {
        if (this.exit) {
            throw this.exit;
        }
        const id = this.nextId++;
        const response = new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, { method, reject, resolve });
        });
        try {
            await this.transport.write(JSON.stringify({ id, jsonrpc: '2.0', method, params }));
        } catch (error) {
            this.pending.delete(id);
            throw this.exit ?? error;
        }
        return await response;
    }

    async notify(method: string, params: unknown): Promise<void> {
        if (this.exit) {
            throw this.exit;
        }
        await this.transport.write(JSON.stringify({ jsonrpc: '2.0', method, params }));
    }

    close(): Promise<void> {
        return this.transport.kill();
    }

    private receive(line: string) {
        let value: unknown;
        try {
            value = JSON.parse(line);
        } catch {
            this.onInvalidLine(line);
            return;
        }
        const message = classifyWireMessage(value);
        if (!message) {
            this.onInvalidLine(line);
            return;
        }
        switch (message.kind) {
            case 'response':
            case 'error-response':
                this.settle(message);
                return;
            case 'server-request':
                void this.respond(message.id, message.method, message.params);
                return;
            default:
                this.listener?.(message);
        }
    }

    private settle(message: Extract<CodexWireMessage, { kind: 'error-response' | 'response' }>) {
        const request = this.pending.get(message.id);
        if (!request) {
            this.onInvalidLine(JSON.stringify(message));
            return;
        }
        this.pending.delete(message.id);
        if (message.kind === 'response') {
            request.resolve(message.result);
        } else {
            request.reject(new CodexRpcError(request.method, message.error));
        }
    }

    private async respond(id: CodexRequestId, method: string, params: unknown) {
        let reply: Record<string, unknown>;
        try {
            reply = { id, jsonrpc: '2.0', result: await this.answer(method, params) };
        } catch (error) {
            reply = {
                error: {
                    code: -32_601,
                    message: error instanceof Error ? error.message : String(error),
                },
                id,
                jsonrpc: '2.0',
            };
        }
        // A reply to an exited app-server has nowhere to go; the exit already failed the turn.
        await this.transport.write(JSON.stringify(reply)).catch(() => undefined);
    }
}

interface PendingRequest {
    method: string;
    reject: (error: unknown) => void;
    resolve: (value: unknown) => void;
}
