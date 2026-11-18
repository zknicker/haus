import { type CloudAgentPullRequestChange, cloudAgentPullRequestChangeSchema } from '@haus/api';

/** A change in a pull request that wakes its delegating Agent (ADR 0053 decision 6). */
export type PullRequestTransition = CloudAgentPullRequestChange['change'];

const changeKeyPattern = /^([^#\s]+\/[^#\s]+)#([1-9][0-9]*):([a-z_]+):([^:\s]+)$/u;

/**
 * The inbox dedupe key of one pull request wake, `<repo>#<number>:<change>:<headSha>`:
 * one wake per change and head. The change rides the key, so the attention can
 * say what changed without a column of its own.
 */
export function pullRequestChangeKey(
    pull: { headSha: string; number: number; repository: string },
    change: PullRequestTransition
): string {
    return `${pull.repository}#${pull.number}:${change}:${pull.headSha}`;
}

/** The change a `pull_request` notice's dedupe key names, or null for any other key. */
export function parsePullRequestChangeKey(key: string): CloudAgentPullRequestChange | null {
    const matched = changeKeyPattern.exec(key);
    if (!matched) {
        return null;
    }
    const parsed = cloudAgentPullRequestChangeSchema.safeParse({
        change: matched[3],
        url: `https://github.com/${matched[1]}/pull/${matched[2]}`,
    });
    return parsed.success ? parsed.data : null;
}
