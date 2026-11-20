import { type AgentActivityCategory, agentThoughtResultMaxLength } from '@haus/api';
import { scrubResultLine } from './thought-action-scrub.ts';
import type { AgentThoughtNarrator } from './thought-narrator.ts';
const resultCategories = new Set<AgentActivityCategory>([
    'browsing',
    'running_command',
    'searching_web',
    'using_tool',
]);
const resultMinimumLength = 24;
export function describesResultAction(
    category: AgentActivityCategory,
    description: string | null
): description is string {
    return (
        description !== null &&
        resultCategories.has(category) &&
        !secretReadingAction.test(description) &&
        !fileReadingCommand.test(description) &&
        !bookkeepingAction.test(description)
    );
}
export function createToolFindings(thoughts: AgentThoughtNarrator | undefined) {
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
                thoughts?.observeAction(action, result);
            }
        },
        started(toolCallId: string, category: AgentActivityCategory | null, action: string | null) {
            thoughts?.observeAction(action);
            if (category && describesResultAction(category, action)) {
                described.set(toolCallId, action);
            }
        },
    };
}
export function thoughtResultExcerpt(output: unknown) {
    if (exitedWithFailure(output)) {
        return null;
    }
    const text: string | null = outputText(output, 0);
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
const rawScanLength = 8000;
const secretReadingAction =
    /(?:^|\s)(?:env|printenv|export|set|op|varlock|security|pass|gpg|ssh-keygen|keychain|aws configure|gcloud auth)(?:\s|$)|\.env\b|\.npmrc|\.netrc|credential|secret|passw|token|auth|bearer|cookie|api[-_]?key|id_rsa|\.pem\b|\.key\b/iu;
const fileReadingCommand =
    /(?:^|&&|\|\||;)\s*(?:sudo\s+)?(?:cat|head|tail|less|more|bat|sed|awk|nl|grep|egrep|fgrep|rg|ag|ack|diff|strings|xxd|hexdump|od|git\s+(?:show|diff|log|blame|grep|cat-file))(?:\s|$)/u;
const bookkeepingAction =
    /(?:^|[\s;&|(])haus\s|MEMORY\.md|AGENTS\.md|CLAUDE\.md|(?:^|[\s/])notes\/|SKILL\.md/u;

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
        const texts: string[] = [];
        for (const item of output) {
            const text: string | null = outputText(item, depth + 1);
            if (text !== null) {
                texts.push(text);
            }
        }
        return texts.length > 0 ? texts.join('\n') : null;
    }
    if (!isRecord(output)) {
        return null;
    }
    for (const key of textKeys) {
        const text: string | null = outputText(output[key], depth + 1);
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
