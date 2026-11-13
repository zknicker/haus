import { and, eq, sql } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import { prepareClaimEvent } from '../claims/claim-events.ts';
import {
    type ClaimStatus,
    claimStatusChangeError,
    claimStatusColumns,
} from '../claims/claim-status-transitions.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, messageClaimsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { AgentClaimError } from './claim-error.ts';
import { hasUnseenClaimThreadContext } from './claim-freshness.ts';
import { findAgentClaims, resolveAgentClaimTarget } from './claim-lookup.ts';
import { claimRow } from './claim-row.ts';
import { messageSelection } from './message-view.ts';

export async function releaseAgentClaim(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { number: number; target: string }
) {
    const { claimChatId } = await resolveAgentClaimTarget(db, runner, input.target);
    const [claim] = await findAgentClaims(db, runner, claimChatId, { numbers: [input.number] });
    return await mutateAgentClaim(db, runner, claim.messageId, claim.version, 'release');
}

export async function updateAgentClaim(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { number: number; status: ClaimStatus; target: string }
) {
    const { claimChatId } = await resolveAgentClaimTarget(db, runner, input.target);
    const [claim] = await findAgentClaims(db, runner, claimChatId, { numbers: [input.number] });
    return await mutateAgentClaim(
        db,
        runner,
        claim.messageId,
        claim.version,
        'update',
        input.status
    );
}

async function mutateAgentClaim(
    db: HausDatabase,
    runner: ResolvedRunner,
    messageId: string,
    expectedVersion: number,
    action: 'release' | 'update',
    status?: ClaimStatus
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const [current] = await tx
            .select()
            .from(messageClaimsTable)
            .where(
                and(
                    eq(messageClaimsTable.serverId, runner.serverId),
                    eq(messageClaimsTable.messageId, messageId)
                )
            )
            .for('update');
        if (!current) {
            throw new AgentClaimError('That claim no longer exists.');
        }
        await requireChatWritable(tx, {
            chatId: current.chatId,
            serverId: runner.serverId,
        });
        await requireMayMutate(tx, runner, current, expectedVersion, action, status);
        const [updated] = await tx
            .update(messageClaimsTable)
            .set({
                ...(action === 'release'
                    ? { assigneeAgentId: null, claimedAt: null }
                    : claimStatusColumns(current, status as ClaimStatus)),
                updatedAt: sql`now()`,
                version: sql`${messageClaimsTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageClaimsTable.serverId, runner.serverId),
                    eq(messageClaimsTable.messageId, messageId),
                    eq(messageClaimsTable.version, expectedVersion)
                )
            )
            .returning({ version: messageClaimsTable.version });
        if (!updated) {
            throw new AgentClaimError('That claim changed; refresh it before updating.');
        }
        const event = prepareClaimEvent({
            chatId: current.chatId,
            messageId: current.messageId,
            serverId: runner.serverId,
            threadChatId: current.threadChatId,
            type: 'claim.updated',
        });
        const [next] = await tx
            .select()
            .from(messageClaimsTable)
            .where(
                and(
                    eq(messageClaimsTable.serverId, runner.serverId),
                    eq(messageClaimsTable.messageId, messageId)
                )
            );
        const [message] = await tx
            .select(messageSelection)
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, runner.serverId),
                    eq(chatMessagesTable.id, messageId)
                )
            );
        return { event, claim: await claimRow(tx, runner, message, next) };
    });
}

async function requireMayMutate(
    tx: HausDatabase,
    runner: ResolvedRunner,
    current: typeof messageClaimsTable.$inferSelect,
    expectedVersion: number,
    action: 'release' | 'update',
    status: ClaimStatus | undefined
) {
    if (current.version !== expectedVersion) {
        throw new AgentClaimError('That claim changed; refresh it before updating.');
    }
    if (action === 'release') {
        if (current.assigneeAgentId !== runner.agentId) {
            throw new AgentClaimError('Only the current assignee may release this claim.');
        }
        if (current.status === 'done') {
            throw new AgentClaimError('Done claims cannot be released.');
        }
        return;
    }
    if (await hasUnseenClaimThreadContext(tx, runner, current)) {
        throw new AgentClaimError(
            'New context exists in this claim thread. Run haus message check before retrying.'
        );
    }
    // Status is member-level: any Agent that can write here may move it along
    // the transition table. Agents hold no Server role, so no force path.
    const refusal = claimStatusChangeError(current, status as ClaimStatus, { force: false });
    if (refusal) {
        throw new AgentClaimError(refusal);
    }
}
