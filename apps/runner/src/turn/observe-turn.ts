import type { createRunActivity } from './run-activity.ts';
import {
    addTokenUsage,
    compactionToolName,
    isFatalTurnEvent,
    type RuntimeTokenUsage,
    type TurnEvent,
} from './turn-event.ts';
import { SessionFailureError } from './turn-failure.ts';
import type { ToolGate } from './turn-notices.ts';

export const turnNoProgress = { checkEveryMs: 60_000, deadlineMs: 15 * 60_000 };

export interface TurnObservation {
    readonly aborted: boolean;
    readonly compacted: boolean;
    readonly contextTokens: number | null;
    readonly failure: unknown;
    readonly tokenUsage: RuntimeTokenUsage | null;
}

export async function observeTurn(
    events: AsyncIterable<TurnEvent>,
    input: {
        activity: ReturnType<typeof createRunActivity>;
        thoughts?: { observe(event: TurnEvent): void };
        gate: ToolGate;
        noProgress: typeof turnNoProgress;
        onNoProgress: () => void;
    }
) {
    let aborted = false;
    let compacted = false;
    let contextTokens: number | null = null;
    let failure: unknown = null;
    let finalUsage: RuntimeTokenUsage | null = null;
    let stepUsage: RuntimeTokenUsage | null = null;
    let lastEventAt = Date.now();
    const watchdog = setInterval(() => {
        if (Date.now() - lastEventAt >= input.noProgress.deadlineMs) {
            clearInterval(watchdog);
            input.onNoProgress();
        }
    }, input.noProgress.checkEveryMs);
    watchdog.unref();
    try {
        for await (const event of events) {
            lastEventAt = Date.now();
            input.activity.observe(event);
            input.thoughts?.observe(event);
            switch (event.type) {
                case 'tool-call':
                    compacted ||= event.toolName === compactionToolName;
                    input.gate.toolCallStarted(event.toolCallId);
                    break;
                case 'tool-result':
                case 'tool-error':
                    input.gate.toolCallSettled(event.toolCallId);
                    break;
                case 'step-finish':
                    contextTokens = event.contextTokens ?? contextTokens;
                    stepUsage = addTokenUsage(stepUsage, event.usage);
                    break;
                case 'turn-finish':
                    finalUsage = event.usage;
                    break;
                case 'session-failure':
                    if (isFatalTurnEvent(event)) {
                        failure ??= new SessionFailureError(event);
                    }
                    break;
                case 'error':
                    failure ??= event.error;
                    break;
                case 'abort':
                    aborted = true;
                    break;
                default:
                    break;
            }
        }
    } catch (error) {
        failure ??= error;
    } finally {
        clearInterval(watchdog);
    }
    const observation: TurnObservation = {
        aborted: aborted && failure === null,
        compacted,
        contextTokens,
        failure,
        tokenUsage: finalUsage ?? stepUsage,
    };
    return observation;
}
