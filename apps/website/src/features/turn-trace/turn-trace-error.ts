import type { AgentExecutionJournalFailure } from '@haus/api';
import { readRecord, readString } from './turn-trace-values.ts';

/** A failure as a person reads it: the message, and the exit code when a command set one. */
export interface TurnTraceError {
    readonly exitCode: number | null;
    readonly message: string;
}

/**
 * A failed call's or turn's readable error: Computer's normalized `failure`
 * when it journaled one, otherwise the raw `error` read through
 * {@link readTraceError}. A failure with nothing to say still says it failed.
 */
export function readFailure(
    failure: AgentExecutionJournalFailure | undefined,
    error: unknown
): TurnTraceError {
    if (failure) {
        return { exitCode: failure.exitCode ?? null, message: failure.message };
    }
    return readTraceError(error) ?? { exitCode: null, message: 'The call failed.' };
}

const toolUseErrorWrapper = /^<tool_use_error>([\s\S]*?)(?:<\/tool_use_error>)?$/u;
const stackFrame = /^\s+at\s/u;

/**
 * The one seam that turns a runtime's raw error payload into readable text.
 *
 * Runtimes deliver errors in their own wire shapes: codex-acp's shell failure is
 * `{ formatted_output, exit_code }`, Claude Code wraps tool errors in
 * `<tool_use_error>…</tool_use_error>`, and a harness failure is a thrown
 * `Error` string with its stack. Once Computer journals a normalized
 * `{ message, exitCode? }`, that shape already passes through here unchanged and
 * the runtime-specific branches can be deleted.
 */
export function readTraceError(value: unknown): TurnTraceError | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === 'string') {
        const message = cleanMessage(value);
        return message ? { exitCode: null, message } : null;
    }
    const record = readRecord(value);
    if (!record) {
        return { exitCode: null, message: String(value) };
    }
    const exitCode = readExitCode(record.exitCode ?? record.exit_code);
    const text =
        readString(record.message) ??
        readString(record.formatted_output) ??
        readString(record.stderr) ??
        readString(record.output) ??
        readString(record.error);
    if (text) {
        return { exitCode, message: cleanMessage(text) || text };
    }
    if (exitCode !== null) {
        return { exitCode, message: `Exited with code ${exitCode}` };
    }
    return { exitCode: null, message: JSON.stringify(value) };
}

/** Unwraps a tool-error envelope and drops a thrown error's stack and `Error:` prefix. */
function cleanMessage(raw: string): string {
    const unwrapped = toolUseErrorWrapper.exec(raw.trim())?.[1] ?? raw;
    const lines = unwrapped.trim().split('\n');
    const firstFrame = lines.findIndex((line) => stackFrame.test(line));
    const message = (firstFrame === -1 ? lines : lines.slice(0, firstFrame)).join('\n').trim();
    return message.replace(/^(?:Error:\s*)+/u, '').trim();
}

function readExitCode(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
