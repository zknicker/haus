import type { LinearTriggerGroups, LinearTriggerProblem } from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    linearTriggerConfigsTable,
    linearWorkspacesTable,
    mcpConnectionsTable,
    triggersTable,
} from '../postgres/schema.ts';
import { workspaceCredentialId } from './agent-label-reads.ts';
import { readTeamAccess } from './team-access.ts';
import { enqueueLinearTriggerProblemNotice } from './trigger-problem-notice.ts';

// The one place `linear` Trigger problems are derived
// (specs/linear-triggers.md#failure-modes), most fundamental first. Callers
// run it inside their transaction wherever workspace, grant, team, or
// reference state changes; arming and delivery matching run it too.

/** One Trigger that newly entered a problem, for the caller's after-commit wake. */
export interface LinearTriggerProblemEntered {
    ownerAgentId: string;
    problem: LinearTriggerProblem;
    problemSince: Date;
    triggerId: string;
}

/**
 * What is known about referenced labels, states, projects, and project
 * statuses. `complete` is true only for a full sweep: then a Trigger whose
 * references are all available leaves `references_unavailable`.
 */
export interface LinearReferenceFacts {
    complete: boolean;
    unavailable: ReadonlySet<string>;
}

export type LinearProblemScope =
    | { workspaceId: string }
    | { triggerIds: readonly string[] }
    | { ownerAgentId: string };

/**
 * Re-derives every armed, undeleted `linear` Trigger in scope, enters new
 * problems (bumping `version`, one notice each), and clears problems whose
 * cause is gone. Clearing notifies nobody. Answers each Trigger's problem now.
 */
export async function syncLinearTriggerProblems(
    tx: HausDatabase,
    input: {
        now: Date;
        references?: LinearReferenceFacts;
        scope: LinearProblemScope;
        serverId: string;
    }
): Promise<{
    entered: LinearTriggerProblemEntered[];
    problems: Map<string, LinearTriggerProblem | null>;
}> {
    const rows = await armedLinearTriggers(tx, input.serverId, input.scope);
    const problems = new Map<string, LinearTriggerProblem | null>();
    const entered: LinearTriggerProblemEntered[] = [];
    const facts = await workspaceFacts(tx, rows, input.now);
    for (const row of rows) {
        const desired = deriveProblem(row, facts, input.references);
        problems.set(row.triggerId, desired);
        if (desired === row.problem) {
            continue;
        }
        await tx
            .update(linearTriggerConfigsTable)
            .set({ problem: desired, problemSince: desired ? input.now : null })
            .where(
                and(
                    eq(linearTriggerConfigsTable.serverId, input.serverId),
                    eq(linearTriggerConfigsTable.triggerId, row.triggerId)
                )
            );
        await tx
            .update(triggersTable)
            .set({ updatedAt: input.now, version: sql`${triggersTable.version} + 1` })
            .where(
                and(eq(triggersTable.serverId, input.serverId), eq(triggersTable.id, row.triggerId))
            );
        if (desired) {
            const notice = {
                ownerAgentId: row.ownerAgentId,
                problem: desired,
                problemSince: input.now,
                triggerId: row.triggerId,
            };
            await enqueueLinearTriggerProblemNotice(tx, {
                ...notice,
                anchorChatId: row.anchorChatId,
                serverId: input.serverId,
                title: row.title,
            });
            entered.push(notice);
        }
    }
    return { entered, problems };
}

/** Linear ids a Trigger names that Linear can delete or archive. */
export function referencedObjectIds(groups: LinearTriggerGroups): string[] {
    return groups.flatMap((group) => [
        ...(group.labels ?? []),
        ...(group.labelsIgnore ?? []),
        ...(group.projects ?? []),
        ...('stateFrom' in group ? (group.stateFrom ?? []) : []),
        ...('stateTo' in group ? (group.stateTo ?? []) : []),
        ...('projectStatuses' in group ? (group.projectStatuses ?? []) : []),
    ]);
}

type TriggerProblemRow = Awaited<ReturnType<typeof armedLinearTriggers>>[number];

interface WorkspaceFacts {
    accessTeams: Map<string, Set<string>>;
    grants: Set<string>;
}

function deriveProblem(
    row: TriggerProblemRow,
    facts: WorkspaceFacts,
    references: LinearReferenceFacts | undefined
): LinearTriggerProblem | null {
    const { workspace } = row;
    if (workspace.status === 'removed' || workspace.connectionId === null) {
        return 'workspace_removed';
    }
    if (workspace.status !== 'active' || row.connected !== true) {
        return 'sign_in_required';
    }
    if (!facts.grants.has(`${workspace.connectionId}:${row.ownerAgentId}`)) {
        return 'agent_access_revoked';
    }
    const access = facts.accessTeams.get(workspace.id) ?? new Set<string>();
    const teams = row.groups.flatMap((group) => group.teams ?? []);
    if (access.size === 0 || teams.some((teamId) => !access.has(teamId))) {
        return 'teams_unavailable';
    }
    const named = referencedObjectIds(row.groups);
    if (references && named.some((id) => references.unavailable.has(id))) {
        return 'references_unavailable';
    }
    // Without a full sweep's answer a removed reference stays removed.
    return row.problem === 'references_unavailable' && !references?.complete
        ? 'references_unavailable'
        : null;
}

async function armedLinearTriggers(tx: HausDatabase, serverId: string, scope: LinearProblemScope) {
    if ('triggerIds' in scope && scope.triggerIds.length === 0) {
        return [];
    }
    return await tx
        .select({
            anchorChatId: triggersTable.anchorChatId,
            connected: mcpConnectionsTable.connected,
            groups: linearTriggerConfigsTable.groups,
            ownerAgentId: triggersTable.ownerAgentId,
            problem: linearTriggerConfigsTable.problem,
            title: triggersTable.title,
            triggerId: linearTriggerConfigsTable.triggerId,
            workspace: {
                connectionId: linearWorkspacesTable.connectionId,
                id: linearWorkspacesTable.id,
                status: linearWorkspacesTable.status,
            },
        })
        .from(linearTriggerConfigsTable)
        .innerJoin(
            triggersTable,
            and(
                eq(triggersTable.serverId, linearTriggerConfigsTable.serverId),
                eq(triggersTable.id, linearTriggerConfigsTable.triggerId)
            )
        )
        .innerJoin(
            linearWorkspacesTable,
            and(
                eq(linearWorkspacesTable.serverId, linearTriggerConfigsTable.serverId),
                eq(linearWorkspacesTable.id, linearTriggerConfigsTable.workspaceId)
            )
        )
        .leftJoin(
            mcpConnectionsTable,
            and(
                eq(mcpConnectionsTable.serverId, linearWorkspacesTable.serverId),
                eq(mcpConnectionsTable.id, linearWorkspacesTable.connectionId)
            )
        )
        .where(
            and(
                eq(linearTriggerConfigsTable.serverId, serverId),
                'workspaceId' in scope
                    ? eq(linearTriggerConfigsTable.workspaceId, scope.workspaceId)
                    : undefined,
                'triggerIds' in scope
                    ? inArray(linearTriggerConfigsTable.triggerId, [...scope.triggerIds])
                    : undefined,
                'ownerAgentId' in scope
                    ? eq(triggersTable.ownerAgentId, scope.ownerAgentId)
                    : undefined,
                eq(triggersTable.status, 'armed'),
                isNull(triggersTable.deletedAt)
            )
        )
        .for('update', { of: linearTriggerConfigsTable });
}

async function workspaceFacts(
    tx: HausDatabase,
    rows: readonly TriggerProblemRow[],
    now: Date
): Promise<WorkspaceFacts> {
    const accessTeams = new Map<string, Set<string>>();
    for (const workspaceId of new Set(rows.map((row) => row.workspace.id))) {
        const credentialId = await workspaceCredentialId(tx, workspaceId);
        const access = credentialId ? await readTeamAccess(tx, credentialId, now) : null;
        accessTeams.set(workspaceId, new Set(access?.teams.map((team) => team.id) ?? []));
    }
    const connectionIds = [...new Set(rows.flatMap((row) => row.workspace.connectionId ?? []))];
    const grants =
        connectionIds.length === 0
            ? []
            : await tx
                  .select({
                      agentId: agentMcpConnectionGrantsTable.agentId,
                      connectionId: agentMcpConnectionGrantsTable.connectionId,
                  })
                  .from(agentMcpConnectionGrantsTable)
                  .where(inArray(agentMcpConnectionGrantsTable.connectionId, connectionIds));
    return {
        accessTeams,
        grants: new Set(grants.map((grant) => `${grant.connectionId}:${grant.agentId}`)),
    };
}
