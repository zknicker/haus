import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import type { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import {
    type ClaudeCommandLifecycle,
    type ClaudeControlRequest,
    type ParsedClaudeLine,
    parseClaudeLine,
} from './claude-messages.ts';
import type { ClaudeExit, ClaudeProcess } from './claude-process.ts';
import { claudeToolGate } from './claude-tool-gate.ts';

/** How long a new process may take to answer the `initialize` handshake. */
const initializeTimeoutMs = 30_000;

const initializeResponseSchema = z.looseObject({ claude_code_version: z.string().optional() });

/** Receives one turn's share of the stream; the connection outlives every turn. */
export interface TurnSink {
    /** False once the turn is finishing: later lines belong to whatever runs next. */
    readonly accepting: boolean;
    onExit(exit: ClaudeExit): void;
    onLifecycle(message: ClaudeCommandLifecycle): void;
    onLine(line: ParsedClaudeLine): void;
    /** A stdout line that is not a message the driver can read. */
    onUnreadable(nativeType: string): void;
}

interface PendingControl {
    reject(error: Error): void;
    resolve(response: unknown): void;
}

/**
 * One live `claude` process, its event normalizer (which carries session-scoped evidence across
 * turns), and the conversation id it is writing. Lines no turn holds are dropped.
 */
export class ClaudeConnection {
    private readonly controls = new Map<string, PendingControl>();
    private sink: TurnSink | null = null;
    /** The CLI advertises queued-message lifecycle receipts (`msg_lifecycle_v1`) in `init`. */
    supportsLifecycle = true;

    constructor(
        readonly process: ClaudeProcess,
        readonly normalizer: ClaudeEventNormalizer,
        public sessionId: string,
        private readonly gate = claudeToolGate(undefined)
    ) {
        process.onLine((line) => this.dispatch(line));
        void process.exited.then((exit) => {
            for (const pending of this.controls.values()) {
                pending.reject(new Error('Claude Code exited before answering a control request.'));
            }
            this.controls.clear();
            this.sink?.onExit(exit);
        });
    }

    get alive(): boolean {
        return this.process.alive;
    }

    /**
     * The SDK handshake. `perTaskStopAffordance` makes an interrupt stop only the turn: Claude
     * Code otherwise kills every background task on interrupt. Haus ends background work by
     * ending the process. Resolves with the version the CLI reports (2.1.317+), when it reports
     * one.
     */
    async initialize(): Promise<string | undefined> {
        const response = await this.control(
            { perTaskStopAffordance: true, subtype: 'initialize' },
            initializeTimeoutMs
        );
        return initializeResponseSchema.safeParse(response).data?.claude_code_version;
    }

    attach(sink: TurnSink): () => void {
        this.sink = sink;
        return () => {
            if (this.sink === sink) {
                this.sink = null;
            }
        };
    }

    /** Writes one user message; `next` queues it at the running turn's next safe boundary. */
    sendUser(text: string, options: { priority?: 'next'; uuid: string }): Promise<void> {
        return this.process.write(
            JSON.stringify({
                message: { content: [{ text, type: 'text' }], role: 'user' },
                parent_tool_use_id: null,
                type: 'user',
                uuid: options.uuid,
                ...(options.priority ? { priority: options.priority } : {}),
            })
        );
    }

    /** Sends a control request and resolves with its response payload. */
    async control(request: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
        const requestId = randomUUID();
        const answered = new Promise<unknown>((resolve, reject) => {
            this.controls.set(requestId, { reject, resolve });
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`Claude Code did not answer ${String(request.subtype)}.`)),
                timeoutMs
            );
        });
        try {
            await this.process.write(
                JSON.stringify({ request, request_id: requestId, type: 'control_request' })
            );
            return await Promise.race([answered, timeout]);
        } finally {
            clearTimeout(timer);
            this.controls.delete(requestId);
        }
    }

    stop(): Promise<void> {
        return this.process.stop();
    }

    private async answerTool(request: ClaudeControlRequest) {
        const decision = await this.gate(request.request);
        await this.process
            .write(
                JSON.stringify({
                    response: {
                        request_id: request.request_id,
                        response: decision,
                        subtype: 'success',
                    },
                    type: 'control_response',
                })
            )
            .catch(() => this.process.stop());
    }

    private dispatch(line: string) {
        // A finishing turn takes nothing more; what follows is idle traffic or the next turn's.
        const sink = this.sink?.accepting ? this.sink : null;
        const parsed = parseClaudeLine(line);
        if (!parsed) {
            sink?.onUnreadable('stdout');
            return;
        }
        if ('invalid' in parsed) {
            sink?.onUnreadable(`invalid:${parsed.invalid}`);
            return;
        }
        if (parsed.sessionId) {
            this.sessionId = parsed.sessionId;
        }
        const { message } = parsed;
        if (message.kind === 'system' && message.message.subtype === 'init') {
            this.supportsLifecycle =
                message.message.capabilities?.includes('msg_lifecycle_v1') ?? false;
        }
        if (message.kind === 'control-response') {
            const response = message.message.response;
            const pending = this.controls.get(response.request_id);
            if (response.subtype === 'success') {
                pending?.resolve(response.response);
            } else {
                pending?.reject(
                    new Error(response.error ?? 'Claude Code refused a control request.')
                );
            }
        }
        if (
            message.kind === 'control-request' &&
            message.message.request.subtype === 'can_use_tool'
        ) {
            void this.answerTool(message.message);
        }
        if (message.kind === 'lifecycle') {
            sink?.onLifecycle(message.message);
        }
        sink?.onLine(parsed);
    }
}
