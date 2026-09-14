import type { AgentAskInput, AgentAskReceipt, ServerDurableEvent } from '@haus/api';
import { agentAskInputSchema } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import {
    findAgentMessageByNonce,
    planAgentAuthoredMessage,
    writeAgentAuthoredMessage,
} from '../chats/agent-authored-message.ts';
import { canonicalizeAgentMessageContentForPersistence } from '../chats/canonicalize-agent-references.ts';
import { findChatAccess } from '../chats/chat-access.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { asksTable, serverMembershipsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { insertAskEvent } from './ask-events.ts';
import { findAskByMessage } from './ask-shape.ts';
import { AskConflictError, InvalidAskAddresseeError } from './errors.ts';

export interface CreateAskResult {
    events: ServerDurableEvent[];
    receipt: AgentAskReceipt;
    wakes: Array<{ agentId: string; serverId: string }>;
}

/**
 * Writes one Ask: the Agent-authored Message, the Ask record, the deterministic
 * child Thread when the Ask is top-level, ordinary delivery planning, and the
 * durable events — all in one transaction, idempotent by the message nonce.
 * Every check runs before the first write, so an ineligible addressee or an
 * unreachable target creates nothing.
 */
export async function createAsk(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentAskInput,
    agentDelivery: AgentDelivery
): Promise<CreateAskResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const plan = await planAgentAuthoredMessage(tx, runner, input.target);

        const existing = await readAskByNonce(tx, runner, plan.chatId, input);
        if (existing) {
            return { events: [], receipt: existing, wakes: [] };
        }

        const addresseeUserId = await resolveAddressee(tx, runner.serverId, plan.chatId, input);
        const content = agentAskInputSchema.shape.content.parse(
            await canonicalizeAgentMessageContentForPersistence(tx, {
                content: input.content,
                serverId: runner.serverId,
            })
        );
        const written = await writeAgentAuthoredMessage(
            tx,
            runner,
            plan,
            { bodyKind: 'ask', content, nonce: input.nonce },
            agentDelivery
        );

        const askId = createOpaqueId('ask');
        await tx.insert(asksTable).values({
            addresseeUserId,
            agentId: runner.agentId,
            chatId: plan.chatId,
            id: askId,
            messageId: written.messageId,
            options: input.options,
            serverId: runner.serverId,
            summary: input.summary,
            title: input.title,
        });

        const events = [
            written.event,
            await insertAskEvent(tx, {
                askId,
                chat: written.chat,
                chatId: plan.chatId,
                messageId: written.messageId,
                sequence: written.sequence,
                serverId: runner.serverId,
            }),
        ];
        const ask = await findAskByMessage(tx, runner.serverId, written.messageId);
        if (!ask) {
            throw new Error('The Ask could not be projected after creation.');
        }

        return {
            events,
            receipt: {
                ask,
                chatId: plan.chatId,
                idempotent: false,
                messageId: written.messageId,
                sequence: written.sequence,
                target: input.target,
            },
            wakes: written.wakes,
        };
    });
}

async function readAskByNonce(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: AgentAskInput
): Promise<AgentAskReceipt | null> {
    const message = await findAgentMessageByNonce(db, {
        chatId,
        nonce: input.nonce,
        serverId: runner.serverId,
    });
    if (!message) {
        return null;
    }
    const content = await canonicalizeAgentMessageContentForPersistence(db, {
        content: input.content,
        existingContent: message.content,
        serverId: runner.serverId,
    });
    const ask = await findAskByMessage(db, runner.serverId, message.id);
    if (
        !ask ||
        message.authorAgentId !== runner.agentId ||
        message.content !== content ||
        ask.title !== input.title ||
        ask.summary !== input.summary ||
        !sameOptions(ask.options, input.options)
    ) {
        throw new AskConflictError();
    }
    return {
        ask,
        chatId,
        idempotent: true,
        messageId: message.id,
        sequence: message.sequence,
        target: input.target,
    };
}

/** Options are ordered — the first is the recommendation — so a reorder is a different Ask. */
function sameOptions(stored: readonly string[], incoming: readonly string[]): boolean {
    return (
        stored.length === incoming.length && stored.every((option, at) => option === incoming[at])
    );
}

/**
 * Humans and Agents share one case-insensitive handle namespace, so an Agent
 * handle simply finds no membership here and fails closed.
 */
async function resolveAddressee(
    db: HausDatabase,
    serverId: string,
    chatId: string,
    input: AgentAskInput
): Promise<string> {
    const [member] = await db
        .select({ userId: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                sql`lower(${serverMembershipsTable.handle}) = lower(${input.addresseeHandle})`,
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    if (!member) {
        throw new InvalidAskAddresseeError();
    }
    if (!(await findChatAccess(db, member.userId, { chatId, serverId }))) {
        throw new InvalidAskAddresseeError();
    }
    return member.userId;
}
