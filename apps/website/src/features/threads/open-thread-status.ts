import type { OpenThread } from '@haus/api';
import { formatRelativeTime } from '../../lib/format.ts';

const quietAfterMs = 10 * 60_000;

/** A Thread's status line (specs/open-threads.md, State): the Threads page's second line, the sidebar row's tooltip. */
export function openThreadStatusLine(thread: OpenThread, now = Date.now()): string {
    const ago = formatRelativeTime(thread.at, now);
    switch (thread.state) {
        case 'unread':
            return `${thread.actorName ?? 'Someone'} ${thread.mentionsViewer ? 'mentioned you' : 'replied'} · ${ago}`;
        case 'job-failed':
            return 'Job failed';
        case 'checks-failing':
            return 'Checks failing';
        case 'changes-requested':
            return 'Changes requested';
        case 'approved':
            return 'Approved';
        case 'ready-for-review':
            return 'Ready for review';
        case 'working':
            return workingLine(thread, ago, now);
        case 'needs-input':
            return 'Needs input';
        case 'checks-running':
            return 'Checks running';
        case 'draft':
            return 'Draft';
        case 'merged':
            return `Merged · ${ago}`;
        case 'pr-closed':
            return `PR closed · ${ago}`;
        case 'done':
            return `Done · ${ago}`;
        case 'active':
        case 'recent':
            return `${thread.actorName ?? 'Someone'} replied · ${ago}`;
    }
}

/** A sidebar row's trailing age of the Thread's newest Message: `now`, `47m`, `3h`, `2d`. */
export function openThreadAge(
    thread: Pick<OpenThread, 'at' | 'lastActivityAt' | 'updatedAt'>,
    now = Date.now()
) {
    // A Thread nobody has written in still has its work's own time.
    const moment = thread.lastActivityAt ?? thread.updatedAt ?? thread.at;
    if (!moment) {
        return null;
    }
    const relative = formatRelativeTime(moment, now);
    return relative === 'just now' ? 'now' : relative.replace(/ ago$/u, '');
}

function workingLine(thread: OpenThread, ago: string, now: number) {
    if (thread.jobCount > 1) {
        return `${thread.jobCount} jobs · ${thread.liveJobCount} working`;
    }
    const updatedAt = thread.updatedAt ? Date.parse(thread.updatedAt) : null;
    if (updatedAt !== null && now - updatedAt > quietAfterMs) {
        return `No update in ${formatRelativeTime(thread.updatedAt, now).replace(/ ago$/u, '')}`;
    }
    return `Working · ${ago}`;
}
