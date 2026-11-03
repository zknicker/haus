import { randomUUID } from 'node:crypto';
import { claudeSubagentEvents } from '../claude-subagent-events.ts';
import type { TurnEvent } from '../turn-event.ts';
import { ClaudeTurnError } from './claude-errors.ts';
import type {
    ClaudeConversationMessage,
    ClaudeStreamEvent,
    ClaudeSystemMessage,
    ClaudeUsage,
    ParsedClaudeLine,
} from './claude-messages.ts';
import {
    assistantErrorEvent,
    claudeTokenUsage,
    isProviderApiFailureText,
    type RateLimitObservation,
} from './claude-result.ts';
import { createClaudeToolEvents } from './claude-tool-events.ts';

/** HTTP statuses no API retry can repair: the credential or the requested model is wrong. */
const unrecoverableRetryStatuses = new Set([401, 403, 404]);

/**
 * Turns one Claude Code session's stdout messages into turn events (specs/runtime-drivers.md).
 * Every message yields at least one event. Results are classified by the session
 * (`claude-result.ts`), which owns the turn boundary.
 */
export class ClaudeEventNormalizer {
    private readonly blocks = new Map<
        number,
        { id: string; kind: 'other' | 'text' | 'thinking' }
    >();
    private readonly startedTasks = new Set<string>();
    private readonly tools: ReturnType<typeof createClaudeToolEvents>;
    private compaction: Record<string, unknown> | null = null;
    private lastRateLimit: RateLimitObservation | null = null;
    private responseUsage: ClaudeUsage | null = null;
    private session: string | undefined;
    /** Per turn: an assistant message already reported this turn's API error (Raft #379). */
    apiErrorReported = false;
    /** Per turn: the last SDK error text seen on the Agent's own messages (bridge). */
    observedError: string | undefined;

    constructor(
        private readonly options: {
            hostServer: string;
            now?: () => number;
            strip: (value: unknown) => unknown;
        }
    ) {
        this.tools = createClaudeToolEvents(options);
    }

    beginTurn(): void {
        this.apiErrorReported = false;
        this.observedError = undefined;
        this.blocks.clear();
        this.responseUsage = null;
    }

    normalize(line: ParsedClaudeLine): TurnEvent[] {
        if (line.sessionId && line.sessionId !== this.session) {
            // Rate-limit evidence belongs to one session; another must not inherit it.
            this.session = line.sessionId;
            this.lastRateLimit = null;
        }
        const { message } = line;
        const events = this.flushCompaction(message);
        switch (message.kind) {
            case 'conversation':
                events.push(...this.conversation(message.message, line.raw));
                break;
            case 'rate-limit': {
                const info = message.message.rate_limit_info;
                if (info?.status) {
                    this.lastRateLimit = { resetsAtSec: info.resetsAt, status: info.status };
                }
                break;
            }
            case 'stream':
                events.push(...this.stream(message.message));
                break;
            case 'system':
                events.push(...this.system(message.message, line.raw));
                break;
            default:
                break;
        }
        return events.length > 0 ? events : [progress(nativeType(line))];
    }

    private conversation(message: ClaudeConversationMessage, raw: Record<string, unknown>) {
        if (message.parent_tool_use_id) {
            // A sub-agent's own message: journal evidence only, and its errors are its own.
            return claudeSubagentEvents(raw);
        }
        const content = message.message.content;
        if (typeof content === 'string') {
            return message.type === 'user' && message.isSynthetic && this.compaction
                ? this.compactionEvents(content)
                : [];
        }
        if (message.type === 'user') {
            const results = content.filter((block) => block.type === 'tool_result');
            const structured = results.length === 1 ? message.tool_use_result : undefined;
            return results.flatMap((block) => this.tools.result(block, structured) ?? []);
        }
        const hasToolUse = content.some((block) => block.type === 'tool_use');
        return content.flatMap((block): TurnEvent[] => {
            if (block.type === 'tool_use') {
                const call = this.tools.call(block);
                return call ? [call] : [];
            }
            // Text already streamed as deltas; only a CLI-written notice is read here.
            return block.type === 'text' && block.text && !hasToolUse
                ? this.assistantNotice(block.text, message.error ?? undefined)
                : [];
        });
    }

    /** Raft #379: a message with the SDK `error` field, or a bare `API Error:` notice. */
    private assistantNotice(text: string, sdkError: string | undefined): TurnEvent[] {
        if (sdkError) {
            this.observedError = text;
            this.apiErrorReported = true;
            return [
                assistantErrorEvent({
                    lastRateLimit: this.lastRateLimit,
                    now: this.options.now?.() ?? Date.now(),
                    sdkError,
                    text,
                }),
            ];
        }
        return isProviderApiFailureText(text)
            ? [{ error: new ClaudeTurnError(text), type: 'error' }]
            : [];
    }

    private stream(message: ClaudeStreamEvent): TurnEvent[] {
        if (message.parent_tool_use_id) {
            return [];
        }
        const { event } = message;
        switch (event.type) {
            case 'message_start':
                this.responseUsage = event.message?.usage ?? null;
                return [];
            case 'message_delta':
                this.responseUsage = mergeUsage(this.responseUsage, event.usage);
                return [];
            case 'message_stop': {
                const usage = claudeTokenUsage(this.responseUsage);
                this.responseUsage = null;
                return [{ contextTokens: usage?.inputTokens ?? null, type: 'step-finish', usage }];
            }
            default:
                return this.contentBlock(event);
        }
    }

    private contentBlock(event: ClaudeStreamEvent['event']): TurnEvent[] {
        if (event.index === undefined) {
            return [];
        }
        if (event.type === 'content_block_start') {
            const kind =
                event.content_block?.type === 'thinking'
                    ? 'thinking'
                    : event.content_block?.type === 'text'
                      ? 'text'
                      : 'other';
            const id = randomUUID();
            this.blocks.set(event.index, { id, kind });
            return kind === 'thinking' ? [{ id, type: 'reasoning-start' }] : [];
        }
        const block = this.blocks.get(event.index);
        if (!block) {
            return [];
        }
        if (event.type === 'content_block_stop') {
            this.blocks.delete(event.index);
            return block.kind === 'thinking' ? [{ id: block.id, type: 'reasoning-end' }] : [];
        }
        const delta = event.delta;
        if (block.kind === 'text' && delta?.type === 'text_delta' && delta.text) {
            return [{ id: block.id, text: delta.text, type: 'text-delta' }];
        }
        if (block.kind === 'thinking' && delta?.type === 'thinking_delta' && delta.thinking) {
            return [{ id: block.id, text: delta.thinking, type: 'reasoning-delta' }];
        }
        return [];
    }

    private system(message: ClaudeSystemMessage, raw: Record<string, unknown>): TurnEvent[] {
        switch (message.subtype) {
            case 'api_retry':
                return this.apiRetry(message);
            case 'compact_boundary':
                this.compaction = {
                    trigger: message.compact_metadata?.trigger,
                    ...(message.compact_metadata?.pre_tokens === undefined
                        ? {}
                        : { tokensBefore: message.compact_metadata.pre_tokens }),
                    ...(message.compact_metadata?.post_tokens === undefined
                        ? {}
                        : { tokensAfter: message.compact_metadata.post_tokens }),
                };
                return [];
            case 'task_started':
                if (message.task_id) {
                    this.startedTasks.add(message.task_id);
                }
                return claudeSubagentEvents(raw);
            case 'task_updated': {
                const patch = message.patch;
                // A failed sub-agent is ordinary activity; only an unannounced task ends the turn.
                if (
                    patch?.status === 'failed' &&
                    patch.error &&
                    !(message.task_id && this.startedTasks.has(message.task_id))
                ) {
                    return [{ error: new ClaudeTurnError(patch.error), type: 'error' }];
                }
                return claudeSubagentEvents(raw);
            }
            default:
                return claudeSubagentEvents(raw);
        }
    }

    private apiRetry(message: ClaudeSystemMessage): TurnEvent[] {
        const status = message.error_status;
        if (typeof status !== 'number' || !unrecoverableRetryStatuses.has(status)) {
            return [];
        }
        const title = `HTTP ${status}: ${message.error ?? 'provider request failed'}`;
        return status === 404
            ? [{ error: new ClaudeTurnError(title), type: 'error' }]
            : [{ category: 'access', severity: 'error', title, type: 'session-failure' }];
    }

    /** A compaction with no summary message following it still reports, without the summary. */
    private flushCompaction(message: ParsedClaudeLine['message']): TurnEvent[] {
        const summaryMayFollow =
            message.kind === 'conversation' &&
            message.message.type === 'user' &&
            typeof message.message.message.content === 'string';
        return this.compaction && !summaryMayFollow ? this.compactionEvents(undefined) : [];
    }

    /** The harness's synthetic `compaction` tool pair, which Activity skips and the journal keeps. */
    private compactionEvents(summary: string | undefined): TurnEvent[] {
        const output = { ...this.compaction, ...(summary === undefined ? {} : { summary }) };
        this.compaction = null;
        const facts = {
            dynamic: true,
            providerExecuted: true,
            toolCallId: `claude-compaction-${randomUUID()}`,
            toolName: 'compaction',
        } as const;
        return [
            { ...facts, input: {}, type: 'tool-call' },
            { ...facts, output, type: 'tool-result' },
        ];
    }
}

function mergeUsage(current: ClaudeUsage | null, next: ClaudeUsage | null | undefined) {
    if (!next) {
        return current;
    }
    const merged: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(next)) {
        if (value !== null && value !== undefined) {
            merged[key] = value;
        }
    }
    return merged as ClaudeUsage;
}

function progress(nativeType: string): TurnEvent {
    return { nativeType, type: 'progress' };
}

function nativeType(line: ParsedClaudeLine): string {
    const { message } = line;
    if (message.kind === 'other') {
        return message.nativeType;
    }
    const type = typeof line.raw.type === 'string' ? line.raw.type : message.kind;
    const subtype =
        message.kind === 'system'
            ? message.message.subtype
            : message.kind === 'stream'
              ? message.message.event.type
              : undefined;
    return subtype ? `${type}:${subtype}` : type;
}
