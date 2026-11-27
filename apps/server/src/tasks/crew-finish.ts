import type { CrewFinish } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import { inboxWork } from '../agent-delivery/inbox-work.ts';
import { readIssues } from '../issues/issue-read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { issuesTable, issueTaskLinksTable, tasksTable } from '../postgres/schema.ts';
import { taskNeedsYouSql } from './task-activity.ts';

export async function settleCrewTurn(
    tx: HausDatabase,
    input: {
        agentId: string;
        runId: string;
        serverId: string;
        status: 'completed' | 'failed' | 'interrupted';
    }
) {
    if (input.status === 'interrupted') {
        return null;
    }
    const [task] = await tx
        .select({
            captainId: tasksTable.captainId,
            id: tasksTable.id,
            needsYou: taskNeedsYouSql,
            shortId: tasksTable.shortId,
            title: tasksTable.title,
        })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.agentId, input.agentId)))
        .limit(1);
    if (!task?.captainId) {
        return null;
    }
    const finish: CrewFinish = {
        ending: turnEnding(input.status, task.needsYou),
        id: `crew-finish:${task.id}:${input.runId}`,
        issueCodes: await readLinkedIssueCodes(tx, input.serverId, task.id),
        taskShortId: task.shortId,
        title: task.title,
    };
    await inboxWork.enqueue(tx, {
        agentId: task.captainId,
        chatId: null,
        content: JSON.stringify(finish),
        dedupeKey: finish.id,
        mentioned: true,
        serverId: input.serverId,
        source: 'crew_finish',
    });
    return { agentId: task.captainId, serverId: input.serverId };
}

function turnEnding(status: 'completed' | 'failed', needsYou: boolean) {
    if (status === 'failed') {
        return 'failed' as const;
    }
    return needsYou ? ('waiting' as const) : ('finished' as const);
}

async function readLinkedIssueCodes(tx: HausDatabase, serverId: string, taskId: string) {
    const links = await tx
        .select({ issueId: issueTaskLinksTable.issueId })
        .from(issueTaskLinksTable)
        .where(
            and(eq(issueTaskLinksTable.serverId, serverId), eq(issueTaskLinksTable.taskId, taskId))
        )
        .limit(20);
    if (links.length === 0) {
        return [];
    }
    const issues = await readIssues(
        tx,
        serverId,
        inArray(
            issuesTable.id,
            links.map((link) => link.issueId)
        )
    );
    return issues.map((issue) => issue.code);
}
