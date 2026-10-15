import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    linearAgentLabelsTable,
    linearLabelGroupsTable,
    linearOutboxTable,
    linearTeamAccessTable,
} from '../postgres/schema.ts';
import { type LinearWorkspaceRef, workspaceCredentialId } from './agent-label-reads.ts';
import { enqueueLinearOutbox } from './outbox.ts';

// Haus's `Agent` labels (specs/linear-app.md#agent-labels-and-delegation): one
// single-select group per accessible team, one label per granted Agent. Haus
// only ever touches Linear objects whose ids are in these tables.

/** The single-select label group's name in every team. */
export const agentLabelGroupName = 'Agent';

/**
 * Gives every granted Agent (or only `agentIds`) a `pending` label row in
 * every team of workspace access that lacks a live one, and enqueues the
 * Linear creates: the team's group first when it has none, then each label.
 */
export async function ensurePendingAgentLabels(
    tx: HausDatabase,
    workspace: LinearWorkspaceRef,
    input: { agentIds?: readonly string[]; now: Date }
): Promise<number> {
    const credentialId = await workspaceCredentialId(tx, workspace.id);
    if (!(credentialId && workspace.connectionId)) {
        return 0;
    }
    const teams = await tx
        .select({ teamId: linearTeamAccessTable.teamId })
        .from(linearTeamAccessTable)
        .where(eq(linearTeamAccessTable.credentialId, credentialId));
    const agents = await grantedAgents(tx, workspace, input.agentIds);
    let created = 0;
    for (const { teamId } of teams) {
        const missing: { displayName: string; id: string }[] = [];
        for (const agent of agents) {
            const inserted = await tx
                .insert(linearAgentLabelsTable)
                .values({
                    agentId: agent.id,
                    id: createOpaqueId('lnb'),
                    serverId: workspace.serverId,
                    state: 'pending',
                    teamId,
                    workspaceId: workspace.id,
                })
                .onConflictDoNothing()
                .returning({ id: linearAgentLabelsTable.id });
            const [row] = inserted;
            if (row) {
                missing.push({ displayName: agent.displayName, id: row.id });
            }
        }
        if (missing.length === 0) {
            continue;
        }
        await ensureLabelGroup(tx, workspace, { credentialId, now: input.now, teamId });
        for (const label of missing) {
            await enqueueLinearOutbox(
                tx,
                {
                    credentialId,
                    input: { agentLabelRowId: label.id, name: label.displayName, teamId },
                    kind: 'label_create',
                    serverId: workspace.serverId,
                    workspaceId: workspace.id,
                },
                input.now
            );
            created += 1;
        }
    }
    return created;
}

/**
 * Archives one Agent's live labels in the given workspaces. A label Linear
 * already created is archived there too; a pending one is archived by the
 * outbox once its create lands.
 */
export async function archiveAgentLabels(
    tx: HausDatabase,
    workspaces: readonly LinearWorkspaceRef[],
    input: { agentId: string; now: Date }
): Promise<void> {
    for (const workspace of workspaces) {
        const archived = await tx
            .update(linearAgentLabelsTable)
            .set({ state: 'archived', updatedAt: input.now })
            .where(
                and(
                    eq(linearAgentLabelsTable.workspaceId, workspace.id),
                    eq(linearAgentLabelsTable.agentId, input.agentId),
                    ne(linearAgentLabelsTable.state, 'archived')
                )
            )
            .returning({ labelId: linearAgentLabelsTable.labelId });
        const credentialId = await workspaceCredentialId(tx, workspace.id);
        for (const { labelId } of archived) {
            if (labelId && credentialId) {
                await enqueueLinearOutbox(
                    tx,
                    {
                        credentialId,
                        input: { labelId },
                        kind: 'label_archive',
                        serverId: workspace.serverId,
                        workspaceId: workspace.id,
                    },
                    input.now
                );
            }
        }
    }
}

/** Renames one Agent's created labels everywhere on its Server, after the Agent's rename. */
export async function renameAgentLabels(
    tx: HausDatabase,
    input: { agentId: string; name: string; now: Date; serverId: string }
): Promise<void> {
    const labels = await tx
        .select({
            labelId: linearAgentLabelsTable.labelId,
            workspaceId: linearAgentLabelsTable.workspaceId,
        })
        .from(linearAgentLabelsTable)
        .where(
            and(
                eq(linearAgentLabelsTable.serverId, input.serverId),
                eq(linearAgentLabelsTable.agentId, input.agentId),
                eq(linearAgentLabelsTable.state, 'active')
            )
        );
    for (const label of labels) {
        const credentialId = await workspaceCredentialId(tx, label.workspaceId);
        if (label.labelId && credentialId) {
            await enqueueLinearOutbox(
                tx,
                {
                    credentialId,
                    input: { labelId: label.labelId, name: input.name },
                    kind: 'label_rename',
                    serverId: input.serverId,
                    workspaceId: label.workspaceId,
                },
                input.now
            );
        }
    }
}

async function grantedAgents(
    tx: HausDatabase,
    workspace: LinearWorkspaceRef,
    only: readonly string[] | undefined
) {
    if (!workspace.connectionId || only?.length === 0) {
        return [];
    }
    return await tx
        .select({ displayName: agentsTable.displayName, id: agentsTable.id })
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
                eq(agentMcpConnectionGrantsTable.serverId, workspace.serverId),
                eq(agentMcpConnectionGrantsTable.connectionId, workspace.connectionId),
                isNull(agentsTable.retiredAt),
                only ? inArray(agentsTable.id, [...only]) : undefined
            )
        );
}

/** Enqueues the team's group create once: not when it exists or one is already queued. */
async function ensureLabelGroup(
    tx: HausDatabase,
    workspace: LinearWorkspaceRef,
    input: { credentialId: string; now: Date; teamId: string }
) {
    const [group] = await tx
        .select({ id: linearLabelGroupsTable.groupLabelId })
        .from(linearLabelGroupsTable)
        .where(
            and(
                eq(linearLabelGroupsTable.workspaceId, workspace.id),
                eq(linearLabelGroupsTable.teamId, input.teamId)
            )
        )
        .limit(1);
    const [queued] = await tx
        .select({ id: linearOutboxTable.id })
        .from(linearOutboxTable)
        .where(
            and(
                eq(linearOutboxTable.workspaceId, workspace.id),
                eq(linearOutboxTable.kind, 'label_group_create'),
                eq(linearOutboxTable.state, 'queued'),
                sql`${linearOutboxTable.input}->>'teamId' = ${input.teamId}`
            )
        )
        .limit(1);
    if (group || queued) {
        return;
    }
    await enqueueLinearOutbox(
        tx,
        {
            credentialId: input.credentialId,
            input: { name: agentLabelGroupName, teamId: input.teamId },
            kind: 'label_group_create',
            serverId: workspace.serverId,
            workspaceId: workspace.id,
        },
        input.now
    );
}
