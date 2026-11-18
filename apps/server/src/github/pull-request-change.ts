import { type CloudAgentPullRequestChange, cloudAgentPullRequestChangeSchema } from '@haus/api';

export type PullRequestTransition = CloudAgentPullRequestChange['change'];

const changeKeyPattern = /^([^#\s]+\/[^#\s]+)#([1-9][0-9]*):([a-z_]+):([^:\s]+)$/u;

export function pullRequestChangeKey(
    pull: { headSha: string; number: number; repository: string },
    change: PullRequestTransition
): string {
    return `${pull.repository}#${pull.number}:${change}:${pull.headSha}`;
}

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
