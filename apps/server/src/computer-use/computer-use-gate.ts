import {
    desktopCommandClass,
    type InvocationRequestFrame,
    type InvocationResultFrame,
} from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { readActiveRunRequest } from '../agent-delivery/chat-engagement.ts';
import { recordGateRefusal } from '../agent-invocations/invocation-store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, chatsTable } from '../postgres/schema.ts';
import { announceComputerUseRequest } from './computer-use-events.ts';
import {
    hasComputerUseApproval,
    openComputerUseRequest,
    readComputerUseDevice,
} from './computer-use-store.ts';
import { awaitingApprovalText, deviceLabel, noChatText } from './computer-use-texts.ts';

export async function gateDesktopInvocation(
    db: HausDatabase,
    input: {
        computerId: string;
        frame: InvocationRequestFrame;
        invocationId: string;
        serverId: string;
    }
) {
    const { computerId, frame, serverId } = input;
    if (frame.operation.kind !== 'desktop' || desktopCommandClass(frame.operation.args) !== 'act') {
        return null;
    }
    const device = await readComputerUseDevice(db, { computerId, serverId });
    if (!device || device.access === 'always') {
        return null;
    }
    const run = { agentId: frame.agentId, runId: frame.runId, serverId };
    const chatId = await resolveRunChat(db, run);
    const label = deviceLabel(device.name);
    if (!chatId) {
        await recordGateRefusal(db, input.invocationId);
        return refusal(frame, input.invocationId, noChatText(label));
    }
    if (await hasComputerUseApproval(db, { chatId, computerId, serverId })) {
        return null;
    }
    await recordGateRefusal(db, input.invocationId);
    const opened = await openComputerUseRequest(db, {
        ...run,
        args: frame.operation.args,
        chatId,
        computerId,
        toolCallId: frame.toolCallId,
    });
    if (opened) {
        announceComputerUseRequest({ chatId, requestId: opened.id, serverId });
    }
    return refusal(frame, input.invocationId, awaitingApprovalText(label));
}

async function resolveRunChat(
    db: HausDatabase,
    run: { agentId: string; runId: string; serverId: string }
) {
    const request = await readActiveRunRequest(db, run);
    if (request) {
        return request.chatId;
    }
    const [trigger] = await db
        .select({ chatId: chatsTable.id })
        .from(agentRunTriggersTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, agentRunTriggersTable.serverId),
                eq(chatsTable.id, agentRunTriggersTable.chatId),
                isNull(chatsTable.deletedAt)
            )
        )
        .where(
            and(
                eq(agentRunTriggersTable.serverId, run.serverId),
                eq(agentRunTriggersTable.agentId, run.agentId),
                eq(agentRunTriggersTable.runId, run.runId)
            )
        )
        .limit(1);
    return trigger?.chatId ?? null;
}

function refusal(frame: InvocationRequestFrame, invocationId: string, text: string) {
    const answer: InvocationResultFrame = {
        agentId: frame.agentId,
        invocationId,
        outcome: 'failed',
        output: { kind: 'text', text },
        runId: frame.runId,
        seq: frame.seq,
        toolCallId: frame.toolCallId,
        truncated: false,
        type: 'invocation-result',
    };
    return answer;
}
