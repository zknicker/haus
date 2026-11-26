import {
    type CrewReportAttention,
    type CrewReportOutcome,
    crewReportTextMaxLength,
    type IssueChange,
} from '@haus/api';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { inboxWork } from '../agent-delivery/inbox-work.ts';
import { readIssues } from '../issues/issue-read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInboxTable,
    agentRunTriggersTable,
    chatMessagesTable,
    issueCommentsTable,
    issueEventsTable,
    issuesTable,
    issueTaskLinksTable,
} from '../postgres/schema.ts';
import { readTaskPullRequestReadings } from './task-pull-request-readings.ts';

export interface CrewReportTask {
    agentId: string;
    captainId: string;
    chatId: string;
    id: string;
    serverId: string;
    shortId: string;
    title: string;
}

export async function queueCrewReport(
    tx: HausDatabase,
    task: CrewReportTask,
    report: {
        ask: string | null;
        outcome: CrewReportOutcome;
        person: CrewReportAttention['person'];
        runId: string;
        text: string;
    }
) {
    const identity = `crew-report:${task.id}:${report.runId}`;
    const attention: CrewReportAttention = {
        ask: report.ask,
        id: identity,
        issueCodes: await readLinkedIssueCodes(tx, task),
        issueEdits: await readTurnIssueEdits(tx, task, report.runId),
        outcome: report.outcome,
        person: report.person,
        pullRequests: await readTaskPullRequestReadings(tx, task),
        taskShortId: task.shortId,
        text: report.text.slice(0, crewReportTextMaxLength),
        title: task.title,
    };
    const content = JSON.stringify(attention);
    await tx
        .update(agentInboxTable)
        .set({ content })
        .where(
            and(
                eq(agentInboxTable.serverId, task.serverId),
                eq(agentInboxTable.agentId, task.captainId),
                eq(agentInboxTable.dedupeKey, identity),
                eq(agentInboxTable.state, 'queued'),
                sql`${agentInboxTable.runId} is null`
            )
        );
    await inboxWork.enqueue(tx, {
        agentId: task.captainId,
        chatId: null,
        content,
        dedupeKey: identity,
        mentioned: true,
        serverId: task.serverId,
        source: 'crew_report',
    });
    return { agentId: task.captainId, serverId: task.serverId };
}

export async function isCaptainDirectedRun(tx: HausDatabase, task: CrewReportTask, runId: string) {
    const rows = await tx
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, agentInboxTable.serverId),
                eq(chatMessagesTable.id, agentInboxTable.dedupeKey)
            )
        )
        .where(
            and(
                eq(agentInboxTable.serverId, task.serverId),
                eq(agentInboxTable.agentId, task.agentId),
                sql`(${agentInboxTable.runId} = ${runId} or ${agentInboxTable.settledRunId} = ${runId})`,
                eq(chatMessagesTable.authorAgentId, task.captainId)
            )
        )
        .limit(1);
    return rows.length > 0;
}

export async function readLastTaskMessage(tx: HausDatabase, task: CrewReportTask) {
    const [message] = await tx
        .select({ content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, task.serverId),
                eq(chatMessagesTable.chatId, task.chatId),
                eq(chatMessagesTable.authorAgentId, task.agentId)
            )
        )
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(1);
    return message?.content ?? '';
}

async function readLinkedIssueCodes(tx: HausDatabase, task: CrewReportTask) {
    const links = await tx
        .select({ issueId: issueTaskLinksTable.issueId })
        .from(issueTaskLinksTable)
        .where(
            and(
                eq(issueTaskLinksTable.serverId, task.serverId),
                eq(issueTaskLinksTable.taskId, task.id)
            )
        )
        .limit(20);
    if (links.length === 0) {
        return [];
    }
    const issues = await readIssues(
        tx,
        task.serverId,
        inArray(
            issuesTable.id,
            links.map((link) => link.issueId)
        )
    );
    return issues.map((issue) => issue.code);
}

async function readTurnIssueEdits(tx: HausDatabase, task: CrewReportTask, runId: string) {
    const [dispatched] = await tx
        .select({ at: agentRunTriggersTable.createdAt })
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, task.serverId),
                eq(agentRunTriggersTable.agentId, task.agentId),
                eq(agentRunTriggersTable.runId, runId)
            )
        )
        .limit(1);
    if (!dispatched) {
        return [];
    }
    const events = await tx
        .select({ change: issueEventsTable.change, issueId: issueEventsTable.issueId })
        .from(issueEventsTable)
        .where(
            and(
                eq(issueEventsTable.serverId, task.serverId),
                eq(issueEventsTable.actorTaskId, task.id),
                gte(issueEventsTable.createdAt, dispatched.at)
            )
        )
        .orderBy(asc(issueEventsTable.createdAt))
        .limit(50);
    const comments = await tx
        .select({ issueId: issueCommentsTable.issueId })
        .from(issueCommentsTable)
        .where(
            and(
                eq(issueCommentsTable.serverId, task.serverId),
                eq(issueCommentsTable.authorTaskId, task.id),
                gte(issueCommentsTable.createdAt, dispatched.at)
            )
        )
        .limit(50);
    const issueIds = [...new Set([...events, ...comments].map((row) => row.issueId))];
    if (issueIds.length === 0) {
        return [];
    }
    const codes = new Map(
        (await readIssues(tx, task.serverId, inArray(issuesTable.id, issueIds))).map((issue) => [
            issue.id,
            issue.code,
        ])
    );
    const edits = [
        ...events.map((event) => ({ change: describeChange(event.change), id: event.issueId })),
        ...comments.map((comment) => ({ change: 'commented', id: comment.issueId })),
    ];
    return edits.slice(0, 50).flatMap((edit) => {
        const code = codes.get(edit.id);
        return code ? [{ change: edit.change, code }] : [];
    });
}

function describeChange(change: IssueChange) {
    switch (change.kind) {
        case 'state_changed':
            return `state ${change.from} → ${change.to}`;
        case 'priority_changed':
            return `priority ${change.from} → ${change.to}`;
        case 'title_changed':
            return 'retitled';
        case 'assignee_changed':
            return 'reassigned';
        case 'parent_set':
            return change.to ? `under ${change.to}` : 'no parent';
        case 'sub_issue_added':
            return `sub-issue ${change.issue} added`;
        case 'sub_issue_removed':
            return `sub-issue ${change.issue} removed`;
        default:
            return change.kind.replaceAll('_', ' ');
    }
}
