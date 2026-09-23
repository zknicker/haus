import type { CloudAgentBranch } from '@haus/api';
import type { UnreadElsewhere } from './agent-commands.ts';
import type { AgentCloudAgentWorkAttention, AgentInboxItem } from './agent-inbox-item.ts';
import { formatAskMarker } from './inbox-ask-format.ts';
import { formatInboxTime, shortInboxId } from './inbox-header-format.ts';
import { formatInboxTargetRow } from './inbox-target-row.ts';
import { formatInlineReplyContext } from './inline-reply-format.ts';
import { formatThreadContext, renderedThreadContexts } from './thread-context-format.ts';

const deliveryTrailer = [
    'Respond as appropriate. Complete all your work before stopping.',
    "Each message's `target` identifies the conversation where it was asked.",
].join('\n');

/** Exact model-visible drain shape from specs/inbox.md. */
export function composeInboxDrain(items: AgentInboxItem[], homeTimezone = 'UTC'): string {
    if (items.length === 0) {
        return 'Start.';
    }
    const contexts = renderedThreadContexts(items);
    return [
        items.length === 1 ? 'New message received:' : 'New messages received:',
        '',
        ...items.map((item) => {
            const envelope = formatEnvelope(item, homeTimezone);
            const context = contexts.get(item.id);
            return context
                ? `${formatThreadContext(context, homeTimezone)}\n\n${envelope}`
                : envelope;
        }),
        '',
        deliveryTrailer,
    ].join('\n');
}

/**
 * Raft's per-wake digest of queued work the frame itself does not carry. It is
 * counts only, it advances nothing, and an empty list renders nothing at all.
 */
export function formatUnreadElsewhere(entries: UnreadElsewhere[]): string | null {
    if (entries.length === 0) {
        return null;
    }
    return [
        'You also have unread messages in other channels:',
        ...entries.map((entry) => `- ${entry.target}: ${entry.count} unread`),
        'Use the inbox/read commands at a natural breakpoint if you choose to inspect those targets.',
    ].join('\n');
}

/** Content-free, target-level busy notice. Bodies never enter this projection. */
export function composeInboxNotice(
    items: AgentInboxItem[],
    totalPending = items.length
): string | null {
    if (items.length === 0) {
        return null;
    }
    const hasAttention = items.some(isAttention);
    const targets = new Map<string, AgentInboxItem[]>();
    for (const item of items) {
        const rows = targets.get(item.target) ?? [];
        rows.push(item);
        targets.set(item.target, rows);
    }
    const lines = [...targets.entries()].map(([target, rows]) => {
        const ordered = [...rows].sort(compareItems);
        const first = ordered[0];
        const latest = ordered.at(-1);
        if (!(first && latest)) {
            throw new Error('Inbox notice target cannot be empty.');
        }
        return formatInboxTargetRow({
            ask: latest.ask ?? null,
            cloudAgentResult: ordered.some(isAttention),
            firstShortId: shortInboxId(first.id),
            latestSender: latest.senderHandle,
            latestShortId: shortInboxId(latest.id),
            mentioned: ordered.some((item) => item.mentioned),
            pendingCount: ordered.length,
            target,
            taskNumber: latest.task?.number ?? null,
        });
    });
    return [
        '[Haus inbox notice:',
        hasAttention
            ? `Inbox update: ${totalPending} pending ${plural(totalPending, 'work item')} total; ${targets.size} changed ${plural(targets.size, 'target')}`
            : `Inbox update: ${totalPending} unread ${plural(totalPending, 'message')} total; ${targets.size} changed ${plural(targets.size, 'target')}`,
        ...lines,
        ']',
    ].join('\n');
}

function plural(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`;
}

function formatEnvelope(item: AgentInboxItem, homeTimezone: string): string {
    if (item.cloudAgentWork) {
        return formatCloudAgentWorkAttention(item.cloudAgentWork, item.target);
    }
    const sender = item.senderDescription
        ? `@${item.senderHandle} — ${item.senderDescription}`
        : `@${item.senderHandle}`;
    const task = item.task
        ? ` task=#${item.task.number}:${item.task.status}:${taskAssignee(item)}`
        : '';
    const ask = item.ask ? formatAskMarker(item.ask) : '';
    const mention = item.mentioned ? ' mentioned=true' : '';
    const envelope =
        `[target=${item.target} msg=${shortInboxId(item.id)} time=${formatInboxTime(item.createdAt, homeTimezone)} type=${item.senderType}${task}${ask}${mention}] ` +
        `${sender}: ${item.content}${formatAttachmentSuffix(messageAttachments(item))}${formatInlineReplyContext(item.reply)}`;
    return item.threadFollowReactivated
        ? `${formatThreadFollowRestoration(item.target)}\n${envelope}`
        : envelope;
}

/**
 * The settled Run an Agent delegated, with everything it needs to inspect the
 * result and decide what to post. Results are ordinary Messages; nothing here
 * reaches a human until the Agent writes one.
 */
function formatCloudAgentWorkAttention(work: AgentCloudAgentWorkAttention, target: string): string {
    const branches = work.branches.map(formatCloudAgentBranch);
    return [
        `[Haus cloud agent attention status=${work.status} work=${work.workId} run=${work.runId} target=${target}]`,
        `${work.title} — ${work.repository} (${work.provider})`,
        `summary=${work.summary ?? '-'}`,
        `errorCode=${work.errorCode ?? '-'}`,
        `branches=${branches.length > 0 ? branches.join(', ') : '-'}`,
        `url=${work.providerUrl ?? '-'}`,
    ].join('\n');
}

/**
 * One branch a Run wrote, with the pull request it opened and the diff the
 * Computer read from GitHub. The counts are evidence the Agent can act on
 * without opening the pull request; a branch whose pull request could not be
 * read states the URL alone.
 */
function formatCloudAgentBranch(branch: CloudAgentBranch): string {
    const pullRequest = branch.pullRequest;
    const diff = pullRequest
        ? ` state=${pullRequest.state} files=${pullRequest.changedFiles} +${pullRequest.additions} -${pullRequest.deletions}`
        : '';
    const url = branch.pullRequestUrl ? ` pr=${branch.pullRequestUrl}` : '';
    return `${branch.repository}:${branch.branch}${url}${diff}`;
}

/**
 * Raft's attachment suffix, from its one owner here: every envelope and history
 * line that carries a Message's attachments prints them the same way. An
 * attachment missing its id or filename is counted rather than guessed at.
 */
export function formatAttachmentSuffix(attachments: readonly unknown[]): string {
    if (attachments.length === 0) {
        return '';
    }
    const described = attachments.flatMap((attachment) => {
        const record = attachment as { filename?: unknown; id?: unknown } | null;
        return typeof record?.id === 'string' && typeof record.filename === 'string'
            ? [`${record.filename} (id:${record.id})`]
            : [];
    });
    const count = attachments.length;
    const noun = count === 1 ? 'attachment' : 'attachments';
    if (described.length !== count) {
        return ` [${count} ${noun}]`;
    }
    return ` [${count} ${noun}: ${described.join(', ')} — use haus attachment view to download]`;
}

/** The drained item's cached canonical Message carries its attachments. */
function messageAttachments(item: AgentInboxItem): readonly unknown[] {
    const attachments = item.message?.attachments;
    return Array.isArray(attachments) ? attachments : [];
}

export function formatThreadFollowRestoration(target: string): string {
    return [
        `[Haus thread follow restored: this @mention re-subscribed you to ordinary replies in ${target}.]`,
        `To stop those replies again: haus thread unfollow --target "${target}"`,
    ].join('\n');
}

function taskAssignee(item: AgentInboxItem): string {
    if (!item.task) {
        return 'unassigned';
    }
    return item.task.assigneeAgentId ?? item.task.assigneeUserId ?? 'unassigned';
}

/** A bodiless typed attention: work to act on, not a message to read. */
function isAttention(item: AgentInboxItem): boolean {
    return Boolean(item.cloudAgentWork);
}

function compareItems(left: AgentInboxItem, right: AgentInboxItem): number {
    return (
        left.createdAt.localeCompare(right.createdAt) ||
        left.sequence - right.sequence ||
        left.id.localeCompare(right.id)
    );
}
