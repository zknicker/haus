import * as z from 'zod';
import { compactionToolName, type TurnEvent } from '../turn-event.ts';
import { grokRetryStateFailure } from './grok-failure.ts';
import { createGrokToolTracker } from './grok-tool-events.ts';
import { readGrokRequestUsage } from './grok-usage.ts';
import type { WorkspacePaths } from './workspace-paths.ts';

/** Grok's session-scoped notifications: standard ACP updates and its `_x.ai` extensions. */
const SESSION_UPDATE_METHODS = new Set(['session/update', '_x.ai/session_notification']);

const envelopeSchema = z.looseObject({
    _meta: z.looseObject({ isReplay: z.boolean().optional() }).nullish(),
    sessionId: z.string(),
    update: z.looseObject({ sessionUpdate: z.string() }).optional(),
});

const chunkSchema = z.looseObject({
    content: z.looseObject({ text: z.string().optional(), type: z.string() }),
});

const responseCompletedSchema = z.looseObject({ usage: z.unknown() });

const autoCompactCompletedSchema = z.looseObject({
    tokens_after: z.number().optional(),
    tokens_before: z.number().optional(),
});

/**
 * Normalizes one turn's Grok notifications into `TurnEvent`s. Every notification for the session
 * yields at least one event; a payload Haus does not read is `progress`. Replayed history from a
 * `session/load` and other sessions' notifications yield nothing.
 */
export function createGrokTurnNormalizer(options: {
    hostServerName: string;
    paths: WorkspacePaths;
    sessionId: string;
}) {
    const tools = createGrokToolTracker(options);
    let block: { id: string; kind: 'reasoning' | 'text' } | null = null;
    let blocks = 0;
    let compactions = 0;

    const closeBlock = (): TurnEvent[] => {
        const open = block;
        block = null;
        return open?.kind === 'reasoning' ? [{ id: open.id, type: 'reasoning-end' }] : [];
    };
    const content = (kind: 'reasoning' | 'text', text: string): TurnEvent[] => {
        const events: TurnEvent[] = [];
        if (block?.kind !== kind) {
            events.push(...closeBlock());
            blocks += 1;
            block = { id: `${kind}-${blocks}`, kind };
            if (kind === 'reasoning') {
                events.push({ id: block.id, type: 'reasoning-start' });
            }
        }
        const id = block.id;
        events.push(
            kind === 'text'
                ? { id, text, type: 'text-delta' }
                : { id, text, type: 'reasoning-delta' }
        );
        return events;
    };

    const update = (kind: string, value: Record<string, unknown>): TurnEvent[] => {
        switch (kind) {
            case 'agent_message_chunk':
            case 'agent_thought_chunk': {
                const text = chunkText(value);
                return text
                    ? content(kind === 'agent_message_chunk' ? 'text' : 'reasoning', text)
                    : [progress(kind)];
            }
            case 'tool_call':
            case 'tool_call_update': {
                const events = tools.update(value);
                return events.length > 0 ? [...closeBlock(), ...events] : [progress(kind)];
            }
            case 'response_completed':
                return [...closeBlock(), stepFinish(value)];
            case 'auto_compact_completed':
                compactions += 1;
                return [...closeBlock(), ...compaction(`grok-compaction-${compactions}`, value)];
            case 'retry_state':
                return [grokRetryStateFailure(value) ?? progress(kind)];
            default:
                return [progress(kind)];
        }
    };

    return {
        /** Events for one agent notification; `[]` when it is not this turn's to report. */
        notification(method: string, params: unknown): TurnEvent[] {
            const envelope = envelopeSchema.safeParse(params);
            if (!envelope.success || envelope.data.sessionId !== options.sessionId) {
                return [];
            }
            if (envelope.data._meta?.isReplay === true) {
                return [];
            }
            const body = envelope.data.update;
            if (!(SESSION_UPDATE_METHODS.has(method) && body)) {
                return [progress(method)];
            }
            return update(body.sessionUpdate, body);
        },
        /** Closes an open reasoning block before the turn settles. */
        finish(): TurnEvent[] {
            return closeBlock();
        },
    };
}

export type GrokTurnNormalizer = ReturnType<typeof createGrokTurnNormalizer>;

function chunkText(value: unknown): string | undefined {
    const chunk = chunkSchema.safeParse(value);
    return chunk.success && chunk.data.content.type === 'text'
        ? chunk.data.content.text
        : undefined;
}

/** Grok's `response_completed` closes one model request: its usage and context size. */
function stepFinish(value: unknown): TurnEvent {
    const completed = responseCompletedSchema.safeParse(value);
    const step = completed.success ? readGrokRequestUsage(completed.data.usage) : null;
    return {
        contextTokens: step?.contextTokens ?? null,
        type: 'step-finish',
        usage: step?.usage ?? null,
    };
}

/**
 * Grok's `auto_compact_completed` (Grok Build's `SessionUpdate`, read from its binary: no ACP
 * schema publishes it) as the reserved compaction pair every driver reports.
 */
function compaction(toolCallId: string, value: unknown): TurnEvent[] {
    const completed = autoCompactCompletedSchema.safeParse(value);
    const tokens = completed.success ? completed.data : {};
    const facts = {
        dynamic: true,
        providerExecuted: true,
        toolCallId,
        toolName: compactionToolName,
    } as const;
    return [
        { ...facts, input: {}, type: 'tool-call' },
        {
            ...facts,
            output: {
                ...(tokens.tokens_after === undefined ? {} : { tokensAfter: tokens.tokens_after }),
                ...(tokens.tokens_before === undefined
                    ? {}
                    : { tokensBefore: tokens.tokens_before }),
            },
            type: 'tool-result',
        },
    ];
}

function progress(nativeType: string): TurnEvent {
    return { nativeType, type: 'progress' };
}
