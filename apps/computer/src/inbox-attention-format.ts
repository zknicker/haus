import { type CloudAgentBranch, TASK_TARGET_PATTERN } from '@haus/api';
import type {
    AgentCloudAgentWorkAttention,
    CloudAgentPullRequestChange,
} from './agent-inbox-item.ts';
import { indentContinuationLines } from './inbox-header-format.ts';

/**
 * A Cloud Agent Run's attention for the Agent that delegated it, with everything it needs to
 * inspect the result and decide what to post. Results are ordinary Messages; nothing here
 * reaches a human until the Agent writes one. Work attached to a Task wakes the Agent on that
 * Task (ADR 0052 decision 6), so its target is `task:<key>` and the attention names the Task.
 */
export function formatCloudAgentWorkAttention(
    work: AgentCloudAgentWorkAttention,
    target: string
): string {
    const branches = work.branches.map(formatCloudAgentBranch);
    const notice = work.notice === 'pull_request' ? ' notice=pull_request' : '';
    return [
        `[Haus cloud agent attention${notice} status=${work.status} work=${work.workId} run=${work.runId} target=${target}]`,
        indentContinuationLines(`${work.title} — ${work.repository} (${work.provider})`),
        ...(work.notice === 'pull_request' ? [pullRequestLine(work)] : []),
        `summary=${work.summary ? indentContinuationLines(work.summary) : '-'}`,
        `errorCode=${work.errorCode ?? work.stallCode ?? '-'}`,
        `branches=${branches.length > 0 ? branches.join(', ') : '-'}`,
        `url=${work.providerUrl ?? '-'}`,
        ...(work.status === 'pending_input'
            ? [
                  `The cloud agent stopped to ask the question in summary. Answer it yourself when the request settles it, or ask the requester first; send the answer with: haus cloud-agent send --work ${work.workId}`,
              ]
            : []),
        ...((work.status === 'completed' || work.status === 'failed') && work.hasFullReport === true
            ? [`More: haus cloud-agent inspect --work ${work.workId} --report`]
            : []),
        ...taskLine(target),
    ].join('\n');
}

/**
 * A pull request attached to a Task changed, with no cloud work behind it (ADR 0052 decision 6).
 * Same shape as a Run's `pull_request` attention: a header naming the change and target, the
 * change in plain words with its URL, then where to report.
 */
export function formatPullRequestNotice(
    notice: CloudAgentPullRequestChange,
    target: string
): string {
    const key = TASK_TARGET_PATTERN.exec(target)?.[1];
    const subject = key ? `Task ${key}` : target;
    return [
        `[Haus pull request attention change=${notice.change} target=${target}]`,
        `The pull request attached to ${subject} ${describeChange(notice.change)}: ${notice.url}`,
        ...(key ? [`Report what you learn in the Task: haus message send --target ${target}`] : []),
    ].join('\n');
}

/** The event-specific step: this work belongs to a Task, and what it learned is reported there. */
function taskLine(target: string): string[] {
    const key = TASK_TARGET_PATTERN.exec(target)?.[1];
    return key
        ? [
              `This work is for Task ${key}. Report what you learn in the Task: haus message send --target ${target}`,
          ]
        : [];
}

/**
 * A pull request moment after the Run settled: what changed and where. The change rides the
 * attention when the Server names it; otherwise the line says only that it changed.
 */
function pullRequestLine(work: AgentCloudAgentWorkAttention): string {
    const change = work.pullRequestChange;
    const url =
        change?.url ?? work.branches.find((branch) => branch.pullRequestUrl)?.pullRequestUrl;
    const what = change ? describeChange(change.change) : 'changed';
    return `Its pull request ${what} after the run settled: ${url ?? 'URL not recorded'}`;
}

function describeChange(change: CloudAgentPullRequestChange['change']): string {
    switch (change) {
        case 'ready_for_review':
            return 'is ready for review';
        case 'checks_passing':
            return 'has its checks passing';
        case 'checks_failing':
            return 'has failing checks';
        default:
            return change satisfies never;
    }
}

/**
 * One branch a Run wrote, with the pull request it opened and the diff the Computer read from
 * GitHub. The counts are evidence the Agent can act on without opening the pull request; a
 * branch whose pull request could not be read states the URL alone.
 */
function formatCloudAgentBranch(branch: CloudAgentBranch): string {
    const pullRequest = branch.pullRequest;
    const diff = pullRequest
        ? ` state=${pullRequest.state} files=${pullRequest.changedFiles} +${pullRequest.additions} -${pullRequest.deletions}`
        : '';
    const url = branch.pullRequestUrl ? ` pr=${branch.pullRequestUrl}` : '';
    return `${branch.repository}:${branch.branch}${url}${diff}`;
}
