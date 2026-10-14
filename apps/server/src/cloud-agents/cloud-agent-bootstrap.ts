import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentBootstrapTable,
    cloudAgentCallbacksTable,
    cloudAgentWorkTable,
    computersTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    type CloudAgentCallbackScope,
    CloudAgentInputError,
    cloudAgentCallbackTokenHash,
    requireLiveCloudRun,
} from './cloud-agent-input-store.ts';

export async function requireCloudAgentComputer(db: HausDatabase, credentialHash: string) {
    const [computer] = await db
        .select({ computerId: computersTable.id, serverId: computersTable.serverId })
        .from(computersTable)
        .where(eq(computersTable.credentialHash, credentialHash))
        .limit(1);
    if (!computer) {
        throw new CloudAgentInputError('Computer authorization failed.');
    }
    return computer;
}
export async function registerCloudAgentBootstrap(
    db: HausDatabase,
    input: { credentialHash: string; token: string }
) {
    const computer = await requireCloudAgentComputer(db, input.credentialHash);
    const tokenHash = cloudAgentCallbackTokenHash(input.token);
    const [existing] = await db
        .select()
        .from(cloudAgentBootstrapTable)
        .where(eq(cloudAgentBootstrapTable.computerId, computer.computerId))
        .limit(1);
    if (existing?.tokenHash !== tokenHash) {
        await db
            .insert(cloudAgentBootstrapTable)
            .values({ computerId: computer.computerId, tokenHash })
            .onConflictDoUpdate({
                target: cloudAgentBootstrapTable.computerId,
                set: { tokenHash, verifiedAt: null, protocolVersion: null, remoteVersion: null },
            });
    }
    return computer;
}
export async function readCloudAgentBootstrapStatus(db: HausDatabase, credentialHash: string) {
    const computer = await requireCloudAgentComputer(db, credentialHash);
    const [row] = await db
        .select()
        .from(cloudAgentBootstrapTable)
        .where(eq(cloudAgentBootstrapTable.computerId, computer.computerId))
        .limit(1);
    return {
        configured: Boolean(row),
        verified: Boolean(row?.verifiedAt),
        protocolVersion: row?.protocolVersion ?? null,
        remoteVersion: row?.remoteVersion ?? null,
        verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    };
}
export async function verifyCloudAgentBootstrap(
    db: HausDatabase,
    token: string,
    input: { sessionId: string; promptId: string; protocolVersion: 1; remoteVersion: string }
) {
    const computer = await authorizeCloudAgentBootstrap(db, token);
    if (!supportsBlockingNativeHooks(input.remoteVersion)) {
        await db
            .update(cloudAgentBootstrapTable)
            .set({ verifiedAt: null, protocolVersion: null, remoteVersion: input.remoteVersion })
            .where(eq(cloudAgentBootstrapTable.computerId, computer.computerId));
        throw new CloudAgentInputError(
            'Claude Cloud requires version 2.1.295 or newer for blocking native hooks.'
        );
    }
    await db
        .update(cloudAgentBootstrapTable)
        .set({
            verifiedAt: new Date(),
            protocolVersion: input.protocolVersion,
            remoteVersion: input.remoteVersion,
        })
        .where(eq(cloudAgentBootstrapTable.computerId, computer.computerId));
    return { verified: true, protocolVersion: input.protocolVersion };
}

export async function revokeCloudAgentBootstrap(db: HausDatabase, credentialHash: string) {
    const computer = await requireCloudAgentComputer(db, credentialHash);
    await db
        .delete(cloudAgentBootstrapTable)
        .where(eq(cloudAgentBootstrapTable.computerId, computer.computerId));
    return { revoked: true };
}

function supportsBlockingNativeHooks(version: string) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:\s|$)/u.exec(version);
    if (!match) {
        return false;
    }
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    return major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 295)));
}
export async function authorizeCloudAgentBootstrap(db: HausDatabase, token: string) {
    const [computer] = await db
        .select({ computerId: computersTable.id, serverId: computersTable.serverId })
        .from(cloudAgentBootstrapTable)
        .innerJoin(computersTable, eq(computersTable.id, cloudAgentBootstrapTable.computerId))
        .where(eq(cloudAgentBootstrapTable.tokenHash, cloudAgentCallbackTokenHash(token)))
        .limit(1);
    if (!computer) {
        throw new CloudAgentInputError('Cloud bootstrap authorization failed.');
    }
    return computer;
}
export async function leaseCloudAgentCallback(
    db: HausDatabase,
    token: string,
    input: { workId: string; runId: string }
) {
    const computer = await authorizeCloudAgentBootstrap(db, token);
    const [grant] = await db
        .select()
        .from(cloudAgentBootstrapTable)
        .where(eq(cloudAgentBootstrapTable.computerId, computer.computerId))
        .limit(1);
    if (!grant?.verifiedAt || grant.protocolVersion !== 1) {
        throw new CloudAgentInputError(
            'Verify the installed native Claude hook before launching work.'
        );
    }
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, computer.serverId);
        const [work] = await tx
            .select()
            .from(cloudAgentWorkTable)
            .where(
                and(
                    eq(cloudAgentWorkTable.serverId, computer.serverId),
                    eq(cloudAgentWorkTable.id, input.workId),
                    eq(cloudAgentWorkTable.computerId, computer.computerId)
                )
            )
            .limit(1);
        if (!work || work.provider !== 'claude') {
            throw new CloudAgentInputError(
                'This Computer has not admitted that Claude Cloud work.'
            );
        }
        await requireLiveCloudRun(tx, { serverId: computer.serverId, ...input });
        const leased = createHmac('sha256', token)
            .update(
                JSON.stringify([
                    'haus-claude-callback-v1',
                    computer.serverId,
                    input.workId,
                    input.runId,
                ])
            )
            .digest('base64url');
        const hash = cloudAgentCallbackTokenHash(leased);
        const [existing] = await tx
            .select()
            .from(cloudAgentCallbacksTable)
            .where(eq(cloudAgentCallbacksTable.runId, input.runId))
            .limit(1);
        if (existing && existing.tokenHash !== hash) {
            throw new CloudAgentInputError('The execution callback lease cannot be replaced.');
        }
        if (!existing) {
            await tx
                .insert(cloudAgentCallbacksTable)
                .values({ serverId: computer.serverId, runId: input.runId, tokenHash: hash });
        }
        const scope: CloudAgentCallbackScope = {
            ...computer,
            ...input,
            agentId: work.agentId,
            chatId: work.chatId,
            tokenHash: hash,
            sessionId: existing?.sessionId ?? null,
        };
        return { token: leased, scope };
    });
}
