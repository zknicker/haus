import type { AgentInboxAsk } from './agent-inbox-item.ts';
import { formatAskTag } from './inbox-ask-format.ts';

/**
 * One pending target, as both the content-free notice and `haus inbox check`
 * print it. The notice derives it from cached envelopes and the CLI from the
 * Server's peek row; rendering it in one place keeps the two surfaces from
 * drifting (Raft prints both with one row formatter too).
 */
export interface InboxTargetSummary {
    /** The latest item's Ask, when it is one. */
    ask: AgentInboxAsk | null;
    /** A settled Cloud Agent Run waits here, so the target counts work items. */
    cloudAgentResult: boolean;
    firstShortId: string;
    latestSender: string;
    latestShortId: string;
    mentioned: boolean;
    pendingCount: number;
    target: string;
    /** The latest item's task number, when it is a task. */
    taskNumber: number | null;
}

export function formatInboxTargetRow(row: InboxTargetSummary): string {
    const noun = row.cloudAgentResult ? 'work item' : 'message';
    return [
        row.target,
        `  pending: ${row.pendingCount} ${plural(row.pendingCount, noun)}`,
        ` · first msg=${row.firstShortId}`,
        ` · latest sender @${row.latestSender}`,
        ` · latest msg=${row.latestShortId}`,
        formatInboxTags(row),
    ].join('');
}

function formatInboxTags(row: InboxTargetSummary): string {
    const tags = [
        targetTag(row.target),
        row.taskNumber === null ? null : `task #${row.taskNumber}`,
        row.ask ? formatAskTag(row.ask) : null,
        row.cloudAgentResult ? 'cloud agent result' : null,
        row.mentioned ? 'you were mentioned' : null,
    ].filter(Boolean);
    return tags.length > 0 ? ` · ${tags.join(' · ')}` : '';
}

function targetTag(target: string): string | null {
    if (target.startsWith('dm:')) {
        return 'dm';
    }
    return target.includes(':') ? 'thread' : null;
}

function plural(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`;
}
