import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    linearCredentialsTable,
    linearIdentitiesTable,
    linearTeamAccessTable,
} from '../postgres/schema.ts';
import { workspaceCredentialId } from './agent-label-reads.ts';
import type { SessionWorkspace } from './session-agents.ts';

/**
 * B's actor on this team: its identity when `active` with the team in its
 * effective access (identity teams ∩ workspace teams), otherwise the Haus app.
 */
export async function linearAgentActor(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    input: { agentId: string; teamId: string }
): Promise<{ appUserId: string; credentialId: string | null }> {
    const [identity] = await tx
        .select({
            appUserId: linearIdentitiesTable.appUserId,
            credentialId: linearCredentialsTable.id,
        })
        .from(linearIdentitiesTable)
        .innerJoin(
            linearCredentialsTable,
            and(
                eq(linearCredentialsTable.identityId, linearIdentitiesTable.id),
                eq(linearCredentialsTable.state, 'valid')
            )
        )
        .where(
            and(
                eq(linearIdentitiesTable.workspaceId, workspace.id),
                eq(linearIdentitiesTable.agentId, input.agentId),
                eq(linearIdentitiesTable.status, 'active')
            )
        )
        .limit(1);
    if (
        !(
            identity?.appUserId &&
            (await teamInEffectiveAccess(tx, workspace, identity.credentialId, input.teamId))
        )
    ) {
        return { appUserId: workspace.appUserId, credentialId: null };
    }
    return { appUserId: identity.appUserId, credentialId: identity.credentialId };
}

async function teamInEffectiveAccess(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    identityCredentialId: string,
    teamId: string
): Promise<boolean> {
    const workspaceCredential = await workspaceCredentialId(tx, workspace.id);
    if (!workspaceCredential) {
        return false;
    }
    const rows = await tx
        .select({ credentialId: linearTeamAccessTable.credentialId })
        .from(linearTeamAccessTable)
        .where(
            and(
                eq(linearTeamAccessTable.teamId, teamId),
                inArray(linearTeamAccessTable.credentialId, [
                    identityCredentialId,
                    workspaceCredential,
                ])
            )
        );
    return new Set(rows.map((row) => row.credentialId)).size === 2;
}
