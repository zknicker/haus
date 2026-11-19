import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult } from './truncate.ts';

export function tailNotice(truncation: TruncationResult, logPath: string, lastLineBytes: number) {
    const startLine = truncation.totalLines - truncation.outputLines + 1;
    const endLine = truncation.totalLines;
    if (truncation.lastLinePartial) {
        return `[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${formatSize(lastLineBytes)}). Full output: ${logPath}]`;
    }
    if (truncation.truncatedBy === 'lines') {
        return `[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. Full output: ${logPath}]`;
    }
    return `[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${logPath}]`;
}
