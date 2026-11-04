import { and, eq, isNull } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import {
    assignClaim,
    type ClaimAssigneeInput,
    ClaimClosedAssignError,
} from '../claims/assign-claim.ts';
import { ClaimConflictError, ClaimNotFoundError } from '../claims/claim-errors.ts';
import { InvalidClaimAssigneeError } from '../claims/resolve-claim-assignee.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatMessagesTable, messageClaimsTable } from '../postgres/schema.ts';
import { AgentClaimError } from './claim-error.ts';
import { findAgentClaims, resolveAgentClaimTarget } from './claim-lookup.ts';
import { claimRow, stripAt } from './claim-row.ts';
import { messageSelection } from './message-view.ts';

/**
 * `haus claim assign` / `unassign`: an Agent hands a claim to any member of its
 * Chat, or to nobody. Status never moves; `claim` stays the "I'm starting"
 * verb. The shared assignment path delivers to an assigned Agent exactly as an
 * App assignment does.
 */
export async function assignAgentClaim(
    db: HausDatabase,
    runner: ResolvedRunner,
    agentDelivery: AgentDelivery,
    input: { assignee: null | string; expectedRevision?: number; number: number; target: string }
) {
    const { claimChatId } = await resolveAgentClaimTarget(db, runner, input.target);
    const [found] = await findAgentClaims(db, runner, claimChatId, { numbers: [input.number] });
    const assignee = input.assignee
        ? await resolveAssigneeHandle(db, runner, input.assignee)
        : null;
    const result = await assignClaim(
        db,
        { agentId: runner.agentId, kind: 'agent' },
        agentDelivery,
        {
            assignee,
            expectedVersion: input.expectedRevision,
            messageId: found.messageId,
            serverId: runner.serverId,
        }
    ).catch((cause: unknown) => {
        if (cause instanceof InvalidClaimAssigneeError) {
            throw notAssignable(input.assignee ?? '');
        }
        if (
            cause instanceof ClaimConflictError ||
            cause instanceof ClaimClosedAssignError ||
            cause instanceof ClaimNotFoundError
        ) {
            throw new AgentClaimError(cause.message);
        }
        throw cause;
    });
    const [message] = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.id, found.messageId)
            )
        );
    const [record] = await db
        .select()
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, runner.serverId),
                eq(messageClaimsTable.messageId, found.messageId)
            )
        );
    if (!(message && record)) {
        throw new AgentClaimError('That claim no longer exists.');
    }
    return {
        events: result.events,
        claim: await claimRow(db, runner, message, record),
        wakes: result.wakes,
    };
}

/**
 * A handle names one active Agent; only Agents hold claims (ADR 0037). Missing,
 * human, and out-of-Chat handles all answer the same way, so assignment cannot
 * be used to probe who exists.
 */
async function resolveAssigneeHandle(
    db: HausDatabase,
    runner: ResolvedRunner,
    value: string
): Promise<Exclude<ClaimAssigneeInput, null>> {
    const handle = stripAt(value.trim());
    const agents = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.handle, handle),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(2);
    const [agent] = agents;
    if (!agent || agents.length !== 1) {
        throw notAssignable(value);
    }
    return { agentId: agent.id };
}

function notAssignable(value: string) {
    return new AgentClaimError(`@${stripAt(value.trim())} is not assignable in this chat.`);
}
