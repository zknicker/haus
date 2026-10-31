import { randomBytes } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { hausSessionAccessTokensTable, hausSessionsTable, usersTable } from '../postgres/schema.ts';
import type { CloudflareAdmission } from './cloudflare-access.ts';
import { authenticateHausSession } from './haus-session-authentication.ts';
import { hashHausToken, isHausToken } from './haus-session-tokens.ts';
import type { HausSessions, HausSessionsOptions, IssuedHausSession } from './haus-session-types.ts';
import { HausAuthError } from './haus-session-types.ts';
import { resolveCloudflareHuman } from './human-identities.ts';

export { hashHausToken } from './haus-session-tokens.ts';
export type {
    HausAuthErrorCode,
    HausSessionIdentity,
    HausSessions,
    HausSessionsOptions,
    IssuedHausSession,
} from './haus-session-types.ts';
export { HausAuthError } from './haus-session-types.ts';

export const hausAccessTokenLifetimeMs = 60_000;
export const hausResumeLifetimeMs = 14 * 24 * 60 * 60 * 1000;

export function createHausSessions(
    db: HausDatabase,
    options: HausSessionsOptions = {}
): HausSessions {
    const accessLifetimeMs = Math.min(
        options.accessLifetimeMs ?? hausAccessTokenLifetimeMs,
        60 * 60 * 1000
    );
    const now = options.now ?? Date.now;

    const mint = async (input: {
        admission: CloudflareAdmission | null;
        identitySubject: string;
        resumeToken: string;
        sessionId: string;
        sessionExpiresAt: Date;
        userId: string;
    }): Promise<IssuedHausSession> => {
        const issuedAt = now();
        const accessExpiresAt = Math.min(
            issuedAt + accessLifetimeMs,
            input.admission?.expiresAt ?? Number.POSITIVE_INFINITY
        );
        if (accessExpiresAt <= issuedAt) {
            throw new HausAuthError('auth_expired', 'Cloudflare admission expired. Sign in again.');
        }
        const accessToken = randomBytes(32).toString('base64url');
        await db.transaction(async (tx) => {
            await tx
                .delete(hausSessionAccessTokensTable)
                .where(lt(hausSessionAccessTokensTable.expiresAt, new Date(issuedAt)));
            await tx.insert(hausSessionAccessTokensTable).values({
                expiresAt: new Date(accessExpiresAt),
                sessionId: input.sessionId,
                tokenHash: hashHausToken(accessToken),
            });
        });
        const [user] = await db
            .select({
                avatarId: usersTable.avatarId,
                displayName: usersTable.displayName,
                email: usersTable.email,
                id: usersTable.id,
            })
            .from(usersTable)
            .where(eq(usersTable.id, input.userId))
            .limit(1);
        if (!user) {
            throw new Error('Haus session references a missing user.');
        }
        const sessionExpiresAt = input.sessionExpiresAt.toISOString();

        return {
            appSession: {
                accessToken,
                expiresAt: new Date(accessExpiresAt).toISOString(),
                issuedAt: new Date(issuedAt).toISOString(),
                sessionId: input.sessionId,
                user,
            },
            resumeToken: input.resumeToken,
            sessionExpiresAt,
        };
    };

    const create = async (admission: CloudflareAdmission) => {
        const issuedAt = now();
        const resumeToken = randomBytes(32).toString('base64url');
        const sessionExpiresAt = new Date(issuedAt + hausResumeLifetimeMs);
        const user = await resolveCloudflareHuman(db, admission);
        const sessionId = createOpaqueId('has');

        await db.insert(hausSessionsTable).values({
            createdAt: new Date(issuedAt),
            expiresAt: sessionExpiresAt,
            id: sessionId,
            identitySubject: admission.identitySubject,
            resumeTokenHash: hashHausToken(resumeToken),
            userId: user.id,
        });

        return await mint({
            admission,
            identitySubject: admission.identitySubject,
            resumeToken,
            sessionId,
            sessionExpiresAt,
            userId: user.id,
        });
    };

    const resume = async (resumeToken: string | null, admission: CloudflareAdmission) => {
        if (!(resumeToken && isHausToken(resumeToken))) {
            throw new HausAuthError('auth_required', 'Sign in to use this Haus server.');
        }
        const tokenHash = hashHausToken(resumeToken);
        const result = await db.transaction(async (tx) => {
            const [session] = await tx
                .select()
                .from(hausSessionsTable)
                .where(eq(hausSessionsTable.resumeTokenHash, tokenHash))
                .limit(1)
                .for('update');
            if (!session) {
                throw new HausAuthError(
                    'auth_invalid_grant',
                    'This Haus session is no longer valid.'
                );
            }
            if (session.revokedAt) {
                throw new HausAuthError('auth_revoked', 'This Haus session was signed out.');
            }
            if (session.expiresAt.getTime() <= now()) {
                throw new HausAuthError(
                    'auth_expired',
                    'This Haus session expired. Sign in again.'
                );
            }
            if (session.identitySubject !== admission.identitySubject) {
                throw new HausAuthError(
                    'auth_invalid_grant',
                    'This Haus session belongs to another identity.'
                );
            }
            const user = await resolveCloudflareHuman(tx, admission);
            if (user.id !== session.userId) {
                throw new HausAuthError(
                    'auth_invalid_grant',
                    'This Haus session belongs to another user.'
                );
            }
            return session;
        });
        return await mint({
            admission,
            identitySubject: result.identitySubject,
            resumeToken,
            sessionId: result.id,
            sessionExpiresAt: result.expiresAt,
            userId: result.userId,
        });
    };

    return {
        authenticate: (accessToken) => authenticateHausSession(db, accessToken, now),
        create,
        async issueDevelopment(userId, identitySubject) {
            const [user] = await db
                .select({ id: usersTable.id, authSubject: usersTable.authSubject })
                .from(usersTable)
                .where(eq(usersTable.id, userId))
                .limit(1);
            if (!user || user.authSubject !== identitySubject) {
                throw new Error(
                    'Development identity fixture is not configured for this Haus user.'
                );
            }
            const issuedAt = now();
            const resumeToken = randomBytes(32).toString('base64url');
            const sessionExpiresAt = new Date(issuedAt + hausResumeLifetimeMs);
            const sessionId = createOpaqueId('has');
            await db.insert(hausSessionsTable).values({
                createdAt: new Date(issuedAt),
                expiresAt: sessionExpiresAt,
                id: sessionId,
                identitySubject,
                resumeTokenHash: hashHausToken(resumeToken),
                userId,
            });
            return await mint({
                admission: null,
                identitySubject,
                resumeToken,
                sessionId,
                sessionExpiresAt,
                userId,
            });
        },
        async resumeDevelopment(userId, identitySubject, resumeToken) {
            if (!isHausToken(resumeToken)) {
                throw new HausAuthError(
                    'auth_invalid_grant',
                    'This local Haus session is no longer valid.'
                );
            }
            const [session] = await db
                .select()
                .from(hausSessionsTable)
                .where(eq(hausSessionsTable.resumeTokenHash, hashHausToken(resumeToken)))
                .limit(1);
            if (
                !session ||
                session.userId !== userId ||
                session.identitySubject !== identitySubject
            ) {
                throw new HausAuthError(
                    'auth_invalid_grant',
                    'This local Haus session is no longer valid.'
                );
            }
            if (session.revokedAt) {
                throw new HausAuthError('auth_revoked', 'This local Haus session was signed out.');
            }
            if (session.expiresAt.getTime() <= now()) {
                throw new HausAuthError(
                    'auth_expired',
                    'This local Haus session expired. Sign in again.'
                );
            }
            return await mint({
                admission: null,
                identitySubject,
                resumeToken,
                sessionId: session.id,
                sessionExpiresAt: session.expiresAt,
                userId,
            });
        },
        resume,
        async resumeNative(input, admission) {
            const issued = input.sessionToken
                ? await resume(input.sessionToken, admission)
                : await create(admission);
            return {
                session: issued.appSession,
                sessionExpiresAt: issued.sessionExpiresAt,
                sessionToken: issued.resumeToken,
            };
        },
        async revoke(resumeToken) {
            if (!(resumeToken && isHausToken(resumeToken))) {
                return null;
            }
            const nowAt = new Date(now());
            const [revoked] = await db
                .update(hausSessionsTable)
                .set({ revokedAt: nowAt })
                .where(
                    and(
                        eq(hausSessionsTable.resumeTokenHash, hashHausToken(resumeToken)),
                        isNull(hausSessionsTable.revokedAt)
                    )
                )
                .returning({ sessionId: hausSessionsTable.id });
            return revoked?.sessionId ?? null;
        },
    };
}
