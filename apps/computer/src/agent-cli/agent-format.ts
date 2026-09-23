import { cloudAgentPullRequestNumber, formatCloudAgentWorkSuffix } from '@haus/api';
import { formatAskSuffix } from '../inbox-ask-format.ts';
import {
    formatAttachmentSuffix,
    formatThreadFollowRestoration,
    shortInboxId,
} from '../inbox-format.ts';
import { formatInlineReplyContext } from '../inline-reply-format.ts';
import type { AgentCliAutomationEvent, AgentCliMessage } from './agent-api-schemas.ts';
import { AgentCliError } from './agent-error.ts';

export function formatLocalTime(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        throw new AgentCliError('INVALID_JSON_RESPONSE', `Invalid message time: ${timestamp}`);
    }
    return [
        date.getFullYear(),
        '-',
        pad(date.getMonth() + 1),
        '-',
        pad(date.getDate()),
        ' ',
        pad(date.getHours()),
        ':',
        pad(date.getMinutes()),
        ':',
        pad(date.getSeconds()),
    ].join('');
}

export function formatHistoryLine(message: AgentCliMessage): string {
    const attributes = [
        `seq=${message.sequence}`,
        `msg=${message.id}`,
        `time=${formatLocalTime(message.created_at)}`,
        `type=${message.sender.type}`,
        ...(message.threadId ? [`threadId=${message.threadId}`] : []),
        ...(message.replyCount !== undefined ? [`replyCount=${message.replyCount}`] : []),
        ...(message.replyTarget ? [`replyTarget=${message.replyTarget}`] : []),
    ];
    return `[${attributes.join(' ')}] ${formatSender(message)}: ${message.content}${messageSuffixes(message)}${formatInlineReplyContext(message.reply)}`;
}

export function formatDeliveryEnvelope(
    target: string,
    message: AgentCliMessage,
    threadFollowReactivated = false
): string {
    const attributes = [
        `target=${target}`,
        `msg=${shortMessageId(message.id)}`,
        `time=${formatLocalTime(message.created_at)}`,
        `type=${message.sender.type}`,
    ];
    const envelope = `[${attributes.join(' ')}] ${formatSender(message)}: ${message.content}${messageSuffixes(message)}${formatInlineReplyContext(message.reply)}`;
    return threadFollowReactivated
        ? `${formatThreadFollowRestoration(target)}\n${envelope}`
        : envelope;
}

/**
 * A bodiless inbox item served on `haus message check`: a Trigger or Reminder
 * fire, or a task assignment. None of them has a Chat message, so the item's own
 * identity fills the envelope: `msg=` is its short id, `type=` is `trigger` or
 * `system`, and the sender is `@trigger`, `@reminder`, or `@haus` — the exact
 * header the launch drain prints for the same item.
 */
export function formatAutomationEnvelope(event: AgentCliAutomationEvent): string {
    const attributes = [
        `target=${event.target}`,
        `msg=${shortInboxId(event.id)}`,
        `time=${formatLocalTime(event.createdAt)}`,
        `type=${event.senderType}`,
    ];
    return `[${attributes.join(' ')}] @${event.senderHandle}: ${event.content}`;
}

export function formatSender(message: AgentCliMessage): string {
    // System and unlabeled authors legitimately have no handle (Raft renders
    // them as @unknown too); never fail a whole read over one such row.
    const handle = message.sender.handle ?? 'unknown';
    return message.sender.description ? `@${handle} — ${message.sender.description}` : `@${handle}`;
}

export function shortMessageId(messageId: string): string {
    return messageId.startsWith('msg_') ? messageId.slice(4, 12) : messageId;
}

/**
 * Every product record a Message carries rides its line in one fixed order:
 * attachments, the task metadata, the Ask lifecycle, delegated Cloud Agent
 * work, then the Agent this Message created.
 */
function messageSuffixes(message: AgentCliMessage): string {
    return `${formatAttachmentSuffix(message.attachments)}${taskSuffix(message)}${askSuffix(message)}${cloudAgentWorkSuffix(message)}${agentCreatedSuffix(message)}`;
}

/** Task-messages ride every surface with their metadata suffix (D8). */
function taskSuffix(message: AgentCliMessage): string {
    const task = message.task;
    if (!task) {
        return '';
    }
    const assignee = task.assignee?.handle ? ` assignee=@${task.assignee.handle}` : '';
    return ` [task #${task.number} status=${task.status}${assignee}]`;
}

/** An Ask Message states who owes the answer and whether it is still owed. */
function askSuffix(message: AgentCliMessage): string {
    const ask = message.ask;
    if (!ask) {
        return '';
    }
    return formatAskSuffix({ addresseeHandle: ask.addressee_handle, status: ask.status });
}

/**
 * A Cloud Agent work Message states what was delegated, where it stands, and
 * the pull request it opened once the Run reports one, so history answers
 * "which PR was that?" without a second command.
 */
function cloudAgentWorkSuffix(message: AgentCliMessage): string {
    const work = message.cloud_agent_work;
    if (!work) {
        return '';
    }
    const url = work.latest_run?.branches.find(
        (branch) => branch.pull_request_url !== null
    )?.pull_request_url;
    return formatCloudAgentWorkSuffix({
        ...work,
        pullRequestNumber: url ? cloudAgentPullRequestNumber(url) : null,
    });
}

/**
 * The Agent this Message created, so a history read answers "where did @orbit
 * come from?" without a second command. A retired Agent says so; the row is
 * never deleted.
 */
function agentCreatedSuffix(message: AgentCliMessage): string {
    const created = message.agent_created;
    if (!created) {
        return '';
    }
    return ` [created @${created.handle}${created.retired ? ' (retired)' : ''}]`;
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}
