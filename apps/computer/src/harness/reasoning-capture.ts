import type { ReasoningTurnEvent } from '../runtime/turn-event.ts';
import type { ComputerExecutionJournal } from './execution-journal.ts';

const lastReasoningFlush = new WeakMap<ComputerExecutionJournal, number>();
const reasoningFlushIntervalMs = 250;

/**
 * Captures model reasoning into the Computer-local execution journal.
 *
 * Drivers report reasoning as `reasoning-start` / `reasoning-delta` / `reasoning-end`
 * triples keyed by a block `id`, with the delta text on `text`.
 * Deltas flush at most four times a second so an open activity view can read
 * ongoing reasoning. Block and tool boundaries also flush any trailing text.
 */
export async function observeReasoningPart(
    part: ReasoningTurnEvent,
    journal: ComputerExecutionJournal | undefined
): Promise<void> {
    const id = part.id.length > 0 ? part.id : undefined;
    if (!(journal && id)) {
        return;
    }
    if (part.type === 'reasoning-start') {
        journal.recordReasoningStart({ id });
        return;
    }
    if (part.type === 'reasoning-delta') {
        journal.appendReasoning({ id, text: part.text });
        const now = Date.now();
        if (now - (lastReasoningFlush.get(journal) ?? 0) >= reasoningFlushIntervalMs) {
            lastReasoningFlush.set(journal, now);
            await journal.flushReasoning();
        }
        return;
    }
    await journal.recordReasoningEnd({ id });
}
