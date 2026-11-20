import type { InvocationOutcome } from '@haus/api';
import type { TurnEvent } from '../turn/turn-event.ts';
import type { ClaudeContentBlock } from './claude-messages.ts';
import { contentText } from './claude-result.ts';

export const hausServerName = 'haus';

const hausPrefix = `mcp__${hausServerName}__`;

const providerToolNames: Readonly<Record<string, string>> = {
    WebFetch: 'WebFetch',
    WebSearch: 'webSearch',
};

export function claudeToolIdentity(nativeName: string) {
    if (nativeName.startsWith(hausPrefix)) {
        return { nativeName, toolName: nativeName.slice(hausPrefix.length) };
    }
    return {
        nativeName,
        providerExecuted: true,
        toolName: providerToolNames[nativeName] ?? nativeName,
    };
}

export function claudeToolEvents(invocations: ReadonlyMap<string, InvocationOutcome>) {
    const calls = new Map<string, ReturnType<typeof claudeToolIdentity>>();
    return {
        call(block: ClaudeContentBlock) {
            const events: TurnEvent[] = [];
            if (!(block.id && block.name) || calls.has(block.id)) {
                return events;
            }
            const identity = claudeToolIdentity(block.name);
            calls.set(block.id, identity);
            events.push({
                ...identity,
                input: block.input ?? {},
                toolCallId: block.id,
                type: 'tool-call',
            });
            return events;
        },
        result(block: ClaudeContentBlock, structured: unknown) {
            const events: TurnEvent[] = [];
            const toolCallId = block.tool_use_id;
            if (!toolCallId) {
                return events;
            }
            const identity = calls.get(toolCallId) ?? claudeToolIdentity('unknown');
            calls.delete(toolCallId);
            const isError = block.is_error === true;
            if (identity.providerExecuted) {
                const output = structured ?? contentText(block.content);
                events.push(
                    isError
                        ? { ...identity, error: output, toolCallId, type: 'tool-error' }
                        : { ...identity, output, toolCallId, type: 'tool-result' }
                );
                return events;
            }
            const invocation = invocations.get(toolCallId);
            events.push({
                ...identity,
                ...(invocation ? { invocation } : {}),
                ...(isError ? { isError } : {}),
                output: hausToolOutput(block.content),
                toolCallId,
                type: 'tool-result',
            });
            return events;
        },
    };
}

function hausToolOutput(content: unknown) {
    if (Array.isArray(content) && content.some((part) => !isTextPart(part))) {
        return content;
    }
    const text = contentText(content);
    try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null ? parsed : text;
    } catch {
        return text;
    }
}

function isTextPart(part: unknown) {
    return typeof part === 'object' && part !== null && 'type' in part && part.type === 'text';
}
