import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { computerLoginRefreshTokensTable, computerLoginSessionsTable } from '../postgres/schema.ts';
import { computerLoginError } from './login-errors.ts';
import { computerAccessTokenLifetimeMs } from './login-service.ts';
import { hashComputerSecret } from './service.ts';

export interface ComputerLoginSessionResponse {
    accessToken: string;
    accessTokenExpiresAt: string;
    origin: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
    sessionId: string;
}

export interface ComputerManagementSession {
    accessTokenExpiresAt: Date;
    origin: string;
    refreshTokenExpiresAt: Date;
    sessionId: string;
    userId: string;
}

export async function refreshComputerLogin(
    db: HausDatabase,
    input: { refreshToken: string; sessionId: string }
): Promise<ComputerLoginSessionResponse & { status: 'refreshed' }> {
    if (!(isRefreshToken(input.refreshToken) && isComputerLoginSessionId(input.sessionId))) {
        throw computerLoginError('computer_login_malformed');
    }
    const result = await db.transaction(async (tx) => {
        const [session] = await tx
            .select()
            .from(computerLoginSessionsTable)
            .where(eq(computerLoginSessionsTable.id, input.sessionId))
            .for('update');
        if (!session) {
            throw computerLoginError('computer_login_unauthorized');
        }
        if (session.revokedAt) {
            throw computerLoginError('computer_login_revoked');
        }
        const tokenHash = hashComputerSecret(input.refreshToken);
        const [token] = await tx
            .select()
            .from(computerLoginRefreshTokensTable)
            .where(
                and(
                    eq(computerLoginRefreshTokensTable.sessionId, input.sessionId),
                    eq(computerLoginRefreshTokensTable.tokenHash, tokenHash)
                )
            )
            .for('update');
        if (!token) {
            throw computerLoginError('computer_login_unauthorized');
        }
        if (token.consumedAt || token.revokedAt || session.refreshTokenHash !== tokenHash) {
            await revokeComputerLoginFamily(tx, session.id, new Date());
            return { kind: 'refresh-reused' as const };
        }
        const now = new Date();
        if (token.expiresAt <= now || session.refreshTokenExpiresAt <= now) {
            throw computerLoginError('computer_login_refresh_expired');
        }

        const accessToken = `gcl_at_${randomBytes(32).toString('base64url')}`;
        const refreshToken = `gcl_rt_${randomBytes(32).toString('base64url')}`;
        const accessTokenExpiresAt = new Date(now.getTime() + computerAccessTokenLifetimeMs);
        await tx
            .update(computerLoginRefreshTokensTable)
            .set({ consumedAt: now })
            .where(eq(computerLoginRefreshTokensTable.id, token.id));
        await tx.insert(computerLoginRefreshTokensTable).values({
            expiresAt: session.refreshTokenExpiresAt,
            id: createOpaqueId('crt'),
            sessionId: session.id,
            tokenHash: hashComputerSecret(refreshToken),
        });
        await tx
            .update(computerLoginSessionsTable)
            .set({
                accessTokenExpiresAt,
                accessTokenHash: hashComputerSecret(accessToken),
                refreshTokenHash: hashComputerSecret(refreshToken),
            })
            .where(eq(computerLoginSessionsTable.id, session.id));

        return {
            kind: 'refreshed' as const,
            response: {
                accessToken,
                accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
                origin: session.origin,
                refreshToken,
                refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
                sessionId: session.id,
                status: 'refreshed' as const,
            },
        };
    });
    if (result.kind === 'refresh-reused') {
        throw computerLoginError('computer_login_refresh_reused');
    }
    return result.response;
}

export async function authenticateComputerLogin(
    db: HausDatabase,
    input: { accessToken: string }
): Promise<ComputerManagementSession> {
    if (!isAccessToken(input.accessToken)) {
        throw computerLoginError('computer_login_malformed');
    }
    const [session] = await db
        .select({
            accessTokenExpiresAt: computerLoginSessionsTable.accessTokenExpiresAt,
            userId: computerLoginSessionsTable.userId,
            origin: computerLoginSessionsTable.origin,
            refreshTokenExpiresAt: computerLoginSessionsTable.refreshTokenExpiresAt,
            revokedAt: computerLoginSessionsTable.revokedAt,
            sessionId: computerLoginSessionsTable.id,
        })
        .from(computerLoginSessionsTable)
        .where(
            eq(computerLoginSessionsTable.accessTokenHash, hashComputerSecret(input.accessToken))
        )
        .limit(1);
    if (!session) {
        throw computerLoginError('computer_login_unauthorized');
    }
    if (session.revokedAt) {
        throw computerLoginError('computer_login_revoked');
    }
    if (session.accessTokenExpiresAt <= new Date()) {
        throw computerLoginError('computer_login_unauthorized');
    }
    return session;
}

export async function inspectComputerLogin(db: HausDatabase, input: { accessToken: string }) {
    const session = await authenticateComputerLogin(db, input);
    return {
        accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
        origin: session.origin,
        refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
        scope: 'computer-management' as const,
        sessionId: session.sessionId,
        status: 'active' as const,
    };
}

export async function revokeComputerLogin(
    db: HausDatabase,
    input: { refreshToken: string; sessionId: string }
) {
    if (!(isRefreshToken(input.refreshToken) && isComputerLoginSessionId(input.sessionId))) {
        throw computerLoginError('computer_login_malformed');
    }
    return await db.transaction(async (tx) => {
        const [session] = await tx
            .select()
            .from(computerLoginSessionsTable)
            .where(eq(computerLoginSessionsTable.id, input.sessionId))
            .for('update');
        if (!session) {
            throw computerLoginError('computer_login_unauthorized');
        }
        if (!session.revokedAt) {
            const [token] = await tx
                .select({ id: computerLoginRefreshTokensTable.id })
                .from(computerLoginRefreshTokensTable)
                .where(
                    and(
                        eq(computerLoginRefreshTokensTable.sessionId, session.id),
                        eq(
                            computerLoginRefreshTokensTable.tokenHash,
                            hashComputerSecret(input.refreshToken)
                        )
                    )
                )
                .limit(1);
            if (!token) {
                throw computerLoginError('computer_login_unauthorized');
            }
            await revokeComputerLoginFamily(tx, session.id, new Date());
        }
        return { status: 'revoked' as const };
    });
}

type ComputerLoginTransaction = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

async function revokeComputerLoginFamily(
    tx: ComputerLoginTransaction,
    sessionId: string,
    revokedAt: Date
) {
    await tx
        .update(computerLoginSessionsTable)
        .set({ revokedAt })
        .where(
            and(
                eq(computerLoginSessionsTable.id, sessionId),
                isNull(computerLoginSessionsTable.revokedAt)
            )
        );
    await tx
        .update(computerLoginRefreshTokensTable)
        .set({ revokedAt })
        .where(
            and(
                eq(computerLoginRefreshTokensTable.sessionId, sessionId),
                isNull(computerLoginRefreshTokensTable.revokedAt)
            )
        );
}

function isAccessToken(value: string) {
    return /^gcl_at_[A-Za-z0-9_-]{43}$/u.test(value);
}

function isRefreshToken(value: string) {
    return /^gcl_rt_[A-Za-z0-9_-]{43}$/u.test(value);
}

function isComputerLoginSessionId(value: string) {
    return /^cls_[A-Za-z0-9_-]{16}$/u.test(value);
}
