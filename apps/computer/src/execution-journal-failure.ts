import { type AgentExecutionJournalFailure, EXECUTION_JOURNAL_FAILURE_MAX_CHARS } from '@haus/api';

const toolUseErrorPattern = /^<tool_use_error>([\s\S]*)<\/tool_use_error>$/u;
const exitCodeLinePattern = /^Exit code (-?\d+)(?:\r?\n|$)/u;
const errorPrefixPattern = /^Error: /u;

/** Codes the Computer itself writes when a tool or turn ends without a runtime error. */
const journalCodeMessages: Readonly<Record<string, string>> = {
    failed: 'The tool did not finish because the turn failed.',
    interrupted: 'The tool was interrupted.',
    missing_result: 'The runtime never reported a result for this tool.',
    stream_failed: 'The turn stream failed before the tool finished.',
};

/**
 * Normalizes a runtime's tool error into one readable message. Codex reports a
 * failed shell call as `{ formatted_output, exit_code }`; Claude wraps errors in
 * `<tool_use_error>`. Anything unrecognized stays raw-only (undefined here).
 */
export function toolFailure(error: unknown): AgentExecutionJournalFailure | undefined {
    if (typeof error === 'string') {
        return stringFailure(error);
    }
    if (!isRecord(error)) {
        return undefined;
    }
    const exitCode = integer(error.exit_code) ?? integer(error.exitCode);
    const text =
        nonEmptyText(error.formatted_output) ??
        nonEmptyText(error.message) ??
        nonEmptyText(error.stderr) ??
        nonEmptyText(error.output);
    if (text) {
        const failure = stringFailure(text);
        return failure ? withExitCode(failure, exitCode) : undefined;
    }
    if (exitCode !== undefined) {
        return { exitCode, message: `Exited with code ${exitCode}.` };
    }
    const code = nonEmptyText(error.code);
    return code ? { message: journalCodeMessages[code] ?? code } : undefined;
}

/** A turn's terminal error, usually an `Error: …` line followed by a stack trace. */
export function turnFailure(error: unknown): AgentExecutionJournalFailure | undefined {
    if (typeof error !== 'string') {
        return toolFailure(error);
    }
    const firstLine = error
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    return firstLine ? stringFailure(firstLine) : undefined;
}

function stringFailure(raw: string): AgentExecutionJournalFailure | undefined {
    let message = raw.trim();
    const parsed = parseJsonObject(message);
    if (parsed) {
        return toolFailure(parsed);
    }
    message = (toolUseErrorPattern.exec(message)?.[1] ?? message).trim();
    const exitLine = exitCodeLinePattern.exec(message);
    const exitCode = exitLine ? Number(exitLine[1]) : undefined;
    if (exitLine) {
        message = message.slice(exitLine[0].length).trim();
    }
    message = message.replace(errorPrefixPattern, '').trim();
    if (!message) {
        return exitCode === undefined
            ? undefined
            : { exitCode, message: `Exited with code ${exitCode}.` };
    }
    return withExitCode({ message: clip(message) }, exitCode);
}

function withExitCode(
    failure: AgentExecutionJournalFailure,
    exitCode: number | undefined
): AgentExecutionJournalFailure {
    return exitCode === undefined || failure.exitCode !== undefined
        ? failure
        : { ...failure, exitCode };
}

function clip(message: string): string {
    return message.length > EXECUTION_JOURNAL_FAILURE_MAX_CHARS
        ? `${message.slice(0, EXECUTION_JOURNAL_FAILURE_MAX_CHARS - 1)}…`
        : message;
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
    if (!(value.startsWith('{') && value.endsWith('}'))) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return isRecord(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function integer(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function nonEmptyText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
