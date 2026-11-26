import type { Issue, IssueActor } from '@haus/api';
import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { issueTaskLinksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { actorColumns } from './issue-actor.ts';
import type { IssueAgentWake } from './issue-inbox.ts';
import type { IssueWake } from './issue-wakes.ts';

export type IssueTx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export type IssueWriteGuard = (tx: IssueTx, issue: Issue) => Promise<void>;

export interface IssueWriteResult {
    agentWakes: IssueAgentWake[];
    events: PreparedRealtimeEvent[];
    issue: Issue;
    wakes: IssueWake[];
}

export async function insertIssueTaskLink(
    tx: IssueTx,
    input: { actor: IssueActor; issueId: string; serverId: string; taskId: string }
) {
    const linkedBy = actorColumns(input.actor);
    const inserted = await tx
        .insert(issueTaskLinksTable)
        .values({
            issueId: input.issueId,
            linkedAt: sql`clock_timestamp()`,
            linkedByAgentId: linkedBy.agentId,
            linkedByTaskId: linkedBy.taskId,
            linkedByUserId: linkedBy.userId,
            serverId: input.serverId,
            taskId: input.taskId,
        })
        .onConflictDoNothing()
        .returning({ taskId: issueTaskLinksTable.taskId });
    return inserted.length > 0;
}
