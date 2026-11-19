import { type WorkerBranch, TASK_TARGET_PATTERN } from '@haus/api';
import type { AgentWorkerAttention, WorkerPullRequestChange } from './agent-inbox-item.ts';
import { indentContinuationLines } from './inbox-header-format.ts';

export function formatWorkerAttention(work: AgentWorkerAttention, target: string): string {
    const branches = work.branches.map(formatWorkerBranch);
    const notice = work.notice === 'pull_request' ? ' notice=pull_request' : '';
    return [
        `[Haus Worker attention${notice} status=${work.status} work=${work.workerId} run=${work.turnId} target=${target}]`,
        indentContinuationLines(`${work.title} — ${work.repository} (${work.provider})`),
        ...(work.notice === 'pull_request' ? [pullRequestLine(work)] : []),
        `summary=${work.summary ? indentContinuationLines(work.summary) : '-'}`,
        `errorCode=${work.errorCode ?? work.stallCode ?? '-'}`,
        `branches=${branches.length > 0 ? branches.join(', ') : '-'}`,
        `url=${work.providerUrl ?? '-'}`,
        ...(work.status === 'pending_input'
            ? [
                  `The Worker stopped to ask the question in summary. Answer it yourself when the request settles it, or ask the requester first; send the answer with: haus worker send --work ${work.workerId}`,
              ]
            : []),
        ...((work.status === 'completed' || work.status === 'failed') && work.hasFullReport === true
            ? [`More: haus worker inspect --work ${work.workerId} --report`]
            : []),
        ...taskLine(target),
    ].join('\n');
}

export function formatPullRequestNotice(notice: WorkerPullRequestChange, target: string): string {
    const key = TASK_TARGET_PATTERN.exec(target)?.[1];
    const subject = key ? `Task ${key}` : target;
    return [
        `[Haus pull request attention change=${notice.change} target=${target}]`,
        `The pull request attached to ${subject} ${describeChange(notice.change)}: ${notice.url}`,
        ...(key ? [`Report what you learn in the Task: haus message send --target ${target}`] : []),
    ].join('\n');
}

function taskLine(target: string): string[] {
    const key = TASK_TARGET_PATTERN.exec(target)?.[1];
    return key
        ? [
              `This work is for Task ${key}. Report what you learn in the Task: haus message send --target ${target}`,
          ]
        : [];
}

function pullRequestLine(work: AgentWorkerAttention): string {
    const change = work.pullRequestChange;
    const url =
        change?.url ?? work.branches.find((branch) => branch.pullRequestUrl)?.pullRequestUrl;
    const what = change ? describeChange(change.change) : 'changed';
    return `Its pull request ${what} after the run settled: ${url ?? 'URL not recorded'}`;
}

function describeChange(change: WorkerPullRequestChange['change']): string {
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

function formatWorkerBranch(branch: WorkerBranch): string {
    const pullRequest = branch.pullRequest;
    const diff = pullRequest
        ? ` state=${pullRequest.state} files=${pullRequest.changedFiles} +${pullRequest.additions} -${pullRequest.deletions}`
        : '';
    const url = branch.pullRequestUrl ? ` pr=${branch.pullRequestUrl}` : '';
    return `${branch.repository}:${branch.branch}${url}${diff}`;
}
