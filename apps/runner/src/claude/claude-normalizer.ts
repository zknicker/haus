import type { InvocationOutcome } from '@haus/api';
import { compactionToolName, type TurnEvent } from '../turn/turn-event.ts';
import { ClaudeTurnError } from './claude-errors.ts';
import type {
    ClaudeConversationMessage,
    ClaudeStreamEvent,
    ClaudeSystemMessage,
    ClaudeUsage,
    ParsedClaudeMessage,
} from './claude-messages.ts';
import {
    assistantErrorEvent,
    claudeTokenUsage,
    isProviderApiFailureText,
    type RateLimitObservation,
} from './claude-result.ts';
import { claudeToolEvents } from './claude-tool-events.ts';

export interface ClaudeNormalizerOptions {
    readonly invocations: ReadonlyMap<string, InvocationOutcome>;
    readonly newId: () => string;
    readonly now: () => number;
}

export class ClaudeNormalizer {
    private readonly blocks = new Map<
        number,
        { id: string; kind: 'other' | 'text' | 'thinking' }
    >();
    private readonly tools: ReturnType<typeof claudeToolEvents>;
    private compaction: Record<string, unknown> | null = null;
    private lastRateLimit: RateLimitObservation | null = null;
    private responseUsage: ClaudeUsage | null = null;
    private session: string | undefined;
    apiErrorReported = false;
    observedError: string | undefined;

    constructor(private readonly options: ClaudeNormalizerOptions) {
        this.tools = claudeToolEvents(options.invocations);
    }

    beginTurn() {
        this.apiErrorReported = false;
        this.observedError = undefined;
        this.blocks.clear();
        this.responseUsage = null;
    }

    normalize(parsed: ParsedClaudeMessage) {
        if (parsed.sessionId && parsed.sessionId !== this.session) {
            this.session = parsed.sessionId;
            this.lastRateLimit = null;
        }
        const { message } = parsed;
        const events = this.flushCompaction(parsed);
        switch (message.kind) {
            case 'conversation':
                events.push(...this.conversation(message.message));
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
                events.push(...this.system(message.message));
                break;
            default:
                break;
        }
        const progress: TurnEvent = { nativeType: nativeType(parsed), type: 'progress' };
        return events.length > 0 ? events : [progress];
    }

    private conversation(message: ClaudeConversationMessage) {
        const events: TurnEvent[] = [];
        if (message.parent_tool_use_id) {
            return events;
        }
        const content = message.message.content;
        if (typeof content === 'string') {
            if (message.type === 'user' && message.isSynthetic && this.compaction) {
                events.push(...this.compactionEvents(content));
            }
            return events;
        }
        if (message.type === 'user') {
            const results = content.filter((block) => block.type === 'tool_result');
            const structured = results.length === 1 ? message.tool_use_result : undefined;
            for (const block of results) {
                events.push(...this.tools.result(block, structured));
            }
            return events;
        }
        const hasToolUse = content.some((block) => block.type === 'tool_use');
        for (const block of content) {
            if (block.type === 'tool_use') {
                events.push(...this.tools.call(block));
            } else if (block.type === 'text' && block.text && !hasToolUse) {
                events.push(...this.assistantNotice(block.text, message.error ?? undefined));
            }
        }
        return events;
    }

    private assistantNotice(text: string, sdkError: string | undefined) {
        const events: TurnEvent[] = [];
        if (sdkError) {
            this.observedError = text;
            this.apiErrorReported = true;
            events.push(
                assistantErrorEvent({
                    lastRateLimit: this.lastRateLimit,
                    now: this.options.now(),
                    sdkError,
                    text,
                })
            );
        } else if (isProviderApiFailureText(text)) {
            events.push({ error: new ClaudeTurnError(text), type: 'error' });
        }
        return events;
    }

    private stream(message: ClaudeStreamEvent) {
        const events: TurnEvent[] = [];
        if (message.parent_tool_use_id) {
            return events;
        }
        const { event } = message;
        if (event.type === 'message_start') {
            this.responseUsage = event.message?.usage ?? null;
        } else if (event.type === 'message_delta') {
            this.responseUsage = mergeUsage(this.responseUsage, event.usage);
        } else if (event.type === 'message_stop') {
            const usage = claudeTokenUsage(this.responseUsage);
            this.responseUsage = null;
            events.push({ contextTokens: usage?.inputTokens ?? null, type: 'step-finish', usage });
        } else {
            events.push(...this.contentBlock(event));
        }
        return events;
    }

    private contentBlock(event: ClaudeStreamEvent['event']) {
        const events: TurnEvent[] = [];
        if (event.index === undefined) {
            return events;
        }
        if (event.type === 'content_block_start') {
            const type = event.content_block?.type;
            const kind = type === 'thinking' || type === 'text' ? type : 'other';
            const id = this.options.newId();
            this.blocks.set(event.index, { id, kind });
            if (kind === 'thinking') {
                events.push({ id, type: 'reasoning-start' });
            }
            return events;
        }
        const block = this.blocks.get(event.index);
        if (!block) {
            return events;
        }
        if (event.type === 'content_block_stop') {
            this.blocks.delete(event.index);
            if (block.kind === 'thinking') {
                events.push({ id: block.id, type: 'reasoning-end' });
            }
            return events;
        }
        const delta = event.delta;
        if (block.kind === 'text' && delta?.type === 'text_delta' && delta.text) {
            events.push({ id: block.id, text: delta.text, type: 'text-delta' });
        }
        if (block.kind === 'thinking' && delta?.type === 'thinking_delta' && delta.thinking) {
            events.push({ id: block.id, text: delta.thinking, type: 'reasoning-delta' });
        }
        return events;
    }

    private system(message: ClaudeSystemMessage) {
        const events: TurnEvent[] = [];
        if (message.subtype === 'compact_boundary') {
            const metadata = message.compact_metadata;
            this.compaction = {
                trigger: metadata?.trigger,
                ...(metadata?.pre_tokens === undefined
                    ? {}
                    : { tokensBefore: metadata.pre_tokens }),
                ...(metadata?.post_tokens === undefined
                    ? {}
                    : { tokensAfter: metadata.post_tokens }),
            };
        }
        const status = message.error_status;
        if (message.subtype === 'api_retry' && typeof status === 'number') {
            const title = `HTTP ${status}: ${message.error ?? 'provider request failed'}`;
            if (status === 404) {
                events.push({ error: new ClaudeTurnError(title), type: 'error' });
            } else if (status === 401 || status === 403) {
                events.push({
                    category: 'access',
                    severity: 'error',
                    title,
                    type: 'session-failure',
                });
            }
        }
        return events;
    }

    private flushCompaction(parsed: ParsedClaudeMessage) {
        const { message } = parsed;
        const summaryMayFollow =
            message.kind === 'conversation' &&
            message.message.type === 'user' &&
            typeof message.message.message.content === 'string';
        return this.compaction && !summaryMayFollow ? this.compactionEvents(undefined) : [];
    }

    private compactionEvents(summary: string | undefined) {
        const output = { ...this.compaction, ...(summary === undefined ? {} : { summary }) };
        this.compaction = null;
        const facts = {
            providerExecuted: true,
            toolCallId: `claude-compaction-${this.options.newId()}`,
            toolName: compactionToolName,
        } as const;
        const events: TurnEvent[] = [
            { ...facts, input: {}, type: 'tool-call' },
            { ...facts, output, type: 'tool-result' },
        ];
        return events;
    }
}

function mergeUsage(current: ClaudeUsage | null, next: ClaudeUsage | null | undefined) {
    if (!next) {
        return current;
    }
    const merged: ClaudeUsage = { ...current };
    for (const [key, value] of Object.entries(next)) {
        if (value !== null && value !== undefined) {
            merged[key] = value;
        }
    }
    return merged;
}

function nativeType(parsed: ParsedClaudeMessage) {
    const { message } = parsed;
    switch (message.kind) {
        case 'invalid':
            return `invalid:${message.nativeType}`;
        case 'other':
            return message.nativeType;
        case 'system':
            return `system:${message.message.subtype}`;
        case 'stream':
            return `stream_event:${message.message.event.type}`;
        case 'conversation':
            return message.message.type;
        case 'lifecycle':
            return `command_lifecycle:${message.message.state}`;
        case 'rate-limit':
            return 'rate_limit_event';
        case 'result':
            return `result:${message.message.subtype}`;
        default:
            return 'unknown';
    }
}
