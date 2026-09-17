import type { CloudAgentBranch } from '@haus/api';
import type {
    AgentCloudAgentWorkAttention,
    AgentInboxAsk,
    AgentInboxItem,
} from './agent-inbox-item.ts';
import { formatInlineReplyContext } from './inline-reply-format.ts';

const deliveryTrailer = [
    'Respond as appropriate. Complete all your work before stopping.',
    "Each message's `target` identifies the conversation where it was asked.",
].join('\n');

/** Exact model-visible drain shape from specs/inbox.md. */
export function composeInboxDrain(items: AgentInboxItem[], homeTimezone = 'UTC'): string {
    if (items.length === 0) {
        return 'Start.';
    }
    return [
        items.length === 1 ? 'New message received:' : 'New messages received:',
        '',
        ...items.map((item) => formatEnvelope(item, homeTimezone)),
        '',
        deliveryTrailer,
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
        return [
            target,
            `  pending: ${ordered.length} ${plural(ordered.length, ordered.some(isAttention) ? 'work item' : 'message')}`,
            ` · first msg=${shortInboxId(first.id)}`,
            ` · latest sender @${latest.senderHandle}`,
            ` · latest msg=${shortInboxId(latest.id)}`,
            noticeTag(target, ordered),
        ].join('');
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
        `[target=${item.target} msg=${shortInboxId(item.id)} time=${formatLocalTime(item.createdAt, homeTimezone)} type=${item.senderType}${task}${ask}${mention}] ` +
        `${sender}: ${item.content}${formatInlineReplyContext(item.reply)}`;
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
 * One owner of Ask presentation. The delivery envelope, the drain envelope, and
 * the busy notice read the same status and addressee; only the grammar differs.
 */
export function formatAskSuffix(ask: AgentInboxAsk): string {
    return ` [ask status=${ask.status}${askAddressee(ask)}]`;
}

/** The notice tag: content-free, and shaped like the `task #N` tag beside it. */
export function formatAskTag(ask: AgentInboxAsk): string {
    return `ask ${ask.status}${askAddressee(ask)}`;
}

/** The drain marker: compressed like the `task=#N:status:assignee` marker beside it. */
export function formatAskMarker(ask: AgentInboxAsk): string {
    const handle = askHandle(ask);
    return ` ask=${ask.status}${handle ? `:${handle}` : ''}`;
}

function askAddressee(ask: AgentInboxAsk): string {
    const handle = askHandle(ask);
    return handle ? ` to=${handle}` : '';
}

function askHandle(ask: AgentInboxAsk): string | null {
    return ask.addresseeHandle ? `@${ask.addresseeHandle}` : null;
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

function formatLocalTime(timestamp: string, homeTimezone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
        timeZone: homeTimezone,
        year: 'numeric',
    }).formatToParts(new Date(timestamp));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
}

function noticeTag(target: string, items: AgentInboxItem[]): string {
    const latest = items.at(-1);
    const tags = [
        target.startsWith('dm:') ? 'dm' : target.includes(':') ? 'thread' : null,
        latest?.task ? `task #${latest.task.number}` : null,
        latest?.ask ? formatAskTag(latest.ask) : null,
        items.some((item) => item.cloudAgentWork) ? 'cloud agent result' : null,
        items.some((item) => item.mentioned) ? 'you were mentioned' : null,
    ].filter(Boolean);
    return tags.length > 0 ? ` · ${tags.join(' · ')}` : '';
}

/**
 * An id that addresses no Chat message: a Trigger fire (`trf_…`), a Reminder
 * fire (`rmf_…`), or a Cloud Agent Run (`car_…`). None of them can be read,
 * threaded on, reacted to, or handed to `--message-id`. Each carries the id
 * that does work on its own envelope line instead — a fire's `fire=<id>` and
 * `--cause <fireId>`, a Run's `work=` and `run=`.
 */
function isBodilessInboxId(id: string): boolean {
    return /^(?:car|rmf|trf)_/u.test(id);
}

/**
 * The `msg=` short id every inbox surface prints, for messages and for the
 * bodiless items alike. A compound assignment key
 * (`task-assign:<messageId>:<version>`) shortens to the task message it hands
 * over, which is the id the Agent can actually address — reading it, threading
 * on it, or reacting to it. A fire has no such message, so it prints `-`
 * rather than an id the Agent would spend a failed command on.
 */
export function shortInboxId(id: string): string {
    if (isBodilessInboxId(id)) {
        return '-';
    }
    const assignment = /^task-assign:(?<messageId>[^:]+):/u.exec(id);
    const subject = assignment?.groups?.messageId ?? id;
    return subject.replace(/^[a-z]+_/u, '').slice(0, 8) || '-';
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
