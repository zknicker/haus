import {
    type WorkerOutcome,
    type WorkerTurnEndedFrame,
    artifactPathKey,
    projectWorker,
} from '@haus/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { InboxWork } from '../agent-delivery/inbox-work.ts';
import { readDriveCitationPaths } from '../drive/citation-links.ts';
import { citationBindings } from '../drive/push/close.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    drivePushOutcomesTable,
    messageDriveCitationsTable,
    serverMembershipsTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { readTask } from '../tasks/task-read.ts';
import { type decideComputerTurn, settledStatusOf } from './computer-turn-outcome.ts';
import { seedPullRequestReadings } from './pull-request-readings.ts';
import {
    attachReportedPullRequests,
    closeWhenSettled,
    queueWorkerReport,
    recordOutcome,
} from './settle-worker-turn.ts';
import type { WorkerEffects } from './worker-effects.ts';
import { syncWorkerLifecycle } from './worker-lifecycle.ts';
import { postWorkerReportMessage, workerReportContent } from './worker-report-message.ts';

export async function applyComputerOutcome(
    tx: HausDatabase,
    delivery: InboxWork,
    input: {
        branches: WorkerTurnEndedFrame['branches'];
        decided: ReturnType<typeof decideComputerTurn>;
        turn: typeof workerTurnsTable.$inferSelect;
        worker: typeof workersTable.$inferSelect;
    }
) {
    const { decided, turn, worker } = input;
    const task = worker.taskId ? await readTask(tx, worker.serverId, worker.taskId) : null;
    const messageId = decided.kind === 'report' && task?.chatId ? createOpaqueId('msg') : null;
    const outcome: WorkerOutcome =
        decided.kind === 'report'
            ? {
                  kind: 'report',
                  report: { ...decided.draft, messageId, personRefused: null, source: 'worker' },
              }
            : decided;
    await recordOutcome(tx, { outcome, turnId: turn.id, worker });
    const now = new Date();
    await tx
        .update(workerTurnsTable)
        .set(
            projectWorker({
                startedAt: turn.startedAt ?? now,
                status: settledStatusOf(outcome),
                terminalAt: now,
            })
        )
        .where(
            and(eq(workerTurnsTable.serverId, worker.serverId), eq(workerTurnsTable.id, turn.id))
        );
    await syncWorkerLifecycle(tx, worker.serverId, worker.id);
    const effects: WorkerEffects = { events: [], frames: [], wakes: [] };
    if (outcome.kind === 'report' && task) {
        if (messageId && task.chatId) {
            const person = await personOf(tx, worker.serverId, outcome.report.personId);
            const content = workerReportContent(outcome.report, person);
            const posted = await postWorkerReportMessage(tx, delivery, {
                agentId: worker.agentId,
                chatId: task.chatId,
                content,
                messageId,
                serverId: worker.serverId,
                turnId: turn.id,
            });
            await bindReportCitations(tx, {
                content,
                messageId,
                serverId: worker.serverId,
                turnId: turn.id,
            });
            effects.events.push(posted.event);
            effects.wakes.push(...posted.wakes);
        }
        await attachReportedPullRequests(tx, {
            serverId: worker.serverId,
            taskId: task.id,
            urls: outcome.report.pullRequestUrls,
        });
    }
    await seedPullRequestReadings(tx, {
        branches: input.branches,
        now,
        serverId: worker.serverId,
    });
    const delivered = await queueWorkerReport(tx, delivery, {
        outcome,
        taskChatId: task?.chatId ?? null,
        turnId: turn.id,
        worker,
    });
    if (delivered) {
        effects.wakes.push(delivered);
    }
    await closeWhenSettled(tx, worker);
    return effects;
}

async function personOf(tx: HausDatabase, serverId: string, personId: string | null) {
    if (!personId) {
        return null;
    }
    const [member] = await tx
        .select({ handle: serverMembershipsTable.handle, id: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.userId, personId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    return member?.handle ? { handle: member.handle, id: member.id } : null;
}

async function bindReportCitations(
    tx: HausDatabase,
    input: { content: string; messageId: string; serverId: string; turnId: string }
) {
    const paths = readDriveCitationPaths(input.content);
    if (paths.length === 0) {
        return;
    }
    const outcomes = await tx
        .select({ outcome: drivePushOutcomesTable.outcome })
        .from(drivePushOutcomesTable)
        .where(
            and(
                eq(drivePushOutcomesTable.serverId, input.serverId),
                eq(drivePushOutcomesTable.pushId, input.turnId)
            )
        )
        .orderBy(asc(drivePushOutcomesTable.createdAt), asc(drivePushOutcomesTable.requestId));
    const bindings = citationBindings(outcomes.map((row) => row.outcome));
    const byKey = new Map([...bindings].map(([path, binding]) => [artifactPathKey(path), binding]));
    await tx.insert(messageDriveCitationsTable).values(
        paths.map((path, ordinal) => {
            const bound = byKey.get(artifactPathKey(path));
            return {
                artifactId: bound?.artifactId ?? null,
                messageId: input.messageId,
                ordinal,
                path,
                revisionId: bound?.revisionId ?? null,
                serverId: input.serverId,
            };
        })
    );
}
