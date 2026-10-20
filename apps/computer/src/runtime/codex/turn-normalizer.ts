import type { TurnEvent } from '../turn-event.ts';
import { CodexMessageText } from './message-text.ts';
import {
    deltaParamsSchema,
    errorParamsSchema,
    itemParamsSchema,
    threadStatusParamsSchema,
    tokenUsageParamsSchema,
    turnParamsSchema,
} from './protocol.ts';
import { codexSessionFailure } from './session-failure.ts';
import { type ToolItemContext, toolItemCompleted, toolItemStarted } from './tool-items.ts';
import type { CodexUsageLedger } from './turn-usage.ts';

/** How a turn ended on the wire. */
export type CodexTurnEnd =
    | { readonly kind: 'completed' }
    | { readonly kind: 'failed'; readonly message: string }
    | { readonly kind: 'interrupted'; readonly message: string | null };

export interface NormalizedNotification {
    readonly end?: CodexTurnEnd;
    readonly events: TurnEvent[];
    /** Turn content arrived: a steer is safe again (Raft #238). */
    readonly progress?: boolean;
    /** The thread entered `systemError`; its reason usually follows as an `error`. */
    readonly systemError?: string;
    /** A tool finished: hold steering until the next progress (Raft #238). */
    readonly toolBoundary?: boolean;
    readonly turnStarted?: string;
}

/**
 * Turns one app-server notification for the session's own thread into turn events. Every
 * notification yields at least one event, so turn liveness tracks the wire exactly.
 */
export class CodexTurnNormalizer {
    private text = new CodexMessageText();
    private evidence = false;

    constructor(
        private readonly context: ToolItemContext,
        private readonly usage: CodexUsageLedger
    ) {}

    beginTurn(): void {
        this.text = new CodexMessageText();
        this.evidence = false;
        this.usage.beginTurn();
    }

    /** Whether the turn produced any output, progress, or usage (Raft's zero-evidence check). */
    get hadEvidence(): boolean {
        return this.evidence;
    }

    usageForTurn() {
        return this.usage.turnUsage();
    }

    normalize(method: string, params: unknown): NormalizedNotification {
        switch (method) {
            case 'turn/started': {
                const turn = turnParamsSchema.safeParse(params);
                return turn.success
                    ? { events: [progress(method)], turnStarted: turn.data.turn.id }
                    : invalid(method);
            }
            case 'turn/completed':
                return this.completed(params);
            case 'item/started':
            case 'item/completed':
                return this.item(method, params);
            case 'item/agentMessage/delta':
            case 'item/reasoning/summaryTextDelta':
            case 'item/reasoning/textDelta':
                return this.delta(method, params);
            case 'thread/tokenUsage/updated':
                return this.tokenUsage(params);
            case 'error':
                return this.error(params);
            case 'thread/status/changed':
                return this.status(params);
            default:
                return isTurnContent(method)
                    ? this.marked({ events: [progress(method)], progress: true })
                    : { events: [progress(method)] };
        }
    }

    private completed(params: unknown): NormalizedNotification {
        const parsed = turnParamsSchema.safeParse(params);
        if (!parsed.success) {
            return invalid('turn/completed');
        }
        const { turn } = parsed.data;
        const events: TurnEvent[] = [];
        if (this.text.blankFinalAnswer) {
            events.push(progress('codex_blank_final_answer'));
        }
        if (turn.status === 'failed') {
            return {
                end: { kind: 'failed', message: turn.error?.message || 'Codex turn failed.' },
                events,
            };
        }
        if (turn.status === 'interrupted') {
            return { end: { kind: 'interrupted', message: turn.error?.message ?? null }, events };
        }
        return { end: { kind: 'completed' }, events };
    }

    private item(method: string, params: unknown): NormalizedNotification {
        const parsed = itemParamsSchema.safeParse(params);
        if (!parsed.success) {
            return invalid(method);
        }
        const { item } = parsed.data;
        const id = item.id ?? '';
        const started = method === 'item/started';
        if (item.type === 'agentMessage') {
            const phase = typeof item.phase === 'string' ? item.phase : null;
            if (started) {
                this.text.messageStarted(id, phase);
                return { events: [progress(method)] };
            }
            const events = this.text.messageCompleted(id, String(item.text ?? ''), phase);
            return this.marked({
                events: events.length > 0 ? events : [progress(method)],
                progress: true,
            });
        }
        if (item.type === 'reasoning') {
            const summary = Array.isArray(item.summary) ? item.summary.filter(isString) : [];
            const events = started ? [] : this.text.reasoningCompleted(id, summary);
            return { events: events.length > 0 ? events : [progress(method)] };
        }
        const tools = started
            ? toolItemStarted(item, this.context)
            : toolItemCompleted(item, this.context);
        if (!tools) {
            return { events: [progress(`${method}:${item.type}`)] };
        }
        return started
            ? this.marked({ events: tools, progress: true })
            : this.marked({ events: tools, toolBoundary: true });
    }

    private delta(method: string, params: unknown): NormalizedNotification {
        const parsed = deltaParamsSchema.safeParse(params);
        if (!parsed.success) {
            return invalid(method);
        }
        const { delta, itemId = '', phase } = parsed.data;
        if (delta.length === 0) {
            return { events: [progress(method)] };
        }
        let events: TurnEvent[] = [];
        if (method === 'item/agentMessage/delta') {
            events = this.text.messageDelta(itemId, delta, phase ?? null);
        } else if (method === 'item/reasoning/summaryTextDelta') {
            events = this.text.summaryDelta(itemId, delta);
        }
        return this.marked({
            events: events.length > 0 ? events : [progress(method)],
            progress: true,
        });
    }

    private tokenUsage(params: unknown): NormalizedNotification {
        const parsed = tokenUsageParamsSchema.safeParse(params);
        if (!parsed.success) {
            // Codex sends `tokenUsage: null` for a request it could not count.
            return { events: [progress('thread/tokenUsage/updated')] };
        }
        this.evidence = true;
        const step = this.usage.observe(parsed.data.tokenUsage);
        return {
            events: step
                ? [{ contextTokens: step.contextTokens, type: 'step-finish', usage: step.usage }]
                : [progress('thread/tokenUsage/updated')],
        };
    }

    private error(params: unknown): NormalizedNotification {
        const parsed = errorParamsSchema.safeParse(params);
        if (!parsed.success) {
            return invalid('error');
        }
        this.evidence ||= parsed.data.willRetry === true;
        return { events: [codexSessionFailure(parsed.data.error, parsed.data.willRetry === true)] };
    }

    private status(params: unknown): NormalizedNotification {
        const parsed = threadStatusParamsSchema.safeParse(params);
        if (!(parsed.success && parsed.data.status.type === 'systemError')) {
            return { events: [progress('thread/status/changed')] };
        }
        const { status } = parsed.data;
        const message =
            status.message ?? status.error?.message ?? 'Codex thread entered a system error state.';
        // Codex sends the reason as an `error` notification right after; the turn ends on
        // `turn/completed`, or on the session's fallback when that never comes.
        return { events: [progress('thread/status/changed:systemError')], systemError: message };
    }

    private marked(result: NormalizedNotification): NormalizedNotification {
        this.evidence = true;
        return result;
    }
}

/** Liveness the zero-evidence check counts: command output, plans, diffs, raw items. */
function isTurnContent(method: string): boolean {
    return (
        method.startsWith('item/') ||
        method.startsWith('rawResponse') ||
        method === 'turn/diff/updated' ||
        method === 'turn/plan/updated'
    );
}

function progress(nativeType: string): TurnEvent {
    return { nativeType, type: 'progress' };
}

function invalid(method: string): NormalizedNotification {
    return { events: [progress(`${method}:unrecognized`)] };
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}
