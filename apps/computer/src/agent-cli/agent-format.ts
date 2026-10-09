import { cloudAgentPullRequestNumber, formatCloudAgentWorkSuffix } from '@haus/api';
import { formatAttachmentSuffix, formatThreadFollowRestoration } from '../inbox-format.ts';
import { formatInboxTime, indentContinuationLines, shortInboxId } from '../inbox-header-format.ts';
import { formatInlineReplyContext } from '../inline-reply-format.ts';
import type { AgentCliAutomationEvent, AgentCliMessage } from './agent-api-schemas.ts';
import { AgentCliError } from './agent-error.ts';

/** An Agent-facing instant: explicit UTC, `YYYY-MM-DD HH:MM:SS UTC`. */
export function formatUtcTime(timestamp: string): string {
    if (Number.isNaN(new Date(timestamp).getTime())) {
        throw new AgentCliError('INVALID_JSON_RESPONSE', `Invalid message time: ${timestamp}`);
    }
    return formatInboxTime(timestamp);
}

export function formatHistoryLine(message: AgentCliMessage): string {
    const attributes = [
        `seq=${message.sequence}`,
        `msg=${message.id}`,
        `time=${formatUtcTime(message.created_at)}`,
        ...senderTimezoneField(message),
        `type=${message.sender.type}`,
        ...(message.threadId ? [`threadId=${message.threadId}`] : []),
        ...(message.replyCount !== undefined ? [`replyCount=${message.replyCount}`] : []),
        ...(message.replyTarget ? [`replyTarget=${message.replyTarget}`] : []),
    ];
    return `[${attributes.join(' ')}] ${formatSender(message)}: ${indentContinuationLines(message.content)}${messageSuffixes(message)}${formatInlineReplyContext(message.reply)}`;
}

export function formatDeliveryEnvelope(
    target: string,
    message: AgentCliMessage,
    threadFollowReactivated = false
): string {
    const attributes = [
        `target=${target}`,
        `msg=${shortMessageId(message.id)}`,
        `time=${formatUtcTime(message.created_at)}`,
        ...senderTimezoneField(message),
        `type=${message.sender.type}`,
    ];
    const envelope = `[${attributes.join(' ')}] ${formatSender(message)}: ${indentContinuationLines(message.content)}${messageSuffixes(message)}${formatInlineReplyContext(message.reply)}`;
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
        `time=${formatUtcTime(event.createdAt)}`,
        `type=${event.senderType}`,
    ];
    return `[${attributes.join(' ')}] @${event.senderHandle}: ${event.content}`;
}

export function formatSender(message: AgentCliMessage): string {
    // System and unlabeled authors legitimately have no handle (Raft renders
    // them as @unknown too); never fail a whole read over one such row.
    const handle = indentContinuationLines(message.sender.handle ?? 'unknown');
    return message.sender.description
        ? `@${handle} — ${indentContinuationLines(message.sender.description)}`
        : `@${handle}`;
}

/** A human sender's saved zone, right after `time=`; Agents and zoneless humans print none. */
function senderTimezoneField(message: AgentCliMessage): string[] {
    return message.sender.type === 'human' && message.sender.timezone
        ? [`sender_tz=${message.sender.timezone}`]
        : [];
}

export function shortMessageId(messageId: string): string {
    return messageId.startsWith('msg_') ? messageId.slice(4, 12) : messageId;
}

/**
 * Every product record a Message carries rides its line in one fixed order:
 * attachments, the task metadata, delegated Cloud Agent
 * work, the Agent this Message created, then its reactions.
 */
function messageSuffixes(message: AgentCliMessage): string {
    return `${formatAttachmentSuffix(message.attachments)}${taskSuffix(message)}${cloudAgentWorkSuffix(message)}${agentCreatedSuffix(message)}${formatReactionsSuffix(message.reactions)}`;
}

const reactionActorLimit = 3;

/**
 * Reactions are visible on reads but never wake an Agent. Each emoji lists its
 * actors in arrival order, capped so a popular message stays one short line.
 */
export function formatReactionsSuffix(reactions: AgentCliMessage['reactions']): string {
    const groups = (reactions ?? []).filter((reaction) => reaction.actors.length > 0);
    if (groups.length === 0) {
        return '';
    }
    const rendered = groups.map(({ actors, emoji }) => {
        const shown = actors
            .slice(0, reactionActorLimit)
            .map((actor) => `@${actor.handle ?? 'unknown'}`)
            .join(', ');
        const hidden = actors.length - reactionActorLimit;
        return `${emoji} ${shown}${hidden > 0 ? ` +${hidden} more` : ''}`;
    });
    return ` [reactions: ${rendered.join(' · ')}]`;
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
