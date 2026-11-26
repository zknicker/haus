import { type AgentTaskReportInput, formatTaskTarget, formatUserReferenceTarget } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { findChatAccess } from '../chats/chat-access.ts';
import { sendAgentMessage } from '../chats/send-agent-message.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    serverMembershipsTable,
    taskFollowsTable,
    taskReportsTable,
    tasksTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isCaptainDirectedRun, queueCrewReport } from './crew-report.ts';
import { TaskInvariantError, TaskRefusalError } from './task-errors.ts';
import { readTask } from './task-read.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export async function reportTaskTurn(
    db: HausDatabase,
    agentDelivery: AgentDelivery,
    input: AgentTaskReportInput & { agentId: string; runId: string; serverId: string }
) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        const task = await requireReportingTask(tx, input);
        const person = input.person ? await requirePerson(tx, task, input.person) : null;
        const sent = await sendAgentMessage(
            tx,
            {
                agentId: input.agentId,
                attachmentIds: [],
                chatId: task.chatId,
                completesReply: true,
                content: reportContent(input, person),
                nonce: createOpaqueId('non'),
                runId: input.runId,
                serverId,
                target: formatTaskTarget(task.shortId),
            },
            agentDelivery
        );
        await tx.insert(taskReportsTable).values({
            ask: input.ask ?? null,
            id: createOpaqueId('trp'),
            messageId: sent.receipt.messageId,
            outcome: input.outcome,
            personUserId: person?.id ?? null,
            runId: input.runId,
            serverId,
            taskId: task.id,
        });
        const captainWake = await reachCaptain(tx, task, {
            ask: input.ask ?? null,
            outcome: input.outcome,
            person,
            runId: input.runId,
            text: input.text,
        });
        return {
            ...sent,
            reachesCaptain: captainWake !== null,
            task: await readTask(tx, serverId, task.id),
            wakes: [...sent.wakes, ...(captainWake ? [captainWake] : [])],
        };
    });
}

async function reachCaptain(
    tx: Tx,
    task: Awaited<ReturnType<typeof requireReportingTask>>,
    report: {
        ask: string | null;
        outcome: AgentTaskReportInput['outcome'];
        person: { handle: string; id: string } | null;
        runId: string;
        text: string;
    }
) {
    if (!task.captainId) {
        return null;
    }
    if (report.outcome === 'needs-you' && report.person) {
        return null;
    }
    const crew = { ...task, captainId: task.captainId };
    const directed = await isCaptainDirectedRun(tx, crew, report.runId);
    if (!(directed || report.outcome === 'failed' || report.outcome === 'needs-you')) {
        return null;
    }
    return await queueCrewReport(tx, crew, {
        ask: report.ask,
        outcome: report.outcome,
        person: null,
        runId: report.runId,
        text: report.text,
    });
}

async function requireReportingTask(tx: Tx, input: { agentId: string; serverId: string }) {
    const [task] = await tx
        .select({
            agentId: tasksTable.agentId,
            archivedAt: tasksTable.archivedAt,
            captainId: tasksTable.captainId,
            chatId: tasksTable.chatId,
            id: tasksTable.id,
            serverId: tasksTable.serverId,
            shortId: tasksTable.shortId,
            title: tasksTable.title,
        })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.agentId, input.agentId)))
        .limit(1);
    if (!(task?.agentId && task.chatId)) {
        throw new TaskInvariantError('Only a Task reports its turn. Captains answer in chat.');
    }
    if (task.archivedAt) {
        throw new TaskRefusalError('TASK_ARCHIVED', 'This Task is archived.');
    }
    return { ...task, agentId: task.agentId, chatId: task.chatId };
}

async function requirePerson(
    tx: Tx,
    task: { chatId: string; id: string; serverId: string },
    handle: string
) {
    const [member] = await tx
        .select({ handle: serverMembershipsTable.handle, id: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, task.serverId),
                sql`lower(${serverMembershipsTable.handle}) = lower(${handle.replace(/^@/u, '')})`,
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    const reads =
        member?.handle &&
        (await findChatAccess(tx, member.id, { chatId: task.chatId, serverId: task.serverId }));
    if (member?.handle && reads) {
        return { handle: member.handle, id: member.id };
    }
    const followers = await readFollowerHandles(tx, task);
    throw new TaskRefusalError(
        'TASK_PERSON_UNKNOWN',
        `No person @${handle.replace(/^@/u, '')} can read this Task.${
            followers.length > 0
                ? ` Its followers: ${followers.map((f) => `@${f}`).join(', ')}.`
                : ''
        }`
    );
}

async function readFollowerHandles(tx: Tx, task: { chatId: string; serverId: string }) {
    const rows = await tx
        .select({ handle: serverMembershipsTable.handle })
        .from(taskFollowsTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, taskFollowsTable.serverId),
                eq(serverMembershipsTable.userId, taskFollowsTable.userId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .where(
            and(
                eq(taskFollowsTable.serverId, task.serverId),
                eq(taskFollowsTable.taskChatId, task.chatId),
                eq(taskFollowsTable.followed, true)
            )
        )
        .limit(10);
    return rows.flatMap((row) => (row.handle ? [row.handle] : []));
}

function reportContent(
    input: Pick<AgentTaskReportInput, 'ask' | 'text'>,
    person: { handle: string; id: string } | null
) {
    const mention = person ? `[@${person.handle}](${formatUserReferenceTarget(person.id)})` : null;
    return [input.text, input.ask, mention].filter(Boolean).join('\n\n');
}
