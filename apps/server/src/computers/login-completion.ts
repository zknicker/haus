import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computerLoginSessionsTable } from '../postgres/schema.ts';
import { computerLoginError } from './login-errors.ts';
import { hashComputerSecret } from './service.ts';

export async function completeComputerLogin(db: HausDatabase, input: { accessToken: string }) {
    if (!/^gcl_at_[A-Za-z0-9_-]{43}$/u.test(input.accessToken)) {
        throw computerLoginError('computer_login_malformed');
    }
    return await db.transaction(async (tx) => {
        const [session] = await tx
            .select()
            .from(computerLoginSessionsTable)
            .where(
                eq(
                    computerLoginSessionsTable.accessTokenHash,
                    hashComputerSecret(input.accessToken)
                )
            )
            .for('update');
        if (!session) {
            throw computerLoginError('computer_login_not_found');
        }
        if (session.revokedAt) {
            throw computerLoginError('computer_login_revoked');
        }
        if (session.accessTokenExpiresAt <= new Date()) {
            throw computerLoginError('computer_login_unauthorized');
        }
        await tx
            .update(computerLoginSessionsTable)
            .set({ storedAt: new Date() })
            .where(eq(computerLoginSessionsTable.id, session.id));
        return { status: 'completed' as const };
    });
}
