import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearWorkspacesTable } from '../postgres/schema/linear.ts';
import { readActorCredential } from './credentials.ts';

// The workspace token a chip read or a thumbnail fetch uses. Chips never
// refresh: a token that is not `valid` and unexpired reads as unavailable, and
// the Server's refresh owner keeps the credential current.

/** The workspace actor's live access token, or null. */
export async function chipWorkspaceToken(
    db: HausDatabase,
    workspaceId: string,
    now = Date.now()
): Promise<string | null> {
    const credential = await readActorCredential(db, { identityId: null, workspaceId });
    return credential?.state === 'valid' && credential.accessExpiresAt.getTime() > now
        ? credential.accessToken
        : null;
}

/** The token behind an `active` workspace's connection, or null. */
export async function chipConnectionToken(
    db: HausDatabase,
    connectionId: string,
    now = Date.now()
): Promise<string | null> {
    const [workspace] = await db
        .select({ id: linearWorkspacesTable.id })
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.connectionId, connectionId),
                eq(linearWorkspacesTable.status, 'active')
            )
        )
        .limit(1);
    return workspace ? await chipWorkspaceToken(db, workspace.id, now) : null;
}
