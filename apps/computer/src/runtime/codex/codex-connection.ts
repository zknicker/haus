import { JsonRpcConnection, type JsonRpcRequestHandler } from '../json-rpc-connection.ts';
import type { CodexExit, CodexTransport } from './codex-transport.ts';

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

/** What the app-server says unprompted: notifications, and its own non-JSON-RPC JSON lines. */
export type CodexInbound =
    | { readonly kind: 'foreign'; readonly value: Readonly<Record<string, unknown>> }
    | { readonly kind: 'notification'; readonly method: string; readonly params: unknown };

/**
 * The shared JSON-RPC connection bound to one app-server transport: the transport's lines feed
 * it, and the process exit closes it with Codex's exit status and stderr. Notifications and
 * foreign JSON lines reach one listener in arrival order.
 */
export class CodexConnection {
    private readonly rpc: JsonRpcConnection;
    private listener: ((message: CodexInbound) => void) | null = null;
    private exit: CodexProcessExitedError | null = null;

    constructor(
        private readonly transport: CodexTransport,
        answer: JsonRpcRequestHandler,
        onInvalidLine: (line: string) => void
    ) {
        this.rpc = new JsonRpcConnection(transport);
        this.rpc.setRequestHandler(answer);
        this.rpc.onInvalidLine(onInvalidLine);
        this.rpc.onNotification((method, params) =>
            this.listener?.({ kind: 'notification', method, params })
        );
        this.rpc.onForeign((value) => this.listener?.({ kind: 'foreign', value }));
        transport.onLine((line) => this.rpc.receiveLine(line));
        void transport.exited.then((exit) => {
            this.exit = new CodexProcessExitedError(exit, transport.stderrTail());
            this.rpc.close(this.exit);
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

    request(method: string, params: unknown, options: { signal?: AbortSignal } = {}) {
        return this.rpc.request(method, params, options);
    }

    notify(method: string, params: unknown): Promise<void> {
        return this.rpc.notify(method, params);
    }

    close(): Promise<void> {
        return this.transport.kill();
    }
}
