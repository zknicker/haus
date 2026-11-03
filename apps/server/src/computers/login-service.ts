import { randomBytes, randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    type ComputerLoginGrantStatus,
    type ComputerLoginPurpose,
    computerLoginGrantsTable,
    computerLoginRefreshTokensTable,
    computerLoginSessionsTable,
} from '../postgres/schema.ts';
import { ComputerLoginError, computerLoginError } from './login-errors.ts';
import { hashComputerSecret } from './service.ts';

export const computerLoginGrantLifetimeMs = 10 * 60 * 1000;
export const computerLoginPollingIntervalMs = 1000;
export const computerAccessTokenLifetimeMs = 15 * 60 * 1000;
export const computerRefreshTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const computerLoginCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeComputerLoginUserCode(value: string): string | null {
    const normalized = value.replace(/[\s-]/gu, '').toUpperCase();
    return /^[A-HJ-NP-Z2-9]{8}$/u.test(normalized) ? normalized : null;
}

export function normalizeComputerOrigin(value: string): string {
    let origin: URL;
    try {
        origin = new URL(value);
    } catch {
        throw new ComputerLoginError(
            'computer_login_invalid_origin',
            'Computer login origin must be a valid HTTP(S) origin.',
            400
        );
    }
    if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
        throw new ComputerLoginError(
            'computer_login_invalid_origin',
            'Computer login origin must be a valid HTTP(S) origin.',
            400
        );
    }
    return origin.origin;
}

export async function beginComputerLogin(
    db: HausDatabase,
    input: { origin: string; purpose?: ComputerLoginPurpose }
) {
    const origin = normalizeComputerOrigin(input.origin);
    const purpose = input.purpose ?? 'login';
    const deviceCode = randomBytes(32).toString('base64url');
    const userCode = createComputerLoginUserCode();
    const expiresAt = new Date(Date.now() + computerLoginGrantLifetimeMs);

    await db.insert(computerLoginGrantsTable).values({
        deviceCodeHash: hashComputerSecret(deviceCode),
        expiresAt,
        id: createOpaqueId('dgr'),
        origin,
        pollingIntervalMs: computerLoginPollingIntervalMs,
        purpose,
        status: 'pending',
        userCodeHash: hashComputerSecret(userCode),
    });

    return {
        deviceCode,
        expiresAt,
        pollingIntervalMs: computerLoginPollingIntervalMs,
        purpose,
        userCode: `${userCode.slice(0, 4)}-${userCode.slice(4)}`,
    };
}

export async function readComputerLoginStatus(db: HausDatabase, input: { userCode: string }) {
    const normalized = normalizeComputerLoginUserCode(input.userCode);
    if (!normalized) {
        return { status: 'malformed' as const };
    }

    const [grant] = await db
        .select({
            expiresAt: computerLoginGrantsTable.expiresAt,
            purpose: computerLoginGrantsTable.purpose,
            storedAt: computerLoginSessionsTable.storedAt,
            status: computerLoginGrantsTable.status,
        })
        .from(computerLoginGrantsTable)
        .leftJoin(
            computerLoginSessionsTable,
            eq(computerLoginSessionsTable.grantId, computerLoginGrantsTable.id)
        )
        .where(eq(computerLoginGrantsTable.userCodeHash, hashComputerSecret(normalized)))
        .limit(1);
    if (!grant) {
        return { status: 'not-found' as const };
    }
    if (grant.status === 'pending' && grant.expiresAt <= new Date()) {
        await db
            .update(computerLoginGrantsTable)
            .set({ status: 'expired' })
            .where(
                and(
                    eq(computerLoginGrantsTable.userCodeHash, hashComputerSecret(normalized)),
                    eq(computerLoginGrantsTable.status, 'pending')
                )
            );
        return loginStatus('expired', grant.purpose);
    }
    if (grant.status === 'consumed' && !grant.storedAt) {
        return loginStatus('approved', grant.purpose);
    }
    return loginStatus(grant.status, grant.purpose);
}

export async function approveComputerLogin(
    db: HausDatabase,
    userId: string,
    input: { userCode: string }
) {
    const normalized = requireComputerLoginUserCode(input.userCode);
    return await db.transaction(async (tx) => {
        const grant = await lockComputerLoginGrant(tx, normalized);
        assertComputerLoginGrant(grant);
        if (grant.status === 'pending' && grant.expiresAt <= new Date()) {
            await expireComputerLoginGrant(tx, grant.id);
            throw computerLoginError('computer_login_expired');
        }
        if (grant.status === 'denied') {
            throw computerLoginError('computer_login_denied');
        }
        if (grant.status === 'expired') {
            throw computerLoginError('computer_login_expired');
        }
        if (grant.status === 'consumed') {
            throw computerLoginError('computer_login_consumed');
        }
        if (grant.status === 'approved') {
            if (grant.approvedByUserId === userId) {
                return loginStatus('approved', grant.purpose);
            }
            throw computerLoginError('computer_login_already_approved');
        }
        await tx
            .update(computerLoginGrantsTable)
            .set({
                approvedAt: new Date(),
                approvedByUserId: userId,
                status: 'approved',
            })
            .where(eq(computerLoginGrantsTable.id, grant.id));
        return loginStatus('approved', grant.purpose);
    });
}

export async function denyComputerLogin(
    db: HausDatabase,
    userId: string,
    input: { userCode: string }
) {
    const normalized = requireComputerLoginUserCode(input.userCode);
    return await db.transaction(async (tx) => {
        const grant = await lockComputerLoginGrant(tx, normalized);
        assertComputerLoginGrant(grant);
        if (grant.status === 'pending' && grant.expiresAt <= new Date()) {
            await expireComputerLoginGrant(tx, grant.id);
            throw computerLoginError('computer_login_expired');
        }
        if (grant.status === 'denied') {
            return loginStatus('denied', grant.purpose);
        }
        if (grant.status === 'expired') {
            throw computerLoginError('computer_login_expired');
        }
        if (grant.status === 'consumed') {
            throw computerLoginError('computer_login_consumed');
        }
        if (grant.status === 'approved') {
            throw computerLoginError('computer_login_already_approved');
        }
        await tx
            .update(computerLoginGrantsTable)
            .set({
                deniedAt: new Date(),
                deniedByUserId: userId,
                status: 'denied',
            })
            .where(eq(computerLoginGrantsTable.id, grant.id));
        return loginStatus('denied', grant.purpose);
    });
}

export async function pollComputerLogin(db: HausDatabase, input: { deviceCode: string }) {
    if (!/^[A-Za-z0-9_-]{32,256}$/u.test(input.deviceCode)) {
        throw computerLoginError('computer_login_malformed');
    }
    return await db.transaction(async (tx) => {
        const [grant] = await tx
            .select()
            .from(computerLoginGrantsTable)
            .where(
                eq(computerLoginGrantsTable.deviceCodeHash, hashComputerSecret(input.deviceCode))
            )
            .for('update');
        assertComputerLoginGrant(grant);
        if (grant.status === 'pending' && grant.expiresAt <= new Date()) {
            await expireComputerLoginGrant(tx, grant.id);
            throw computerLoginError('computer_login_expired');
        }
        if (grant.status === 'pending') {
            return {
                pollingIntervalMs: grant.pollingIntervalMs,
                status: 'pending' as const,
            };
        }
        if (grant.status === 'denied') {
            throw computerLoginError('computer_login_denied');
        }
        if (grant.status === 'expired') {
            throw computerLoginError('computer_login_expired');
        }
        if (grant.status === 'consumed') {
            throw computerLoginError('computer_login_consumed');
        }
        if (!grant.approvedByUserId) {
            throw new Error('Approved Computer login grant has no Haus owner.');
        }

        const now = new Date();
        const accessToken = `gcl_at_${randomBytes(32).toString('base64url')}`;
        const refreshToken = `gcl_rt_${randomBytes(32).toString('base64url')}`;
        const sessionId = createOpaqueId('cls');
        const accessTokenExpiresAt = new Date(now.getTime() + computerAccessTokenLifetimeMs);
        const refreshTokenExpiresAt = new Date(now.getTime() + computerRefreshTokenLifetimeMs);
        await tx.insert(computerLoginSessionsTable).values({
            accessTokenExpiresAt,
            accessTokenHash: hashComputerSecret(accessToken),
            userId: grant.approvedByUserId,
            grantId: grant.id,
            id: sessionId,
            origin: grant.origin,
            refreshTokenExpiresAt,
            refreshTokenHash: hashComputerSecret(refreshToken),
        });
        await tx.insert(computerLoginRefreshTokensTable).values({
            expiresAt: refreshTokenExpiresAt,
            id: createOpaqueId('crt'),
            sessionId,
            tokenHash: hashComputerSecret(refreshToken),
        });
        await tx
            .update(computerLoginGrantsTable)
            .set({ consumedAt: now, status: 'consumed' })
            .where(eq(computerLoginGrantsTable.id, grant.id));

        return {
            accessToken,
            accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
            origin: grant.origin,
            refreshToken,
            refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
            sessionId,
            status: 'approved' as const,
        };
    });
}

function createComputerLoginUserCode() {
    let code = '';
    for (let index = 0; index < 8; index += 1) {
        code += computerLoginCodeAlphabet[randomInt(computerLoginCodeAlphabet.length)];
    }
    return code;
}

function requireComputerLoginUserCode(value: string) {
    const normalized = normalizeComputerLoginUserCode(value);
    if (!normalized) {
        throw computerLoginError('computer_login_malformed');
    }
    return normalized;
}

async function lockComputerLoginGrant(
    tx: Parameters<Parameters<HausDatabase['transaction']>[0]>[0],
    normalizedUserCode: string
) {
    const [grant] = await tx
        .select()
        .from(computerLoginGrantsTable)
        .where(eq(computerLoginGrantsTable.userCodeHash, hashComputerSecret(normalizedUserCode)))
        .for('update');
    return grant;
}

function assertComputerLoginGrant(
    grant: typeof computerLoginGrantsTable.$inferSelect | undefined
): asserts grant is typeof computerLoginGrantsTable.$inferSelect {
    if (!grant) {
        throw computerLoginError('computer_login_not_found');
    }
}

async function expireComputerLoginGrant(
    tx: Parameters<Parameters<HausDatabase['transaction']>[0]>[0],
    id: string
) {
    await tx
        .update(computerLoginGrantsTable)
        .set({ status: 'expired' })
        .where(eq(computerLoginGrantsTable.id, id));
}

function loginStatus(
    status: ComputerLoginGrantStatus,
    purpose: ComputerLoginPurpose
): { purpose?: ComputerLoginPurpose; status: ComputerLoginGrantStatus } {
    return purpose === 'setup' ? { purpose, status } : { status };
}
