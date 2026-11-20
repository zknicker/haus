import type { TurnEvent } from '../turn-event.ts';

/**
 * Assistant text and reasoning for one turn, with Raft's phase rules. Only a `final_answer` (or
 * phase-less, legacy) message is text; `commentary` is liveness. A message made only of
 * whitespace never becomes text: leading whitespace waits until real text arrives (Raft #816).
 * Reasoning summaries are reasoning; raw reasoning text stays liveness only.
 */
export class CodexMessageText {
    private readonly phases = new Map<string, string | null>();
    private readonly streamed = new Set<string>();
    private readonly visible = new Set<string>();
    private readonly heldWhitespace = new Map<string, string>();
    private readonly reasoningOpen = new Set<string>();
    private readonly reasoningStreamed = new Set<string>();
    private sawText = false;
    private deliveredText = false;

    messageStarted(id: string, phase: string | null): void {
        this.phases.set(id, phase);
    }

    messageDelta(id: string, delta: string, phase: string | null): TurnEvent[] {
        this.streamed.add(id);
        return this.admit(id, delta, phase ?? this.phases.get(id) ?? null);
    }

    /** A completed message; its text only when no delta already streamed it. */
    messageCompleted(id: string, text: string, phase: string | null): TurnEvent[] {
        const events = this.streamed.has(id)
            ? []
            : this.admit(id, text, phase ?? this.phases.get(id) ?? null);
        this.phases.delete(id);
        this.streamed.delete(id);
        this.visible.delete(id);
        this.heldWhitespace.delete(id);
        return events;
    }

    summaryDelta(id: string, delta: string): TurnEvent[] {
        this.reasoningStreamed.add(id);
        return [...this.openReasoning(id), { id, text: delta, type: 'reasoning-delta' }];
    }

    /** A completed reasoning item; its summary only when no delta already streamed it. */
    reasoningCompleted(id: string, summary: readonly string[]): TurnEvent[] {
        const text = summary.join('\n').trim();
        const events: TurnEvent[] =
            !this.reasoningStreamed.has(id) && text.length > 0 ? this.summaryDelta(id, text) : [];
        this.reasoningStreamed.delete(id);
        if (this.reasoningOpen.delete(id)) {
            events.push({ id, type: 'reasoning-end' });
        }
        return events;
    }

    /** Assistant text arrived this turn, but none of it reached a consumer as an answer. */
    get blankFinalAnswer(): boolean {
        return this.sawText && !this.deliveredText;
    }

    private openReasoning(id: string): TurnEvent[] {
        if (this.reasoningOpen.has(id)) {
            return [];
        }
        this.reasoningOpen.add(id);
        return [{ id, type: 'reasoning-start' }];
    }

    private admit(id: string, text: string, phase: string | null): TurnEvent[] {
        const blank = text.trim().length === 0;
        if (!blank) {
            this.sawText = true;
        }
        // A missing phase is "unknown", not commentary: legacy models answer without one.
        if (text.length === 0 || !(phase === null || phase === 'final_answer')) {
            return [];
        }
        if (this.visible.has(id)) {
            return [{ id, text, type: 'text-delta' }];
        }
        if (blank) {
            this.heldWhitespace.set(id, (this.heldWhitespace.get(id) ?? '') + text);
            return [];
        }
        const held = this.heldWhitespace.get(id) ?? '';
        this.heldWhitespace.delete(id);
        this.visible.add(id);
        this.deliveredText = true;
        return [{ id, text: held + text, type: 'text-delta' }];
    }
}
