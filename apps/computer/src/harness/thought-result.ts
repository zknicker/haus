import { agentThoughtResultMaxLength } from '@haus/api';
import type { ComputerAgentActivityCategory } from '../agent-activity.ts';
import type { ComputerToolClassification } from './activity-tool-fixtures.ts';
import { scrubResultLine } from './thought-action-scrub.ts';
import type { AgentThoughtNarrator } from './thought-narrator.ts';

/**
 * The work whose output may ride a thought as a finding (ADR 0036): commands,
 * web searches, pages, and tools. File reads and edits return file contents or
 * diffs, never a finding worth a bubble, so their output stays on the Computer.
 */
const resultCategories = new Set<ComputerAgentActivityCategory>([
    'browsing',
    'running_command',
    'searching_web',
    'using_tool',
]);

/** Below this, an excerpt is a status code or "ok", not a finding. */
const resultMinimumLength = 24;

/**
 * Whether a started action's output may later ride its thought. An action that
 * handles credentials (a secret-named flag, header, or variable survives
 * scrubbing by name: `GITHUB_TOKEN=…`), reads the environment or a secret
 * store, prints files from the shell, or is Haus bookkeeping (the `haus`
 * CLI, the Agent's memory, notes, or instructions) never sends output.
 */
export function describesResultAction(
    category: ComputerAgentActivityCategory,
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

/**
 * Offers a run's tool actions to its narrator: each started real action's
 * description at once (`haus` bookkeeping classifies as skip and has none), and a scrubbed excerpt of what it returned once it
 * finishes, so the Server can state a finding. Output from failed, file, or
 * secret-reading actions is never offered, and output itself never leaves here.
 */
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
        started(
            toolCallId: string,
            classification: ComputerToolClassification,
            action: string | null
        ) {
            thoughts?.observeAction(action);
            if (
                classification.outcome === 'activity' &&
                describesResultAction(classification.category, action)
            ) {
                described.set(toolCallId, action);
            }
        },
    };
}

/**
 * A scrubbed, capped excerpt of a finished tool's output for the Server to
 * state as a finding, or null when nothing presentable remains. Reads the
 * runtimes' text shapes (Codex `formatted_output`, a `stdout`, text content
 * parts, a plain string); a nonzero exit code is a failure, not a finding.
 * Markup, JSON punctuation, URLs' credentials and queries, emails, paths,
 * token-like strings, and secret-named or environment-style values go
 * (`thought-action-scrub.ts`). Never stored or logged.
 */
export function thoughtResultExcerpt(output: unknown): string | null {
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

// Output past this is never scanned, so a huge page costs nothing.
const rawScanLength = 8000;

/**
 * `env`, `printenv`, keychains, password managers, secret stores, dotenv
 * files, and any credential-named flag, header, or variable.
 */
const secretReadingAction =
    /(?:^|\s)(?:env|printenv|export|set|op|varlock|security|pass|gpg|ssh-keygen|keychain|aws configure|gcloud auth)(?:\s|$)|\.env\b|\.npmrc|\.netrc|credential|secret|passw|token|auth|bearer|cookie|api[-_]?key|id_rsa|\.pem\b|\.key\b/iu;

/**
 * A shell command that prints files (`cat`, `sed -n`, `grep`, `git diff`)
 * returns their contents, like a file read, so its output stays here too. Only
 * a leading program counts, so `curl … | grep Saturday` still states a finding.
 */
const fileReadingCommand =
    /(?:^|&&|\|\||;)\s*(?:sudo\s+)?(?:cat|head|tail|less|more|bat|sed|awk|nl|grep|egrep|fgrep|rg|ag|ack|diff|strings|xxd|hexdump|od|git\s+(?:show|diff|log|blame|grep|cat-file))(?:\s|$)/u;

/** The `haus` CLI inside a compound command, and the Agent's own memory, notes, and instructions. */
const bookkeepingAction =
    /(?:^|[\s;&|(])haus\s|MEMORY\.md|AGENTS\.md|CLAUDE\.md|(?:^|[\s/])notes\/|SKILL\.md/u;

function capped(text: string): string {
    if (text.length <= agentThoughtResultMaxLength) {
        return text.trim();
    }
    return text
        .slice(0, agentThoughtResultMaxLength)
        .replace(/\s+\S*$/u, '')
        .trim();
}

function exitedWithFailure(output: unknown): boolean {
    if (!isRecord(output)) {
        return false;
    }
    const code = output.exit_code ?? output.exitCode;
    return typeof code === 'number' && code !== 0;
}

/** The first text a runtime's output shape carries, depth-limited. */
function outputText(output: unknown, depth: number): string | null {
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
}

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
