import type { AssistantMessage, ToolResultMessage, Usage } from '@earendil-works/pi-ai';
import type {
    ConversationView,
    EntryRecord,
    LiveState,
    RunFailure,
} from '@earendil-works/pi-durable';
import type { InvocationOutcome } from '@haus/api';
import {
    addTokenUsage,
    compactionToolName,
    type RuntimeTokenUsage,
    type TurnEvent,
} from '../turn/turn-event.ts';

interface StreamedBlock {
    readonly id: string;
    readonly kind: AssistantMessage['content'][number]['type'];
    emitted: number;
    open: boolean;
}

export class PiTurnEvents {
    private seen: number;
    private failureTask: number | undefined;
    private streamed: { attempt: number; blocks: StreamedBlock[] } | null = null;
    usage: RuntimeTokenUsage | null = null;

    constructor(
        initial: ConversationView,
        private readonly options: {
            readonly invocations: ReadonlyMap<string, InvocationOutcome>;
            readonly newId: () => string;
            readonly searches: { drain(): readonly TurnEvent[] };
        }
    ) {
        this.seen = Math.max(0, ...initial.entries.map((entry) => entry.id));
        this.failureTask = liveOf(initial).runFailure?.taskId;
    }

    advance(view: ConversationView) {
        const events: TurnEvent[] = [];
        for (const entry of view.entries) {
            if (entry.id > this.seen) {
                this.seen = entry.id;
                this.entry(entry, events);
            }
        }
        const live = liveOf(view);
        const partial = live.generation?.message;
        if (live.generation && partial) {
            this.stream(
                live.generation.attempt,
                partial.content as AssistantMessage['content'],
                events
            );
        }
        let failure: RunFailure | null = null;
        if (live.runFailure && live.runFailure.taskId !== this.failureTask) {
            failure = live.runFailure;
            this.failureTask = failure.taskId;
        }
        const progress: TurnEvent = { nativeType: 'pi.view', type: 'progress' };
        return { events: events.length > 0 ? events : [progress], failure };
    }

    private entry(entry: EntryRecord, events: TurnEvent[]) {
        const [message] = entry.model ?? [];
        if (entry.kind === 'pi.assistant' && message?.role === 'assistant') {
            this.answer(message, events);
        } else if (entry.kind === 'pi.tool-result' && message?.role === 'toolResult') {
            events.push(this.toolResult(message));
        } else if (entry.kind === 'pi.compaction') {
            const summary = message?.role === 'user' ? textOf(message.content) : undefined;
            const facts = {
                providerExecuted: true,
                toolCallId: `pi-compaction-${entry.id}`,
                toolName: compactionToolName,
            } as const;
            const trigger = (entry.data as { reason?: string } | undefined)?.reason;
            events.push(
                { ...facts, input: {}, type: 'tool-call' },
                { ...facts, output: { summary, trigger }, type: 'tool-result' }
            );
        }
    }

    private answer(message: AssistantMessage, events: TurnEvent[]) {
        this.stream(this.streamed?.attempt ?? 0, message.content, events);
        this.closeReasoning(events);
        this.streamed = null;
        events.push(...this.options.searches.drain());
        for (const block of message.content) {
            if (block.type === 'toolCall') {
                events.push({
                    input: block.arguments,
                    toolCallId: block.id,
                    toolName: block.name,
                    type: 'tool-call',
                });
            }
        }
        const usage = piTokenUsage(message.usage);
        this.usage = addTokenUsage(this.usage, usage);
        events.push({ contextTokens: usage.inputTokens, type: 'step-finish', usage });
    }

    private toolResult(message: ToolResultMessage) {
        const invocation = this.options.invocations.get(message.toolCallId);
        const event: TurnEvent = {
            ...(invocation ? { invocation } : {}),
            ...(message.isError ? { isError: true } : {}),
            output: toolOutputOf(message.content),
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            type: 'tool-result',
        };
        return event;
    }

    private stream(attempt: number, content: AssistantMessage['content'], events: TurnEvent[]) {
        if (this.streamed?.attempt !== attempt) {
            this.closeReasoning(events);
            this.streamed = { attempt, blocks: [] };
        }
        const { blocks } = this.streamed;
        for (const [index, block] of content.entries()) {
            let tracked = blocks[index];
            if (!tracked) {
                this.closeReasoning(events);
                tracked = { emitted: 0, id: this.options.newId(), kind: block.type, open: true };
                blocks[index] = tracked;
                if (block.type === 'thinking') {
                    events.push({ id: tracked.id, type: 'reasoning-start' });
                }
            }
            const text =
                block.type === 'text'
                    ? block.text
                    : block.type === 'thinking'
                      ? block.thinking
                      : '';
            if (text.length > tracked.emitted) {
                events.push({
                    id: tracked.id,
                    text: text.slice(tracked.emitted),
                    type: block.type === 'thinking' ? 'reasoning-delta' : 'text-delta',
                });
                tracked.emitted = text.length;
            }
        }
    }

    private closeReasoning(events: TurnEvent[]) {
        for (const block of this.streamed?.blocks ?? []) {
            if (block.kind === 'thinking' && block.open) {
                block.open = false;
                events.push({ id: block.id, type: 'reasoning-end' });
            }
        }
    }
}

export function piTokenUsage(usage: Usage) {
    const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
    const tokens: RuntimeTokenUsage = {
        cacheReadTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite,
        inputTokens,
        outputTokens: usage.output,
        totalTokens: inputTokens + usage.output,
    };
    return tokens;
}

export function liveOf(view: ConversationView) {
    return (view.docs['pi.live'] ?? {}) as LiveState;
}

function toolOutputOf(content: ToolResultMessage['content']) {
    if (content.some((part) => part.type !== 'text')) {
        return content;
    }
    const text = textOf(content);
    try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null ? parsed : text;
    } catch {
        return text;
    }
}

function textOf(content: string | readonly { readonly text?: string; readonly type: string }[]) {
    return typeof content === 'string'
        ? content
        : content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('');
}
