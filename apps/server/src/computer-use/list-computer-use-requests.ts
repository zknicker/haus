import type { ComputerUseRequest, ComputerUseRequestsInput } from '@haus/api';
import { requireChatAccess } from '../chats/chat-access.ts';
import { isComputerSteward } from '../computers/computer-steward.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readChatComputerUseRequests } from './computer-use-store.ts';

export async function listComputerUseRequests(
    db: HausDatabase,
    member: HausUser | null,
    input: ComputerUseRequestsInput
) {
    await requireChatAccess(db, member, input);
    const { role } = await requireServerMembership(db, member, input.serverId);
    const rows = await readChatComputerUseRequests(db, input);
    return rows.map(
        ({ attachedByUserId, attacherName, computerInventory, decidedByName, request }) => {
            const shown: ComputerUseRequest = {
                agentId: request.agentId,
                canDecide: isComputerSteward(role, attachedByUserId, member?.id),
                chatId: request.chatId,
                command: request.command,
                computerId: request.computerId,
                computerName: computerInventory?.name ?? null,
                decidedAt: request.decidedAt?.toISOString() ?? null,
                decidedByName,
                detail: request.detail,
                id: request.id,
                requestedAt: request.requestedAt.toISOString(),
                standing: request.standing,
                state: request.state,
                waitingForName: attacherName,
            };
            return shown;
        }
    );
}
