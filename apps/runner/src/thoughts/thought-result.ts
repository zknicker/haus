import { agentThoughtResultMaxLength } from '@haus/api';
import { scrubResultLine } from '@haus/computer/src/harness/thought-action-scrub.ts';
import { admitsResult, type ToolOperation } from './result-allowlist.ts';
import type { AgentThoughtNarrator } from './thought-narrator.ts';

const resultMinimumLength = 24;

const rawScanLength = 8000;

export function createToolFindings(thoughts: AgentThoughtNarrator) {
    const described = new Map<string, string>();
    return {
        clear() {
            described.clear();
        },
        finished(toolCallId: string, output: unknown, failed: boolean) {
            const action = described.get(toolCallId);
            described.delete(toolCallId);
            const result = action && !failed ? thoughtResultExcerpt(output) : null;
            if (action && result) {
                thoughts.observeAction(action, result);
            }
        },
        started(toolCallId: string, operation: ToolOperation, action: string | null) {
            thoughts.observeAction(action);
            if (action !== null && admitsResult(operation)) {
                described.set(toolCallId, action);
            }
        },
    };
}

export function thoughtResultExcerpt(output: unknown) {
    if (exitedWithFailure(output)) {
        return null;
    }
    const text = outputText(output, 0);
    if (!text) {
        return null;
    }
    const lines = text
        .slice(0, rawScanLength)
        .replace(/<[^>\n]{0,400}>/gu, ' ')
        .replace(/&(?:nbsp|amp|lt|gt|quot|#\d+);/gu, ' ')
        .split(/\r?\n/u)
        .map((line) => scrubResultLine(line.replace(/"/gu, '').replace(/[{}[\]\\]+/gu, ' ')))
        .map((line) =>
            line
                .replace(/\p{Cc}+/gu, ' ')
                .replace(/\s+/gu, ' ')
                .replace(/^[\s,:]+|[\s,]+$/gu, '')
        )
        .filter((line) => /\p{L}|\p{N}/u.test(line));
    const excerpt = capped(lines.join('\n'));
    return excerpt.replace(/\s+/gu, '').length >= resultMinimumLength ? excerpt : null;
}

function capped(text: string) {
    if (text.length <= agentThoughtResultMaxLength) {
        return text.trim();
    }
    return text
        .slice(0, agentThoughtResultMaxLength)
        .replace(/\s+\S*$/u, '')
        .trim();
}

function exitedWithFailure(output: unknown) {
    if (!isRecord(output)) {
        return false;
    }
    const code = output.exit_code ?? output.exitCode;
    return typeof code === 'number' && code !== 0;
}

const outputText: (output: unknown, depth: number) => string | null = (output, depth) => {
    if (typeof output === 'string') {
        return output.trim().length > 0 ? output : null;
    }
    if (depth > 3) {
        return null;
    }
    if (Array.isArray(output)) {
        const texts = output
            .map((item) => outputText(item, depth + 1))
            .filter((text): text is string => text !== null);
        return texts.length > 0 ? texts.join('\n') : null;
    }
    if (!isRecord(output)) {
        return null;
    }
    for (const key of textKeys) {
        const text = outputText(output[key], depth + 1);
        if (text) {
            return text;
        }
    }
    return null;
};

const textKeys = [
    'formatted_output',
    'aggregated_output',
    'stdout',
    'text',
    'content',
    'output',
    'result',
    'value',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
