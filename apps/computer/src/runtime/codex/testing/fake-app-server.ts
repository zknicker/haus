import type { CodexExit, CodexTransport } from '../codex-transport.ts';

/** Request params as tests read them; `config` is the thread config object. */
type FakeParams = Record<string, unknown> & { config?: Record<string, unknown> };

type Message = Record<string, unknown> & {
    id?: number | string;
    method?: string;
    params: FakeParams;
};

/** A scripted answer: a result, a JSON-RPC error, or `hold` to answer later via `reply`. */
export type FakeAnswer =
    | { error: { code?: number; message: string } }
    | { result: unknown }
    | 'hold';

/**
 * An in-process app-server for unit tests. It answers the handshake, thread, and turn requests
 * the driver sends (overridable per method), records every write, and lets a test emit any
 * notification, server request, or raw line, or exit as a crash would.
 */
export class FakeAppServer implements CodexTransport {
    readonly written: Message[] = [];
    readonly replies: Message[] = [];
    private readonly listeners: Array<(line: string) => void> = [];
    private readonly exit = Promise.withResolvers<CodexExit>();
    private readonly held = new Map<string, Message>();
    private turns = 0;

    constructor(
        private readonly answers: Partial<Record<string, (params: FakeParams) => FakeAnswer>> = {},
        readonly threadId = 'thread-1'
    ) {}

    /** The id the fake gave the most recent `turn/start`. */
    get lastTurnId(): string {
        return `turn-${this.turns}`;
    }

    get exited(): Promise<CodexExit> {
        return this.exit.promise;
    }

    onLine(listener: (line: string) => void): void {
        this.listeners.push(listener);
    }

    stderrTail(): string {
        return 'fake stderr';
    }

    async kill(): Promise<void> {
        this.exit.resolve({ code: null, signal: 'SIGTERM' });
        await this.exit.promise;
    }

    crash(code = 1): void {
        this.exit.resolve({ code, signal: null });
    }

    write(line: string): Promise<void> {
        const message = JSON.parse(line) as Message;
        this.written.push(message);
        if (message.method === undefined) {
            this.replies.push(message);
            return Promise.resolve();
        }
        if (message.id !== undefined) {
            const answer = this.answers[message.method]?.(message.params) ?? this.answer(message);
            if (answer === 'hold') {
                this.held.set(message.method, message);
            } else {
                queueMicrotask(() => this.emit({ id: message.id, ...answer }));
            }
        }
        return Promise.resolve();
    }

    /** Answers a held request. */
    reply(method: string, answer: Exclude<FakeAnswer, 'hold'>): void {
        const request = this.held.get(method);
        if (!request) {
            throw new Error(`No held ${method} request.`);
        }
        this.held.delete(method);
        this.emit({ id: request.id, ...answer });
    }

    emit(message: Record<string, unknown>): void {
        this.raw(JSON.stringify({ jsonrpc: '2.0', ...message }));
    }

    notify(method: string, params: Record<string, unknown>): void {
        this.emit({ method, params: { threadId: this.threadId, ...params } });
    }

    raw(line: string): void {
        for (const listener of this.listeners) {
            listener(line);
        }
    }

    methods(): string[] {
        return this.written.flatMap((message) => (message.method ? [message.method] : []));
    }

    request(method: string): Message | undefined {
        return this.written.find((message) => message.method === method);
    }

    private answer(message: Message): Exclude<FakeAnswer, 'hold'> {
        switch (message.method) {
            case 'initialize':
                return { result: { codexHome: '/fake/.codex', userAgent: 'codex/0.159.0' } };
            case 'config/read':
                return { result: { config: {}, layers: [] } };
            case 'thread/start':
            case 'thread/resume':
                queueMicrotask(() =>
                    this.notify('mcpServer/startupStatus/updated', {
                        name: 'haus',
                        status: 'ready',
                    })
                );
                return {
                    result: {
                        thread: {
                            id:
                                typeof message.params?.threadId === 'string'
                                    ? message.params.threadId
                                    : this.threadId,
                        },
                    },
                };
            case 'turn/start':
                this.turns += 1;
                return { result: { turn: { id: `turn-${this.turns}`, status: 'inProgress' } } };
            default:
                return { result: {} };
        }
    }
}
