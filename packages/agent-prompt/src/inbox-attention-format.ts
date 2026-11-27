import { TASK_TARGET_PATTERN } from '@haus/api';
import type { PullRequestChange } from './agent-inbox-item.ts';

export function formatPullRequestNotice(notice: PullRequestChange, target: string) {
    return [
        `[pull request · ${subjectOf(target)} · ${describeChange(notice.change)}]`,
        `The pull request attached to ${subjectOf(target)} ${describeChange(notice.change)}: ${notice.url}`,
        `Post what you learn in the Task: haus message send --target ${target}`,
    ].join('\n');
}

function subjectOf(target: string) {
    return TASK_TARGET_PATTERN.exec(target)?.[1] ?? target;
}

function describeChange(change: PullRequestChange['change']) {
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
