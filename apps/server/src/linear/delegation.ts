import type { LinearCallMeta } from '@haus/api/linear-actor-meta';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearAgentLabelsTable, linearLabelGroupsTable } from '../postgres/schema.ts';
import { loadActorContext } from './actor-selection.ts';
import { holdsGrant } from './authority.ts';
import { effectiveIdentityTeams } from './team-access.ts';
import type { LinearToolRefusal } from './tool-results.ts';

// `delegate_issue` (specs/linear-app.md#handoff): the target Agent's `Agent`
// label plus the delegate set to the target's actor — its identity when that
// is `active` with the issue's team in effective access, otherwise the Haus app.

export async function resolveDelegation(
    db: HausDatabase,
    input: {
        connectionId: string;
        issueTeamId: string | null;
        now: Date;
        serverId: string;
        targetAgentId: unknown;
        workspace: { appUserId: string; id: string };
    }
): Promise<{ delegation: NonNullable<LinearCallMeta['delegation']> } | LinearToolRefusal> {
    const { targetAgentId: agentId, workspace } = input;
    if (
        typeof agentId !== 'string' ||
        !(await holdsGrant(db, {
            agentId,
            connectionId: input.connectionId,
            serverId: input.serverId,
        }))
    ) {
        return { refused: 'linear_agent_not_granted' };
    }
    const target = await loadActorContext(db, {
        agentId,
        now: input.now,
        serverId: input.serverId,
        workspaceAppUserId: workspace.appUserId,
        workspaceId: workspace.id,
    });
    const identity = target?.identity;
    const identityReaches =
        identity &&
        effectiveIdentityTeams(identity.teams, target.workspace.teams).some(
            (team) => team.id === input.issueTeamId
        );
    const teamId = input.issueTeamId ?? '';
    const [group] = await db
        .select({ id: linearLabelGroupsTable.groupLabelId })
        .from(linearLabelGroupsTable)
        .where(
            and(
                eq(linearLabelGroupsTable.workspaceId, workspace.id),
                eq(linearLabelGroupsTable.teamId, teamId)
            )
        )
        .limit(1);
    const [label] = await db
        .select({ id: linearAgentLabelsTable.labelId })
        .from(linearAgentLabelsTable)
        .where(
            and(
                eq(linearAgentLabelsTable.workspaceId, workspace.id),
                eq(linearAgentLabelsTable.teamId, teamId),
                eq(linearAgentLabelsTable.agentId, agentId),
                eq(linearAgentLabelsTable.state, 'active')
            )
        )
        .limit(1);
    return {
        delegation: {
            delegateId: identityReaches ? identity.appUserId : workspace.appUserId,
            labelGroupId: group?.id ?? null,
            labelId: label?.id ?? null,
        },
    };
}
