import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { hausSessionAccessTokensTable, hausSessionsTable, usersTable } from '../postgres/schema.ts';
import { hashHausToken, isHausToken } from './haus-session-tokens.ts';
import { HausAuthError, type HausSessionIdentity } from './haus-session-types.ts';

export async function authenticateHausSession(
    db: HausDatabase,
    accessToken: string | null,
    now: () => number
): Promise<HausSessionIdentity> {
    if (!(accessToken && isHausToken(accessToken))) {
        throw new HausAuthError('auth_required', 'Sign in to use this Haus server.');
    }
    const currentTime = now();
    const [identity] = await db
        .select({
            accessTokenExpiresAt: hausSessionAccessTokensTable.expiresAt,
            avatarId: usersTable.avatarId,
            displayName: usersTable.displayName,
            email: usersTable.email,
            identitySubject: hausSessionsTable.identitySubject,
            revokedAt: hausSessionsTable.revokedAt,
            sessionExpiresAt: hausSessionsTable.expiresAt,
            sessionId: hausSessionsTable.id,
            userId: hausSessionsTable.userId,
        })
        .from(hausSessionAccessTokensTable)
        .innerJoin(
            hausSessionsTable,
            eq(hausSessionsTable.id, hausSessionAccessTokensTable.sessionId)
        )
        .innerJoin(usersTable, eq(usersTable.id, hausSessionsTable.userId))
        .where(eq(hausSessionAccessTokensTable.tokenHash, hashHausToken(accessToken)))
        .limit(1);
    if (!identity) {
        throw new HausAuthError('auth_expired', 'The Haus access session expired. Sign in again.');
    }
    if (identity.revokedAt) {
        throw new HausAuthError('auth_revoked', 'This Haus session was signed out.');
    }
    if (
        identity.accessTokenExpiresAt.getTime() <= currentTime ||
        identity.sessionExpiresAt.getTime() <= currentTime
    ) {
        throw new HausAuthError('auth_expired', 'The Haus access session expired. Sign in again.');
    }
    const { revokedAt: _revokedAt, ...activeIdentity } = identity;
    return {
        ...activeIdentity,
        accessTokenExpiresAt: activeIdentity.accessTokenExpiresAt.getTime(),
        sessionExpiresAt: activeIdentity.sessionExpiresAt.getTime(),
    };
}
