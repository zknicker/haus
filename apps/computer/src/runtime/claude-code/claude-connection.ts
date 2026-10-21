import { randomUUID } from 'node:crypto';
import type { HostToolSession } from '../../host-tools/mcp-server.ts';
import { type BackgroundWork, noBackgroundWork } from '../background-work.ts';
import type { WarmProcess } from '../warm-pool.ts';
import { ClaudeBackgroundTasks, SelfStartedTurns } from './claude-background.ts';
import type { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import {
    type ClaudeCommandLifecycle,
    type ParsedClaudeLine,
    parseClaudeLine,
} from './claude-messages.ts';
import type { ClaudeExit, ClaudeProcess } from './claude-process.ts';

/** How long a new process may take to answer the `initialize` handshake. */
const initializeTimeoutMs = 30_000;

/** Where the connection reports work that outlives a turn (the daemon's listener, bound). */
export interface ClaudeBackgroundHooks {
    changed(work: BackgroundWork): void;
    wake(): void;
}

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
 * One live `claude` process and the Haus state bound to it: its host-tool scope, the event
 * normalizer (which carries session-scoped evidence across turns), the launch key a warm reuse
 * must match, and the conversation id it is writing. Between Haus turns it still reads the
 * stream: background tasks keep reporting, and Claude Code may start a turn of its own to report
 * one that finished (specs/runtime-drivers.md "Background work").
 */
export class ClaudeConnection implements WarmProcess {
    private readonly controls = new Map<string, PendingControl>();
    private readonly selfStarted = new SelfStartedTurns();
    private sink: TurnSink | null = null;
    private readonly tasks = new ClaudeBackgroundTasks();
    /** The CLI advertises queued-message lifecycle receipts (`msg_lifecycle_v1`) in `init`. */
    supportsLifecycle = true;

    constructor(
        readonly process: ClaudeProcess,
        readonly normalizer: ClaudeEventNormalizer,
        readonly hostTools: HostToolSession,
        readonly launchKey: string,
        public sessionId: string,
        private readonly background?: ClaudeBackgroundHooks
    ) {
        process.onLine((line) => this.dispatch(line));
        void process.exited.then((exit) => {
            // The host-tool scope lives exactly as long as the process that calls it.
            hostTools.close();
            for (const pending of this.controls.values()) {
                pending.reject(new Error('Claude Code exited before answering a control request.'));
            }
            this.controls.clear();
            this.selfStarted.take();
            if (this.tasks.clear()) {
                this.background?.changed(noBackgroundWork);
            }
            this.sink?.onExit(exit);
        });
    }

    get alive(): boolean {
        return this.process.alive;
    }

    get backgroundWork(): BackgroundWork {
        return this.tasks.work;
    }

    /** Closing now would end a background task or a turn Claude Code started on its own. */
    get holdsBackgroundWork(): boolean {
        return this.process.alive && (this.tasks.work.tasks > 0 || this.selfStarted.running);
    }

    /**
     * The SDK handshake. `perTaskStopAffordance` makes an interrupt stop only the turn: Claude
     * Code otherwise kills every background task on interrupt (it assumes a host with no other
     * way to stop one). Haus ends background work by ending the process (Stop, reset, shutdown).
     */
    async initialize(): Promise<void> {
        await this.control(
            { perTaskStopAffordance: true, subtype: 'initialize' },
            initializeTimeoutMs
        );
    }

    /** The turn Claude Code is running on its own, for a Haus turn to adopt; null when none. */
    adoptSelfStartedTurn(): readonly ParsedClaudeLine[] | null {
        return this.selfStarted.take();
    }

    get exited(): Promise<unknown> {
        return this.process.exited;
    }

    /** Ends the process (as a parked `WarmProcess`). */
    close(): Promise<void> {
        return this.stop();
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
        if (message.kind === 'system' && this.tasks.apply(message.message)) {
            this.background?.changed(this.tasks.work);
        }
        if (message.kind === 'lifecycle') {
            sink?.onLifecycle(message.message);
        }
        if (sink) {
            sink.onLine(parsed);
        } else if (this.selfStarted.observe(parsed)) {
            this.background?.wake();
        }
    }
}
