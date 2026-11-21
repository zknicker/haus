import { mkdir } from 'node:fs/promises';
import {
    type Options,
    type Query,
    query,
    type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { ModelConnectionCapacityWindow } from '@haus/api';
import { EventQueue } from '../turn/event-queue.ts';
import { ClaudeBackgroundTasks } from './claude-background-tasks.ts';
import { claudeCapacityWindows } from './claude-capacity.ts';
import { runClaudeCompaction } from './claude-compaction.ts';
import { ClaudeSessionEndedError, claudeResumeRejection } from './claude-errors.ts';
import { ClaudeIdleActivity } from './claude-idle-activity.ts';
import {
    type ClaudeCommandLifecycle,
    type ParsedClaudeMessage,
    parseClaudeMessage,
} from './claude-messages.ts';
import { ClaudeNormalizer } from './claude-normalizer.ts';
import { createHausMcpServer, HausToolBinding } from './haus-tools.ts';
import type { IdleCompactable, IdleCompactionOwner } from './idle-compaction.ts';

export interface TurnSink {
    readonly accepting: boolean;
    onEnded(error: unknown): void;
    onLifecycle(message: ClaudeCommandLifecycle): void;
    onMessage(message: ParsedClaudeMessage): void;
}

export type CapacitySink = (windows: readonly ModelConnectionCapacityWindow[]) => void;

const initializeTimeoutMs = 30_000;
const stderrTailLines = 20;

export class ClaudeConnection implements IdleCompactable {
    readonly binding = new HausToolBinding();
    private readonly tasks = new ClaudeBackgroundTasks();
    readonly idleActivity: ClaudeIdleActivity;
    readonly modelId: string;
    readonly normalizer: ClaudeNormalizer;
    private readonly input = new EventQueue<SDKUserMessage>();
    private readonly query: Query;
    private readonly stderrTail: string[] = [];
    private sink: TurnSink | null = null;
    private endedWith: { error: unknown } | null = null;
    readonly ended: Promise<void>;
    initTools: readonly string[] = [];
    owner: IdleCompactionOwner | null = null;
    sessionId: string;

    private constructor(
        options: Options,
        readonly launchKey: string,
        sessionId: string,
        minTokens: number,
        private readonly onCapacity: CapacitySink | undefined
    ) {
        this.sessionId = sessionId;
        this.modelId = options.model ?? '';
        this.idleActivity = new ClaudeIdleActivity(minTokens);
        this.normalizer = new ClaudeNormalizer({
            invocations: this.binding.invocations,
            newId: () => crypto.randomUUID(),
            now: () => Date.now(),
        });
        this.query = query({
            options: {
                ...options,
                mcpServers: { haus: createHausMcpServer(this.binding) },
                stderr: (data) => this.recordStderr(data),
            },
            prompt: this.input,
        });
        this.ended = this.pump();
    }

    static async open(input: {
        launchKey: string;
        minTokens: number;
        onCapacity?: CapacitySink;
        options: Options;
        sessionId: string;
    }) {
        if (input.options.cwd) {
            await mkdir(input.options.cwd, { mode: 0o700, recursive: true });
        }
        const connection = new ClaudeConnection(
            input.options,
            input.launchKey,
            input.sessionId,
            input.minTokens,
            input.onCapacity
        );
        try {
            await connection.initialize();
        } catch (error) {
            connection.close();
            throw claudeResumeRejection(connection.stderrText(error)) ?? error;
        }
        return connection;
    }

    get alive() {
        return this.endedWith === null;
    }

    attach(sink: TurnSink) {
        this.sink = sink;
        if (this.endedWith) {
            sink.onEnded(this.endedWith.error);
        }
        return () => {
            if (this.sink === sink) {
                this.sink = null;
            }
        };
    }

    sendUser(text: string, options: { priority?: 'next'; uuid: string }) {
        if (!this.alive) {
            throw new ClaudeSessionEndedError(this.endedWith?.error);
        }
        this.input.push({
            message: { content: [{ text, type: 'text' }], role: 'user' },
            parent_tool_use_id: null,
            type: 'user',
            uuid: options.uuid as SDKUserMessage['uuid'] & string,
            ...(options.priority ? { priority: options.priority } : {}),
        });
    }

    async interrupt() {
        const receipt = await this.query.interrupt();
        return receipt?.still_queued ?? [];
    }

    get holdsBackgroundWork() {
        return this.alive && this.tasks.running;
    }

    close() {
        this.input.end();
        this.query.close();
    }

    compact() {
        return runClaudeCompaction(this);
    }

    idleCompactionSnapshot() {
        return this.owner ? this.idleActivity.snapshot() : null;
    }

    private async initialize() {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error('The Claude Agent SDK did not initialize.')),
                initializeTimeoutMs
            );
        });
        const ended = this.ended.then(() => {
            throw new ClaudeSessionEndedError(this.endedWith?.error);
        });
        ended.catch(() => undefined);
        try {
            await Promise.race([this.query.initializationResult(), ended, timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    private async pump() {
        let failure: unknown = new Error('The Claude Agent SDK stream ended.');
        try {
            for await (const message of this.query) {
                this.dispatch(parseClaudeMessage(message));
            }
        } catch (error) {
            failure = error;
        }
        this.endedWith = { error: new Error(this.stderrText(failure), { cause: failure }) };
        this.tasks.clear();
        this.input.end();
        this.sink?.onEnded(this.endedWith.error);
    }

    private dispatch(parsed: ParsedClaudeMessage) {
        this.idleActivity.observe(parsed);
        if (parsed.message.kind === 'system') {
            this.tasks.apply(parsed.message.message);
        }
        if (parsed.message.kind === 'rate-limit') {
            const windows = claudeCapacityWindows(parsed.message.message.rate_limit_info);
            if (windows.length > 0) {
                this.onCapacity?.(windows);
            }
        }
        if (parsed.sessionId) {
            this.sessionId = parsed.sessionId;
        }
        if (parsed.message.kind === 'system' && parsed.message.message.tools) {
            this.initTools = parsed.message.message.tools;
        }
        const sink = this.sink?.accepting ? this.sink : null;
        if (parsed.message.kind === 'lifecycle') {
            sink?.onLifecycle(parsed.message.message);
        }
        sink?.onMessage(parsed);
    }

    private recordStderr(data: string) {
        this.stderrTail.push(...data.split('\n').filter((line) => line.trim()));
        this.stderrTail.splice(0, Math.max(0, this.stderrTail.length - stderrTailLines));
    }

    private stderrText(error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return [message, ...this.stderrTail].join('\n');
    }
}
