import type { TurnEvent } from '../turn-event.ts';
import type { ClaudeContentBlock } from './claude-messages.ts';
import { bashExitCode, contentText } from './claude-result.ts';
import { type ClaudeToolName, claudeToolName } from './claude-tool-names.ts';

/**
 * Tool calls and results of the Agent's own (non-sub-agent) messages. Calls are remembered by
 * id so a result reports the same identity; inputs and outputs are workspace-relative.
 */
export function createClaudeToolEvents(options: {
    hostServer: string;
    strip: (value: unknown) => unknown;
}) {
    const calls = new Map<string, ClaudeToolName>();
    return {
        call(block: ClaudeContentBlock): TurnEvent | null {
            if (!(block.id && block.name) || calls.has(block.id)) {
                return null;
            }
            const name = claudeToolName(block.name, options.hostServer);
            calls.set(block.id, name);
            return {
                input: options.strip(block.input ?? {}),
                toolCallId: block.id,
                type: 'tool-call',
                ...identity(name),
            };
        },
        clear() {
            calls.clear();
        },
        /** `structured` is the message's `tool_use_result`, present when it holds one result. */
        result(block: ClaudeContentBlock, structured: unknown): TurnEvent | null {
            const toolCallId = block.tool_use_id;
            if (!toolCallId) {
                return null;
            }
            const name = calls.get(toolCallId) ?? claudeToolName('unknown', options.hostServer);
            calls.delete(toolCallId);
            const facts = { toolCallId, ...identity(name) };
            const isError = block.is_error === true;
            if (!name.providerExecuted) {
                const output = options.strip(hostToolOutput(block.content));
                return isError
                    ? { ...facts, error: output, type: 'tool-error' }
                    : { ...facts, output, type: 'tool-result' };
            }
            const exitCode =
                name.nativeName === 'Bash' && isError ? bashExitCode(block.content) : undefined;
            if (exitCode !== undefined) {
                return {
                    ...facts,
                    output: options.strip({ exitCode, stdout: contentText(block.content) }),
                    type: 'tool-result',
                };
            }
            const output = options.strip(
                structured === undefined ? nativeOutput(name, block.content, isError) : structured
            );
            return isError
                ? { ...facts, error: output, type: 'tool-error' }
                : { ...facts, output, type: 'tool-result' };
        },
    };
}

function identity(name: ClaudeToolName) {
    return {
        nativeName: name.nativeName,
        toolName: name.toolName,
        ...(name.providerExecuted ? { providerExecuted: true } : {}),
        ...(name.dynamic ? { dynamic: true } : {}),
    };
}

/** A builtin's result without a structured `tool_use_result`, shaped as the harness shaped it. */
function nativeOutput(name: ClaudeToolName, content: unknown, isError: boolean): unknown {
    if (name.toolName === 'bash') {
        return { exitCode: isError ? 1 : 0, stdout: contentText(content) };
    }
    if (Array.isArray(content) && content.some((part) => !isTextPart(part))) {
        return content;
    }
    const text =
        typeof content === 'string' || Array.isArray(content) ? contentText(content) : content;
    return name.dynamic && typeof text === 'string' ? parseJsonObject(text) : text;
}

/**
 * A host tool's output as the tool produced it: the MCP server sends text as one text block and
 * a JSON value as its serialization, so a JSON object or array reads back as that value.
 */
function hostToolOutput(content: unknown): unknown {
    if (Array.isArray(content) && content.some((part) => !isTextPart(part))) {
        return content;
    }
    return parseJsonObject(contentText(content));
}

function parseJsonObject(text: string): unknown {
    try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null ? parsed : text;
    } catch {
        return text;
    }
}

function isTextPart(part: unknown): boolean {
    return typeof part === 'object' && part !== null && 'type' in part && part.type === 'text';
}
