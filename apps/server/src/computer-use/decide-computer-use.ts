import { type ComputerUseDecideInput, computerUseInboxSource } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { requireComputerSteward } from '../computers/computer-steward.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, computerUseRequestsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readComputerUseDevice, readPersonName } from './computer-use-store.ts';
import { decisionText, deviceLabel } from './computer-use-texts.ts';

export class ComputerUseRequestMissingError extends Error {
    constructor() {
        super('That Permission request no longer exists.');
        this.name = 'ComputerUseRequestMissingError';
    }
}

export class ComputerUseRequestDecidedError extends Error {
    constructor() {
        super('Someone already answered that Permission request.');
        this.name = 'ComputerUseRequestDecidedError';
    }
}

export async function decideComputerUse(
    db: HausDatabase,
    agentDelivery: Pick<AgentDelivery, 'enqueue'>,
    member: HausUser | null,
    input: ComputerUseDecideInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [request] = await tx
            .select()
            .from(computerUseRequestsTable)
            .where(
                and(
                    eq(computerUseRequestsTable.serverId, input.serverId),
                    eq(computerUseRequestsTable.id, input.requestId)
                )
            )
            .limit(1);
        if (!request) {
            throw new ComputerUseRequestMissingError();
        }
        const steward = await requireComputerSteward(tx, member, {
            computerId: request.computerId,
            serverId: input.serverId,
        });
        if (request.state !== 'requested') {
            throw new ComputerUseRequestDecidedError();
        }
        const standing = input.decision === 'always';
        await tx
            .update(computerUseRequestsTable)
            .set({
                decidedAt: new Date(),
                decidedByUserId: steward.stewardUserId,
                standing,
                state: input.decision === 'deny' ? 'denied' : 'allowed',
            })
            .where(eq(computerUseRequestsTable.id, request.id));
        if (standing) {
            await tx
                .update(computersTable)
                .set({ computerUseAccess: 'always' })
                .where(eq(computersTable.id, request.computerId));
        }
        const device = await readComputerUseDevice(tx, {
            computerId: request.computerId,
            serverId: input.serverId,
        });
        const person = await readPersonName(tx, {
            serverId: input.serverId,
            userId: steward.stewardUserId,
        });
        await agentDelivery.enqueue(tx, {
            agentId: request.agentId,
            chatId: request.chatId,
            content: decisionText({
                decision: input.decision,
                device: deviceLabel(device?.name ?? null),
                person: person ?? 'Someone',
            }),
            dedupeKey: `computer-use:${request.id}`,
            serverId: input.serverId,
            source: computerUseInboxSource,
        });
        return {
            agentId: request.agentId,
            chatId: request.chatId,
            computerId: request.computerId,
            requestId: request.id,
            serverId: input.serverId,
            standing,
        };
    });
}
