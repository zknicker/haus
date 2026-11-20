import { TASK_TARGET_PATTERN, type WorkerBranch } from '@haus/api';
import type { AgentWorkerAttention, WorkerPullRequestChange } from './agent-inbox-item.ts';
import { indentContinuationLines } from './inbox-header-format.ts';

export function formatWorkerAttention(work: AgentWorkerAttention, target: string) {
    return work.notice === 'stall'
        ? formatStall(work, target)
        : formatWorkerPullRequest(work, target);
}

export function formatPullRequestNotice(notice: WorkerPullRequestChange, target: string) {
    return [
        `[pull request · ${subjectOf(target)} · ${describeChange(notice.change)}]`,
        `The pull request attached to ${subjectOf(target)} ${describeChange(notice.change)}: ${notice.url}`,
        reportLine(target),
    ].join('\n');
}

function formatStall(work: AgentWorkerAttention, target: string) {
    const branches = work.branches.map(formatWorkerBranch);
    return [
        `[worker stall · ${subjectOf(target)} · Worker on ${work.place} (${work.workerId}) · turn ${work.turnId}]`,
        indentContinuationLines(`${work.title} — ${work.repository}`),
        work.stallCode ? stallReasons[work.stallCode] : 'The turn is stuck without settling.',
        ...(work.summary ? [indentContinuationLines(work.summary)] : []),
        ...(branches.length > 0 ? [`Branches: ${branches.join(', ')}`] : []),
        ...(work.providerUrl ? [`Provider: ${work.providerUrl}`] : []),
        `Nothing settled, so nothing was posted. Wait, stop it with haus worker stop --worker ${work.workerId}, or replace its waiting follow-up with haus worker send --worker ${work.workerId} --interrupt.`,
    ].join('\n');
}

function formatWorkerPullRequest(work: AgentWorkerAttention, target: string) {
    const change = work.pullRequestChange;
    const url =
        change?.url ?? work.branches.find((branch) => branch.pullRequestUrl)?.pullRequestUrl;
    const what = change ? describeChange(change.change) : 'changed';
    return [
        `[pull request · ${subjectOf(target)} · ${what} · Worker on ${work.place} (${work.workerId})]`,
        `The pull request from ${indentContinuationLines(work.title)} ${what} after the Worker's turn settled: ${url ?? 'URL not recorded'}`,
        reportLine(target),
    ].join('\n');
}

function subjectOf(target: string) {
    return TASK_TARGET_PATTERN.exec(target)?.[1] ?? target;
}

function reportLine(target: string) {
    return `Post what you learn in the Task: haus message send --target ${target}`;
}

function describeChange(change: WorkerPullRequestChange['change']) {
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

const stallReasons = {
    'claude-prompt-not-found':
        "Claude's session log is too large to find this turn in it, so Haus cannot tell when it finishes.",
    'followup-auto-interrupt-failed':
        'Haus interrupted the hosted session to deliver a follow-up, and it still did not go through. Haus keeps retrying.',
} as const;

function formatWorkerBranch(branch: WorkerBranch) {
    const pullRequest = branch.pullRequest;
    const diff = pullRequest
        ? ` state=${pullRequest.state} files=${pullRequest.changedFiles} +${pullRequest.additions} -${pullRequest.deletions}`
        : '';
    const url = branch.pullRequestUrl ? ` pr=${branch.pullRequestUrl}` : '';
    return `${branch.repository}:${branch.branch}${url}${diff}`;
}
