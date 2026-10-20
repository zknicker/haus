import { readRuntimeSessionFailure } from '../harness/runtime-session-failure.ts';
import {
    readClaudePlanUsageMetadata,
    readTokenUsage,
    usageContextTokens,
} from '../harness/token-usage.ts';
import { acpReadLocationEvent } from './acp-events.ts';
import { claudeSubagentEvents } from './claude-subagent-events.ts';
import type { TurnEvent } from './turn-event.ts';

/**
 * TEMPORARY: translates one AI SDK harness `fullStream` part into turn events. Deleted with
 * `ai-sdk-adapter.ts` once every runtime has a Haus driver (specs/runtime-drivers.md).
 *
 * Every typed part yields at least one event, so turn progress and first-event timing match the
 * part stream exactly. A `raw` part carries the runtime's native payload: a typed ACP session
 * failure, an ACP read location, or a Claude Code sub-agent message.
 */
export function aiSdkTurnEvents(part: unknown): TurnEvent[] {
    if (!isRecord(part) || typeof part.type !== 'string') {
        return [];
    }
    switch (part.type) {
        case 'raw':
            return rawEvents(part.rawValue);
        case 'reasoning-delta':
            return typeof part.text === 'string'
                ? [{ id: text(part.id), text: part.text, type: 'reasoning-delta' }]
                : [progress(part.type)];
        case 'reasoning-end':
        case 'reasoning-start':
            return [{ id: text(part.id), type: part.type }];
        case 'text-delta':
            return typeof part.text === 'string'
                ? [{ id: text(part.id), text: part.text, type: 'text-delta' }]
                : [progress(part.type)];
        case 'tool-call':
            return [toolCallEvent(part)];
        case 'tool-result':
            return [
                {
                    ...toolFacts(part),
                    output: part.output,
                    type: 'tool-result',
                    ...(part.isError === true ? { isError: true } : {}),
                    ...(part.preliminary === true ? { preliminary: true } : {}),
                },
            ];
        case 'tool-error':
            return [{ ...toolFacts(part), error: part.error, type: 'tool-error' }];
        case 'finish-step':
            return [
                {
                    contextTokens: usageContextTokens(part.usage),
                    type: 'step-finish',
                    usage: readTokenUsage(part.usage),
                },
            ];
        case 'finish':
            return [
                {
                    claudePlanUsage: readClaudePlanUsageMetadata(part.providerMetadata),
                    type: 'turn-finish',
                    usage: readTokenUsage(part.totalUsage),
                },
            ];
        case 'error':
            return [{ error: part.error ?? new Error('Harness stream failed.'), type: 'error' }];
        case 'abort':
            return [{ type: 'abort' }];
        default:
            return [progress(part.type)];
    }
}

function rawEvents(rawValue: unknown): TurnEvent[] {
    const failure = readRuntimeSessionFailure(rawValue);
    if (failure) {
        return [{ ...failure, type: 'session-failure' }];
    }
    const read = acpReadLocationEvent(rawValue);
    if (read) {
        return [read];
    }
    const subagent = claudeSubagentEvents(rawValue);
    return subagent.length > 0 ? subagent : [progress('raw')];
}

function toolCallEvent(part: Record<string, unknown>): TurnEvent {
    const sourceToolCallId = acpSourceToolCallId(part.providerMetadata);
    return {
        ...toolFacts(part),
        input: part.input,
        type: 'tool-call',
        ...(part.invalid === true ? { invalid: true } : {}),
        ...(sourceToolCallId ? { sourceToolCallId } : {}),
    };
}

function toolFacts(part: Record<string, unknown>) {
    const nativeName = typeof part.nativeName === 'string' ? part.nativeName : undefined;
    return {
        toolCallId: text(part.toolCallId),
        toolName: text(part.toolName),
        ...(nativeName === undefined ? {} : { nativeName }),
        ...(part.dynamic === true ? { dynamic: true } : {}),
        ...(part.providerExecuted === true ? { providerExecuted: true } : {}),
    };
}

/** harness-acp tags its synthetic `fileChange` with the ACP call it came from. */
function acpSourceToolCallId(providerMetadata: unknown): string | undefined {
    const acp = isRecord(providerMetadata) ? providerMetadata.acp : undefined;
    const toolCallId = isRecord(acp) ? acp.toolCallId : undefined;
    return typeof toolCallId === 'string' && toolCallId.length > 0 ? toolCallId : undefined;
}

function progress(nativeType: string): TurnEvent {
    return { nativeType, type: 'progress' };
}

/** Consumers ignore an empty id or name, as they ignored a missing one. */
function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
