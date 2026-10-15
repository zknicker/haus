import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    linearAgentLabelsTable,
    linearCredentialsTable,
    linearWorkspacesTable,
} from '../postgres/schema.ts';

// Reads over Haus's `Agent` labels and the workspace actor they are made with.

export interface LinearWorkspaceRef {
    connectionId: string | null;
    id: string;
    serverId: string;
}

/** The workspace actor's credential row, which makes every label call. */
export async function workspaceCredentialId(
    tx: HausDatabase,
    workspaceId: string
): Promise<string | null> {
    const [credential] = await tx
        .select({ id: linearCredentialsTable.id })
        .from(linearCredentialsTable)
        .where(
            and(
                eq(linearCredentialsTable.workspaceId, workspaceId),
                isNull(linearCredentialsTable.identityId)
            )
        )
        .limit(1);
    return credential?.id ?? null;
}

/** Live (not `removed`) workspaces on one connection, or on every connection of a Server. */
export async function liveWorkspaces(
    tx: HausDatabase,
    scope: { connectionId: string; serverId: string } | { serverId: string }
): Promise<LinearWorkspaceRef[]> {
    return await tx
        .select({
            connectionId: linearWorkspacesTable.connectionId,
            id: linearWorkspacesTable.id,
            serverId: linearWorkspacesTable.serverId,
        })
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.serverId, scope.serverId),
                ne(linearWorkspacesTable.status, 'removed'),
                'connectionId' in scope
                    ? eq(linearWorkspacesTable.connectionId, scope.connectionId)
                    : undefined
            )
        );
}

/** Which live Agent label rows these Linear label ids are, with their Agents. */
export async function agentLabelsByLinearId(
    tx: HausDatabase,
    workspaceId: string,
    labelIds: readonly string[]
): Promise<{ agentId: string; labelId: string; teamId: string }[]> {
    if (labelIds.length === 0) {
        return [];
    }
    const rows = await tx
        .select({
            agentId: linearAgentLabelsTable.agentId,
            labelId: linearAgentLabelsTable.labelId,
            teamId: linearAgentLabelsTable.teamId,
        })
        .from(linearAgentLabelsTable)
        .where(
            and(
                eq(linearAgentLabelsTable.workspaceId, workspaceId),
                eq(linearAgentLabelsTable.state, 'active'),
                inArray(linearAgentLabelsTable.labelId, [...labelIds])
            )
        );
    return rows.flatMap((row) => (row.labelId ? [{ ...row, labelId: row.labelId }] : []));
}

/** One Agent's created label in one team, if it has one yet. */
export async function agentLabelInTeam(
    tx: HausDatabase,
    input: { agentId: string; teamId: string; workspaceId: string }
): Promise<string | null> {
    const [row] = await tx
        .select({ labelId: linearAgentLabelsTable.labelId })
        .from(linearAgentLabelsTable)
        .where(
            and(
                eq(linearAgentLabelsTable.workspaceId, input.workspaceId),
                eq(linearAgentLabelsTable.teamId, input.teamId),
                eq(linearAgentLabelsTable.agentId, input.agentId),
                eq(linearAgentLabelsTable.state, 'active')
            )
        )
        .limit(1);
    return row?.labelId ?? null;
}
