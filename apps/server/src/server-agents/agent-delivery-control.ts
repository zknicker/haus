import type { AgentDeliveryControlInput, AgentDeliveryState } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { countQueuedInboxItems, readDeliveryState } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';

/**
 * Authorizes a human Stop/Start of an Agent. Delivery control is an Owner or
 * Admin capability, mirroring Agent configuration.
 */
export async function assertAgentDeliveryAccess(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentDeliveryControlInput
): Promise<void> {
    const server = await requireServerMembership(db, member, input.serverId);
    if (!member) {
        throw new AgentConfigDeniedError('Sign in to control an Agent.');
    }
    if (server.role !== 'owner' && server.role !== 'admin') {
        throw new AgentConfigDeniedError(
            'Only a Server Owner or Admin can Stop or Start an Agent.'
        );
    }
    await requireAgent(db, input);
}

/** Authorizes a human session or full reset of an active Agent. */
export async function assertAgentResetAccess(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentDeliveryControlInput
): Promise<void> {
    await assertAgentDeliveryAccess(db, member, input);
}

/** Reads one Agent's Server-owned delivery state for any Server member. */
export async function readAgentDeliveryState(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentDeliveryControlInput
): Promise<AgentDeliveryState> {
    await requireServerMembership(db, member, input.serverId);
    await requireAgent(db, input);
    const [state, pending] = await Promise.all([
        readDeliveryState(db, input.agentId),
        countQueuedInboxItems(db, input.agentId),
    ]);
    return {
        agentId: input.agentId,
        pending,
        running: Boolean(state?.activeRunId),
        stopped: Boolean(state?.stopped),
    };
}

/**
 * Server membership and the Agent's existence, read at once. A membership
 * failure always wins, so a non-member never learns whether the Agent exists.
 */
export async function requireMemberAgent(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
): Promise<void> {
    const checks = await Promise.allSettled([
        requireServerMembership(db, member, input.serverId),
        requireAgent(db, input),
    ]);
    for (const check of checks) {
        if (check.status === 'rejected') {
            throw check.reason;
        }
    }
}

/** Refuses any read or control targeting an id that is not a live Agent here. */
export async function requireAgent(
    db: HausDatabase,
    input: { agentId: string; serverId: string }
): Promise<void> {
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new AgentConfigDeniedError('No Agent exists with that id.');
    }
}
