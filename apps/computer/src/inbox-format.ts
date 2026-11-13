import type { AgentTaskAssignment, CloudAgentBranch } from '@haus/api';
import type { UnreadElsewhere } from './agent-commands.ts';
import type { AgentCloudAgentWorkAttention, AgentInboxItem } from './agent-inbox-item.ts';
import {
    formatInboxTimeFields,
    formatSenderLabel,
    inboxBodyText,
    indentContinuationLines,
    shortInboxId,
} from './inbox-header-format.ts';
import { formatInboxTargetRow } from './inbox-target-row.ts';
import { formatInlineReplyContext } from './inline-reply-format.ts';
import { formatThreadContext, renderedThreadContexts } from './thread-context-format.ts';

const deliveryTrailer = [
    'Respond as appropriate. Complete all your work before stopping.',
    "Each message's `target` identifies the conversation where it was asked.",
].join('\n');

/**
 * Notice-handling guidance rides the notice, as Raft's `formatInboxUpdateRuntimeInput` carries
 * it, so the standing prompt keeps only collaboration principles. The first line is Raft
 * db5e399's closing line; the second carries the specs/inbox.md §Notices guarantees Raft does
 * not state: bodies withheld, not absent; not a request; read them before you stop.
 */
const noticeGuidance = [
    "These messages have not been read. Choose when to read them: `haus message read --target <target> --unread` reads one conversation's unread messages; `haus message check` reads all of them.",
    'Their bodies are withheld to avoid flooding you, not absent. The notice is not itself a request, so do not acknowledge it. If what you read is higher priority, pivot to it; otherwise continue your current work. Deferral needs no visible reply and the messages remain queryable; read them before you stop.',
].join('\n');

/** Assignments are concrete work: they arrive in a turn of their own, so nothing is pulled. */
const taskAssignmentNoticeGuidance =
    'Their details arrive in your next turn. Keep working; the notice is not itself a request, so do not acknowledge it.';

/**
 * The command shapes ride the event; the pacing principle stays in the prompt. `haus task list`
 * rather than the lines above, because these are only what just arrived, not the whole queue.
 */
const taskAssignmentGuidance =
    'Take the next Task from `haus task list`, skipping any blocked on a person. `haus task show <key>` prints its details and columns; move it to an active column with `haus task move <key> --column <name>`, then work it.';

/** Exact model-visible drain shape from specs/inbox.md. */
export function composeInboxDrain(items: AgentInboxItem[]): string {
    if (items.length === 0) {
        return 'Start.';
    }
    const contexts = renderedThreadContexts(items);
    return [
        items.length === 1 ? 'New message received:' : 'New messages received:',
        '',
        ...items.map((item) => {
            const envelope = formatEnvelope(item);
            const context = contexts.get(item.id);
            return context ? `${formatThreadContext(context)}\n\n${envelope}` : envelope;
        }),
        '',
        ...openClaimLines(items),
        deliveryTrailer,
    ].join('\n');
}

/**
 * Haus-only: names the claim command for each open claim the drain carries, so claim-before-reply
 * rides the event that needs it instead of the standing prompt's general claim rule.
 */
function openClaimLines(items: AgentInboxItem[]): string[] {
    return items.flatMap((item) =>
        item.claim?.status === 'todo'
            ? [
                  `Claim #${item.claim.number} is open: if it is yours to take, claim it with \`haus claim --target "${item.target}" --number ${item.claim.number}\` before you reply or start work.`,
              ]
            : []
    );
}

/**
 * Raft's per-wake digest of queued work the frame itself does not carry, in Raft 26f77ef's
 * wording (`formatOtherUnreadChannelsSuffix`). It is
 * counts only, it advances nothing, and an empty list renders nothing at all.
 */
export function formatUnreadElsewhere(entries: UnreadElsewhere[]): string | null {
    if (entries.length === 0) {
        return null;
    }
    return [
        'You also have unread messages in other channels:',
        ...entries.map((entry) => `- ${entry.target}: ${entry.count} unread`),
        'Run `haus inbox check` at a natural breakpoint if you choose to inspect those targets; it lists every unread conversation with the command that opens it.',
    ].join('\n');
}

/**
 * Content-free, target-level notice, closed by its handling guidance. Bodies never enter this
 * projection. Queued Task assignments, which have no target to list under, add one count line.
 */
export function composeInboxNotice(
    items: AgentInboxItem[],
    totalPending = items.length,
    taskAssignments = 0
): string | null {
    const taskLines =
        taskAssignments > 0
            ? [`${taskAssignments} ${plural(taskAssignments, 'task')} assigned to you`]
            : [];
    if (items.length === 0) {
        return taskLines.length > 0
            ? ['[Haus inbox notice:', ...taskLines, ']', taskAssignmentNoticeGuidance].join('\n')
            : null;
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
            claimNumber: latest.claim?.number ?? null,
            cloudAgentResult: ordered.some(isAttention),
            firstShortId: shortInboxId(first.id),
            latestSender: latest.senderHandle,
            latestShortId: shortInboxId(latest.id),
            mentioned: ordered.some((item) => item.mentioned),
            pendingCount: ordered.length,
            target,
        });
    });
    return [
        '[Haus inbox notice:',
        hasAttention
            ? `Inbox update: ${totalPending} pending ${plural(totalPending, 'work item')} total; ${targets.size} changed ${plural(targets.size, 'target')}`
            : `Inbox update: ${totalPending} unread ${plural(totalPending, 'message')} total; ${targets.size} changed ${plural(targets.size, 'target')}`,
        ...lines,
        ...taskLines,
        ']',
        noticeGuidance,
        ...(taskLines.length > 0 ? [taskAssignmentNoticeGuidance] : []),
    ].join('\n');
}

/**
 * The input of a Task assignment run: how many, one line per Task, then how to take them. Each
 * line is the envelope the contract names, built here from the typed attention. A title or name
 * can hold anything a person typed, so none may open a new line or close the bracket.
 */
export function composeTaskAssignmentInput(assignments: readonly AgentTaskAssignment[]): string {
    return [
        `${assignments.length} ${plural(assignments.length, 'task')} assigned to you:`,
        ...assignments.map(formatTaskAssignment),
        '',
        taskAssignmentGuidance,
    ].join('\n');
}

function formatTaskAssignment(task: AgentTaskAssignment): string {
    const assignedBy = task.assignedBy ? ` assignedBy=@${task.assignedBy}` : '';
    const fields = `board=${headerValue(task.board)} column=${headerValue(task.column)} priority=${task.priority}${assignedBy}`;
    return `[Haus task assignment ${task.key} ${fields}] ${flattened(task.title)}`;
}

function headerValue(value: string): string {
    return flattened(value).replaceAll(/[[\]]/gu, '');
}

function flattened(value: string): string {
    return value.replaceAll(/\s+/gu, ' ').trim();
}

function plural(count: number, singular: string): string {
    return count === 1 ? singular : `${singular}s`;
}

function formatEnvelope(item: AgentInboxItem): string {
    if (item.cloudAgentWork) {
        return formatCloudAgentWorkAttention(item.cloudAgentWork, item.target);
    }
    const sender = formatSenderLabel(item.senderHandle, item.senderDescription);
    const claim = item.claim
        ? ` claim=#${item.claim.number}:${item.claim.status}:${claimAssignee(item)}`
        : '';
    const mention = item.mentioned ? ' mentioned=true' : '';
    const envelope =
        `[target=${item.target} msg=${shortInboxId(item.id)} ${formatInboxTimeFields(item.createdAt, item.senderType === 'human' ? item.senderTimezone : null)} type=${item.senderType}${claim}${mention}] ` +
        `${sender}: ${inboxBodyText(item.id, item.content)}${formatAttachmentSuffix(messageAttachments(item))}${formatInlineReplyContext(item.reply)}`;
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
        indentContinuationLines(`${work.title} — ${work.repository} (${work.provider})`),
        `summary=${work.summary ? indentContinuationLines(work.summary) : '-'}`,
        `errorCode=${work.errorCode ?? work.stallCode ?? '-'}`,
        `branches=${branches.length > 0 ? branches.join(', ') : '-'}`,
        `url=${work.providerUrl ?? '-'}`,
        ...(work.status === 'pending_input'
            ? [
                  `The cloud agent stopped to ask the question in summary. Answer it yourself when the request settles it, or ask the requester first; send the answer with: haus cloud-agent send --work ${work.workId}`,
              ]
            : []),
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

function claimAssignee(item: AgentInboxItem): string {
    if (!item.claim) {
        return 'unassigned';
    }
    return item.claim.assigneeAgentId ?? 'unassigned';
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
