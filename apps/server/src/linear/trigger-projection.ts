import {
    type LinearTriggerEventName,
    type LinearTriggerGroups,
    linearTriggerGroupsSchema,
} from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    linearTriggerConfigsTable,
    linearWorkspacesTable,
    triggersTable,
} from '../postgres/schema.ts';
import { agentLabelsByLinearId, workspaceCredentialId } from './agent-label-reads.ts';
import { field, type Payload, text } from './delivery-payload.ts';
import {
    type LinearCommentIssueRead,
    linearEntityId,
    linearSubjectLabelIds,
    projectLinearDelivery,
} from './event-projection/project.ts';
import type { LinearProjection } from './event-projection/types.ts';
import { correlateLinearDelivery, linearDeferralLimitMs } from './loop-safety.ts';
import { readTeamAccess } from './team-access.ts';

// The match-time half of a `linear` delivery shared by the delivery worker and
// preview: the workspace's armed Triggers, and the projection built from the
// raw body plus Server state (the ledger's Agent actor and the `Agent` label's
// delegate Agent).

export interface LinearTriggerCandidate {
    groups: LinearTriggerGroups;
    ownerAgentId: string;
    triggerId: string;
}

export type LinearMatchInput =
    | { kind: 'defer' }
    | { kind: 'unreadable' }
    | { accessTeamIds: Set<string>; kind: 'projected'; projection: LinearProjection };

/** Every armed, undeleted `linear` Trigger on the workspace, problem or not. */
export async function armedLinearTriggers(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; triggerIds?: readonly string[]; workspaceId: string }
): Promise<LinearTriggerCandidate[]> {
    const rows = await db
        .select({
            groups: linearTriggerConfigsTable.groups,
            ownerAgentId: triggersTable.ownerAgentId,
            triggerId: triggersTable.id,
        })
        .from(linearTriggerConfigsTable)
        .innerJoin(
            triggersTable,
            and(
                eq(triggersTable.serverId, linearTriggerConfigsTable.serverId),
                eq(triggersTable.id, linearTriggerConfigsTable.triggerId)
            )
        )
        .where(
            and(
                eq(linearTriggerConfigsTable.serverId, input.serverId),
                eq(linearTriggerConfigsTable.workspaceId, input.workspaceId),
                eq(triggersTable.status, 'armed'),
                isNull(triggersTable.deletedAt)
            )
        );
    // Stored groups were validated on write; parsing again keeps a drifted row
    // from matching half-formed.
    return rows
        .filter((row) => !input.triggerIds || input.triggerIds.includes(row.triggerId))
        .map((row) => ({ ...row, groups: linearTriggerGroupsSchema.parse(row.groups) }));
}

/** Whether a comment needs its issue read: some candidate listens to comments. */
export function commentIssueNeeded(candidates: readonly LinearTriggerCandidate[]): boolean {
    return candidates.some((candidate) =>
        candidate.groups.some((group) => group.event === 'comment')
    );
}

/** The issue a Comment body names. */
export function commentIssueId(body: Payload): string | null {
    const data = field(body, 'data');
    return text(field(data, 'issue'), 'id') ?? text(data, 'issueId');
}

/**
 * Builds one delivery's projection. A pending ledger candidate defers it
 * (`forceDecision` skips that for preview, which never waits).
 */
export async function projectForMatching(
    tx: HausDatabase,
    input: {
        body: Payload;
        commentIssue: LinearCommentIssueRead | null;
        deferredSince: Date | null;
        event: LinearTriggerEventName;
        forceDecision?: boolean;
        now: Date;
        test?: boolean;
        webhookTimestamp: Date;
        workspaceId: string;
    }
): Promise<LinearMatchInput> {
    const [workspace] = await tx
        .select({
            organizationId: linearWorkspacesTable.organizationId,
            urlKey: linearWorkspacesTable.urlKey,
        })
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, input.workspaceId))
        .limit(1);
    const entityId = linearEntityId(input.body);
    if (!(workspace && entityId)) {
        return { kind: 'unreadable' };
    }
    const updatedAt = text(field(input.body, 'data'), 'updatedAt');
    const changedAt = updatedAt ? new Date(updatedAt) : input.webhookTimestamp;
    const cause = await correlateLinearDelivery(tx, {
        actorId: text(field(input.body, 'actor'), 'id'),
        changedAt: Number.isNaN(changedAt.getTime()) ? input.webhookTimestamp : changedAt,
        created: text(input.body, 'action') === 'create',
        deferredSince: input.forceDecision
            ? new Date(input.now.getTime() - linearDeferralLimitMs)
            : input.deferredSince,
        entityId,
        now: input.now,
        workspaceId: input.workspaceId,
    });
    if (cause.kind === 'defer') {
        return cause;
    }
    const labelIds = linearSubjectLabelIds(input.event, input.body, input.commentIssue);
    const [delegate] = await agentLabelsByLinearId(tx, input.workspaceId, labelIds);
    const projection = projectLinearDelivery({
        agentActor: cause.kind === 'agent' ? cause.agentId : null,
        body: input.body,
        commentIssue: input.commentIssue,
        delegateAgentId: delegate?.agentId ?? null,
        event: input.event,
        organization: { id: workspace.organizationId, urlKey: workspace.urlKey },
        test: input.test,
    });
    if (!projection) {
        return { kind: 'unreadable' };
    }
    const credentialId = await workspaceCredentialId(tx, input.workspaceId);
    const access = credentialId ? await readTeamAccess(tx, credentialId, input.now) : null;
    return {
        accessTeamIds: new Set(access?.teams.map((team) => team.id) ?? []),
        kind: 'projected',
        projection,
    };
}
