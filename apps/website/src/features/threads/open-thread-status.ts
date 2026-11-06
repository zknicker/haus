import type { OpenThread } from '@haus/api';
import { formatRelativeTime } from '../../lib/format.ts';

const quietAfterMs = 10 * 60_000;

/** The second line of a Thread row (specs/open-threads.md, State). */
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
        case 'waiting':
            return `${thread.actorName ? `Waiting on ${thread.actorName}` : 'Waiting for a reply'} · ${ago}`;
        case 'merged':
            return `Merged · ${ago}`;
        case 'pr-closed':
            return `PR closed · ${ago}`;
        case 'done':
            return `Done · ${ago}`;
        case 'recent':
            return `${thread.actorName ?? 'Someone'} replied · ${ago}`;
    }
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
