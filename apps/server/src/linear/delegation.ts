import type { LinearCallMeta } from '@haus/api/linear-actor-meta';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    linearAgentLabelsTable,
    linearLabelGroupsTable,
} from '../postgres/schema.ts';
import { loadActorContext } from './actor-selection.ts';
import { effectiveIdentityTeams } from './team-access.ts';
import type { LinearToolRefusal } from './tool-results.ts';

// `delegate_issue` (specs/linear-app.md#handoff): the target Agent's `Agent`
// label plus the delegate set to the target's actor — its identity when that
// is `active` with the issue's team in effective access, otherwise the Haus app.
// The Agent names the target by display name, handle, or id; the Server
// resolves it among the Agents granted this connection.

export async function resolveDelegation(
    db: HausDatabase,
    input: {
        connectionId: string;
        issueTeamId: string | null;
        now: Date;
        serverId: string;
        /** The tool's `agent` argument: a display name, handle, or Agent id. */
        target: unknown;
        workspace: { appUserId: string; id: string };
    }
): Promise<{ delegation: NonNullable<LinearCallMeta['delegation']> } | LinearToolRefusal> {
    const { workspace } = input;
    const resolved = await resolveTargetAgent(db, input);
    if ('refused' in resolved) {
        return resolved;
    }
    const { agentId } = resolved;
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

/**
 * One granted, active Agent whose id, handle (with or without `@`), or display
 * name equals `target`, ignoring case. None or several refuse with
 * `linear_agent_unknown`, listing the Agents the call may name.
 */
async function resolveTargetAgent(
    db: HausDatabase,
    input: { connectionId: string; serverId: string; target: unknown }
): Promise<{ agentId: string } | LinearToolRefusal> {
    const granted = await db
        .select({
            displayName: agentsTable.displayName,
            handle: agentsTable.handle,
            id: agentsTable.id,
        })
        .from(agentMcpConnectionGrantsTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentMcpConnectionGrantsTable.serverId),
                eq(agentsTable.id, agentMcpConnectionGrantsTable.agentId)
            )
        )
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, input.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, input.connectionId),
                isNull(agentsTable.retiredAt)
            )
        )
        .orderBy(agentsTable.displayName);
    const wanted = typeof input.target === 'string' ? input.target.trim().toLowerCase() : '';
    const byId = granted.find((agent) => agent.id === input.target);
    const matches = byId
        ? [byId]
        : granted.filter(
              (agent) =>
                  wanted !== '' &&
                  (agent.handle.toLowerCase() === wanted.replace(/^@/u, '') ||
                      agent.displayName.toLowerCase() === wanted)
          );
    const [only] = matches;
    if (matches.length === 1 && only) {
        return { agentId: only.id };
    }
    const names = granted.map((agent) => `${agent.displayName} (@${agent.handle})`).join(', ');
    const reason = matches.length > 1 ? 'names more than one Agent' : 'names no Agent with Linear';
    return {
        detail: `"${String(input.target)}" ${reason}. Name one of: ${names || 'none'}.`,
        refused: 'linear_agent_unknown',
    };
}
