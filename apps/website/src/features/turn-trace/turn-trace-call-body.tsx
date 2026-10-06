import { ChatTool } from '@heroui-pro/react/chat-tool';
import { TurnTraceNote } from './turn-trace-blocks.tsx';
import type { TurnTraceError } from './turn-trace-error.ts';
import { TurnTraceToolBody } from './turn-trace-tool-bodies.tsx';
import type { TurnTraceTool } from './turn-trace-tool-model.ts';
import {
    clampTraceText,
    clampTraceValue,
    readFileDiff,
    readRecord,
    readShellOutput,
    readTraceSources,
    readTraceText,
    stableJson,
} from './turn-trace-values.ts';

/**
 * Everything one call's row opens to: why it failed first, as a person reads
 * it, then the evidence its kind produced, then why it stopped.
 */
export function TurnTraceCallBody({ tool }: { tool: TurnTraceTool }) {
    return (
        <>
            {tool.failure ? <TraceFailure failure={readCallFailure(tool, tool.failure)} /> : null}
            <TurnTraceToolBody tool={tool} />
            {tool.preliminary === undefined ? null : (
                <ChatTool.Result
                    label="Preliminary output"
                    value={clampTraceValue(tool.preliminary)}
                />
            )}
            {tool.interruption ? <TurnTraceNote>{tool.interruption}</TurnTraceNote> : null}
        </>
    );
}

/** A failure in one line: its readable message, never its transport payload, and any exit code. */
export function TraceFailure({ failure }: { failure: TurnTraceError }) {
    return (
        <p className="whitespace-pre-wrap break-words text-danger text-sm">
            {clampTraceText(failure.message).text}
            {failure.exitCode === null ? null : (
                <span className="text-muted tabular-nums">{` · Exit code ${failure.exitCode}`}</span>
            )}
        </p>
    );
}

/**
 * A command that exited non-zero journals its output as the "message"; that
 * output is evidence, not the reason, so it stays with the command.
 */
function readCallFailure(tool: TurnTraceTool, failure: TurnTraceError): TurnTraceError {
    return tool.kind === 'shell' && failure.exitCode !== null
        ? { exitCode: failure.exitCode, message: 'Command failed' }
        : failure;
}

/**
 * Whether a call has anything to open to. A row with an empty body is a plain
 * line: a disclosure that reveals nothing is a tab stop that lies.
 */
export function hasCallBody(tool: TurnTraceTool): boolean {
    if (tool.failure || tool.interruption || tool.preliminary !== undefined) {
        return true;
    }
    switch (tool.kind) {
        case 'shell': {
            const shell = readShellOutput(tool.output);
            return Boolean(tool.command || shell.stdout || shell.stderr);
        }
        case 'file-write':
            return Boolean(tool.content);
        case 'file-edit':
            return tool.oldText !== null || tool.newText !== null;
        case 'file-change':
            return readFileDiff(tool.output, tool.path) !== null;
        case 'file-read':
        case 'search':
            return Boolean(tool.pattern || readTraceText(tool.output));
        case 'web':
            return Boolean(
                tool.query ||
                    tool.url ||
                    readTraceSources(tool.output).length > 0 ||
                    readTraceText(tool.output)
            );
        case 'image':
            return Boolean(tool.image?.prompt || tool.image?.file);
        case 'compaction':
            return readRecord(tool.output) !== null;
        case 'mcp':
            return true;
        default:
            return hasValue(tool.source.input) || hasValue(tool.output);
    }
}

function hasValue(value: unknown): boolean {
    if (value === undefined || value === null) {
        return false;
    }
    const json = stableJson(value);
    return json !== null && json !== '{}' && json !== '[]' && json !== '""';
}
