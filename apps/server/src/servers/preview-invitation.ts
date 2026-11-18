import { eq } from 'drizzle-orm';
import { listVerifiedEmails } from '../identity/human-identities.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverInvitationsTable, serversTable } from '../postgres/schema.ts';
import { isLiveInvitation } from './accept-invitation.ts';
import { InvitationNotAcceptableError } from './invitation-access.ts';
import { hashInvitationToken } from './invitation-token.ts';

export interface ServerInvitationPreview {
    /** Whether the caller's verified addresses include the invitation address. */
    emailMatches: boolean;
    serverDisplayName: string;
    serverSlug: string;
}

/**
 * What an invited human may see before accepting: which Server invited them and
 * whether their signed-in identity can accept. The bound address is never
 * returned — a token holder must not learn someone else's email.
 */
export async function previewServerInvitation(
    db: HausDatabase,
    userId: string,
    token: string
): Promise<ServerInvitationPreview> {
    const [invitation] = await db
        .select({
            displayName: serversTable.displayName,
            email: serverInvitationsTable.email,
            isLive: isLiveInvitation(),
            slug: serversTable.slug,
        })
        .from(serverInvitationsTable)
        .innerJoin(serversTable, eq(serversTable.id, serverInvitationsTable.serverId))
        .where(eq(serverInvitationsTable.tokenHash, hashInvitationToken(token)))
        .limit(1);

    if (!invitation?.isLive) {
        throw new InvitationNotAcceptableError();
    }

    const verifiedEmails = await listVerifiedEmails(db, userId);

    return {
        emailMatches: verifiedEmails.includes(invitation.email),
        serverDisplayName: invitation.displayName,
        serverSlug: invitation.slug,
    };
}
