import { AGENT_CLAIM_CREATE_MAX_TITLES } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { AgentMessageRecipientPlan } from '../agent-delivery/message-recipients.ts';
import { replayCloudAgentWorkLinks } from '../chats/cloud-agent-work-links.ts';
import { replayImageGenerationLinks } from '../chats/image-generation-links.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
} from '../postgres/schema.ts';
import { AgentClaimError, AgentClaimNonceReusedError } from './claim-error.ts';
import { queryAgentClaims } from './claim-lookup.ts';
import { claimRow, stripAt } from './claim-row.ts';
import { messageSelection } from './message-view.ts';

export async function resolveClaimAssignee(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    value: string
) {
    const handle = stripAt(value);
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.handle, handle),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new AgentClaimError(`No active Agent has handle @${handle}.`);
    }
    if (agent.id === runner.agentId) {
        return agent.id;
    }
    const [joined] = await db
        .select({ agentId: channelAgentParticipantsTable.agentId })
        .from(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, runner.serverId),
                eq(channelAgentParticipantsTable.chatId, chatId),
                eq(channelAgentParticipantsTable.agentId, agent.id)
            )
        )
        .limit(1);
    if (!joined) {
        throw new AgentClaimError('The assigned Agent must belong to the target Channel.');
    }
    return agent.id;
}

/**
 * Replays a batch already created under this nonce, or returns null when the
 * nonce is fresh. Every index a batch could have used is looked up, so a retry
 * naming fewer or more titles than the original is a reuse, not a partial replay.
 */
export async function replayAgentClaims(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    titles: string[],
    nonce: string,
    assigneeAgentId: string | null
) {
    const existing = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.chatId, chatId),
                inArray(
                    chatMessagesTable.nonce,
                    Array.from({ length: AGENT_CLAIM_CREATE_MAX_TITLES }, (_, index) =>
                        claimNonce(nonce, index)
                    )
                )
            )
        );
    if (existing.length === 0) {
        return null;
    }
    if (existing.length !== titles.length) {
        throw new AgentClaimNonceReusedError();
    }
    const byNonce = new Map(existing.map((message) => [message.nonce, message]));
    // One title at a time: `db` is the caller's transaction connection.
    const rows: Awaited<ReturnType<typeof claimRow>>[] = [];
    for (const [index, title] of titles.entries()) {
        const message = byNonce.get(claimNonce(nonce, index));
        const replayed = message
            ? await replayImageGenerationLinks(db, {
                  content: await replayCloudAgentWorkLinks(db, {
                      content: title.trim(),
                      messageId: message.id,
                      serverId: runner.serverId,
                  }),
                  messageId: message.id,
                  serverId: runner.serverId,
              })
            : null;
        if (message?.authorAgentId !== runner.agentId || message.content !== replayed) {
            throw new AgentClaimNonceReusedError();
        }
        const [claim] = await queryAgentClaims(db, runner, chatId, { messageId: message.id });
        if (!claim) {
            throw new AgentClaimError('That claim creation nonce has no canonical claim.');
        }
        if (claim.assigneeAgentId !== assigneeAgentId) {
            throw new AgentClaimNonceReusedError();
        }
        rows.push(await claimRow(db, runner, message, claim));
    }
    return rows;
}

/** The message nonce for one title of a batch. */
export function claimNonce(nonce: string, index: number) {
    return `${nonce}:${index}`;
}

export function dedupeRecipients(recipients: AgentMessageRecipientPlan[]) {
    const byAgent = new Map<string, AgentMessageRecipientPlan>();
    for (const recipient of recipients) {
        const current = byAgent.get(recipient.agentId);
        byAgent.set(recipient.agentId, {
            addressedReason: recipient.addressedReason ?? current?.addressedReason ?? null,
            agentId: recipient.agentId,
            mentioned: Boolean(current?.mentioned || recipient.mentioned),
            threadFollowReactivated: Boolean(
                current?.threadFollowReactivated || recipient.threadFollowReactivated
            ),
        });
    }
    return [...byAgent.values()];
}
