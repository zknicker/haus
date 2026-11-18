import type { CloudAgentBranch } from '@haus/api';
import type { CloudAgentProviderObservation } from '../provider.ts';
import type { ClaudeLogEntry } from './session-events.ts';

type Entry<Kind extends ClaudeLogEntry['kind']> = Extract<ClaudeLogEntry, { kind: Kind }>;

/** Cost, tokens, and the pull request Claude opened, across every turn of this Run. */
export function evidence(
    entries: ClaudeLogEntry[]
): Pick<CloudAgentProviderObservation, 'branches' | 'usage'> {
    const results = entries.filter((entry): entry is Entry<'result'> => entry.kind === 'result');
    const branch = pullRequestBranch(entries);
    return {
        ...(branch ? { branches: [branch] } : {}),
        ...(results.length > 0
            ? {
                  usage: {
                      costUsd: results.some((result) => result.costUsd !== null)
                          ? results.reduce((total, result) => total + (result.costUsd ?? 0), 0)
                          : null,
                      inputTokens: results.reduce((total, result) => total + result.usage.input, 0),
                      outputTokens: results.reduce(
                          (total, result) => total + result.usage.output,
                          0
                      ),
                  },
              }
            : {}),
    };
}

const pullRequestUrl = /https:\/\/github\.com\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/pull\/\d+/gu;
const pushedBranch =
    /\bgit\s+push\b[^\n;&|]*?\s(?:origin|-u\s+origin|--set-upstream\s+origin)\s+(?:HEAD:)?([A-Za-z0-9._/-]+)/u;

/**
 * Claude reports no branch record, so the branch is the one its own `git push`
 * named and the pull request is the last GitHub link it wrote. Both or neither:
 * a branch without its repository cannot be recorded truthfully.
 */
function pullRequestBranch(entries: ClaudeLogEntry[]): CloudAgentBranch | null {
    let url: { repository: string; value: string } | null = null;
    let branch: string | null = null;
    for (const entry of entries) {
        const text =
            entry.kind === 'assistant-text'
                ? entry.text
                : entry.kind === 'result'
                  ? (entry.text ?? '')
                  : '';
        for (const match of text.matchAll(pullRequestUrl)) {
            url = { repository: match[1] as string, value: match[0] };
        }
        const command =
            entry.kind === 'tool-use'
                ? (entry.input as { command?: unknown } | null)?.command
                : null;
        const pushed = typeof command === 'string' ? pushedBranch.exec(command)?.[1] : undefined;
        if (pushed) {
            branch = pushed;
        }
    }
    return url && branch ? { branch, pullRequestUrl: url.value, repository: url.repository } : null;
}
