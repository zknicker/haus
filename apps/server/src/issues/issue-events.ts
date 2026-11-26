import type { Issue, IssueActor, IssueChange } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { issueEventsTable } from '../postgres/schema.ts';
import { issueCreatedTopic, issueUpdatedTopic } from '../realtime/topics.ts';
import { actorColumns } from './issue-actor.ts';

type Writer = Pick<HausDatabase, 'insert'>;

export interface RecordedIssueEvent {
    change: IssueChange;
    id: string;
    issueId: string;
}

export async function appendIssueEvents(
    tx: Writer,
    input: { actor: IssueActor | null; changes: IssueChange[]; issueId: string; serverId: string }
) {
    const recorded: RecordedIssueEvent[] = [];
    for (const change of input.changes) {
        const columns = actorColumns(input.actor);
        const id = createOpaqueId('iev');
        await tx.insert(issueEventsTable).values({
            actorAgentId: columns.agentId,
            actorTaskId: columns.taskId,
            actorUserId: columns.userId,
            change,
            id,
            issueId: input.issueId,
            kind: change.kind,
            serverId: input.serverId,
        });
        recorded.push({ change, id, issueId: input.issueId });
    }
    return recorded;
}

export function prepareIssueCreatedEvent(issue: Issue) {
    return issueCreatedTopic.prepare(issueRef(issue));
}

export function prepareIssueUpdatedEvent(issue: Issue) {
    return issueUpdatedTopic.prepare(issueRef(issue));
}

function issueRef(issue: Issue) {
    return {
        issueId: issue.id,
        projectId: issue.projectId,
        serverId: issue.serverId,
        version: issue.version,
    };
}
