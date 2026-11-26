import {
    type AgentIssueAssignment,
    type AgentIssueEvent,
    type AgentIssueEventChange,
    agentIssueAssignmentSchema,
    agentIssueCommentExcerptMaxChars,
    agentIssueEventSchema,
    type IssueActor,
} from '@haus/api';
import { and, eq, isNull, like } from 'drizzle-orm';
import { inboxWork } from '../agent-delivery/inbox-work.ts';
import {
    agentInboxTable,
    agentsTable,
    issueCommentsTable,
    issueEventsTable,
    serverMembershipsTable,
    tasksTable,
} from '../postgres/schema.ts';
import { readIssue } from './issue-read.ts';
import type { IssueWake, IssueWakeRecipient } from './issue-wakes.ts';
import type { IssueTx } from './issue-write.ts';

export interface IssueAgentWake {
    agentId: string;
    serverId: string;
}

/**
 * Queues each derived wake as its inbox item (specs/inbox.md#issue-items) in the write's
 * transaction, and returns the agents to dispatch once it commits. A wake whose recipient has
 * no agent to run it (an archived Task, or a Task no agent started) queues nothing.
 */
export async function queueIssueWakes(
    tx: IssueTx,
    input: { actor: IssueActor | null; serverId: string; wakes: readonly IssueWake[] }
) {
    const { serverId } = input;
    const queued: IssueAgentWake[] = [];
    const by = await actorLabel(tx, serverId, input.actor);
    const byAgent = input.actor?.kind === 'captain' || input.actor?.kind === 'task';
    for (const wake of input.wakes) {
        const agentId = await recipientAgent(tx, serverId, wake.recipient);
        if (!agentId) {
            continue;
        }
        const issue = await readIssue(tx, serverId, wake.issueId);
        const base = {
            by,
            byAgent,
            code: issue.code,
            id: wake.identity,
            issueId: issue.id,
            title: issue.title,
        };
        const attention =
            wake.kind === 'issue_assignment'
                ? ({
                      ...base,
                      priority: issue.priority,
                      state: issue.state.id,
                  } satisfies AgentIssueAssignment)
                : ({
                      ...base,
                      change: await readEventChange(tx, serverId, wake),
                  } satisfies AgentIssueEvent);
        await inboxWork.enqueue(tx, {
            agentId,
            chatId: null,
            content: JSON.stringify(attention),
            dedupeKey: wake.identity,
            mentioned: true,
            serverId,
            source: wake.kind,
        });
        queued.push({ agentId, serverId });
    }
    return [...new Map(queued.map((wake) => [wake.agentId, wake])).values()];
}

/**
 * Withdraws the Issue's assignments no run has taken yet: it was reassigned or unassigned
 * first. An assignment a run already carries stays with that run.
 */
export async function retireIssueAssignments(
    tx: IssueTx,
    input: { issueId: string; serverId: string }
) {
    await tx
        .delete(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, input.serverId),
                eq(agentInboxTable.source, 'issue_assignment'),
                eq(agentInboxTable.state, 'queued'),
                isNull(agentInboxTable.runId),
                like(agentInboxTable.dedupeKey, `${issueAssignmentKeyPrefix}${input.issueId}:%`)
            )
        );
}

export function decodeIssueAssignment(content: string) {
    return agentIssueAssignmentSchema.parse(JSON.parse(content));
}

export function decodeIssueEvent(content: string) {
    return agentIssueEventSchema.parse(JSON.parse(content));
}

/** Whether an agent caused a stored Issue item, which spends the automation chain. */
export function issueItemByAgent(source: string, content: string) {
    return (
        source === 'issue_assignment' ? decodeIssueAssignment(content) : decodeIssueEvent(content)
    ).byAgent;
}

/** The Issue an `issue_assignment` or `issue_event` identity names, or null for any other. */
export function issueIdOfWakeKey(dedupeKey: string) {
    const [prefix, issueId] = dedupeKey.split(':');
    return (prefix === 'issue-assign' || prefix === 'issue-event') && issueId ? issueId : null;
}

const issueAssignmentKeyPrefix = 'issue-assign:';

/**
 * The agent a recipient runs as. A Task has no agent of its own until Task agents land (ADR
 * 0062 step 5), so until then it wakes the Captain that started it, as pull request wakes do.
 */
async function recipientAgent(tx: IssueTx, serverId: string, recipient: IssueWakeRecipient) {
    if (recipient.kind === 'captain') {
        return (await activeAgent(tx, serverId, recipient.agentId)) ? recipient.agentId : null;
    }
    const [task] = await tx
        .select({ agentId: tasksTable.createdByAgentId })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, serverId),
                eq(tasksTable.id, recipient.taskId),
                isNull(tasksTable.archivedAt)
            )
        )
        .limit(1);
    return task?.agentId && (await activeAgent(tx, serverId, task.agentId)) ? task.agentId : null;
}

async function activeAgent(tx: IssueTx, serverId: string, agentId: string) {
    const rows = await tx
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                eq(agentsTable.id, agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    return rows.length > 0;
}

async function readEventChange(
    tx: IssueTx,
    serverId: string,
    wake: IssueWake
): Promise<AgentIssueEventChange> {
    const eventId = wake.identity.split(':')[2] ?? '';
    const [comment] = await tx
        .select({ body: issueCommentsTable.body })
        .from(issueCommentsTable)
        .where(and(eq(issueCommentsTable.serverId, serverId), eq(issueCommentsTable.id, eventId)))
        .limit(1);
    if (comment) {
        const truncated = comment.body.length > agentIssueCommentExcerptMaxChars;
        return {
            body: comment.body.slice(0, agentIssueCommentExcerptMaxChars),
            commentId: eventId,
            kind: 'commented',
            truncated,
        };
    }
    const [event] = await tx
        .select({ change: issueEventsTable.change, issueId: issueEventsTable.issueId })
        .from(issueEventsTable)
        .where(and(eq(issueEventsTable.serverId, serverId), eq(issueEventsTable.id, eventId)))
        .limit(1);
    if (event?.change.kind !== 'state_changed') {
        throw new Error(`Issue wake ${wake.identity} names no comment or state change.`);
    }
    if (event.issueId !== wake.issueId) {
        const parent = await readIssue(tx, serverId, wake.issueId);
        return { kind: 'sub_issues_closed', total: parent.subIssueCount };
    }
    return { from: event.change.from, kind: 'state_changed', to: event.change.to };
}

async function actorLabel(tx: IssueTx, serverId: string, actor: IssueActor | null) {
    if (actor?.kind === 'user') {
        const [member] = await tx
            .select({ handle: serverMembershipsTable.handle })
            .from(serverMembershipsTable)
            .where(
                and(
                    eq(serverMembershipsTable.serverId, serverId),
                    eq(serverMembershipsTable.userId, actor.userId)
                )
            )
            .limit(1);
        return member?.handle ? `@${member.handle}` : null;
    }
    if (actor?.kind === 'captain') {
        const [agent] = await tx
            .select({ handle: agentsTable.handle })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, actor.agentId)))
            .limit(1);
        return agent ? `@${agent.handle}` : null;
    }
    if (actor?.kind === 'task') {
        const [task] = await tx
            .select({ shortId: tasksTable.shortId })
            .from(tasksTable)
            .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.id, actor.taskId)))
            .limit(1);
        return task ? `task:${task.shortId}` : null;
    }
    return null;
}
