import {
    type WorkerReportAttention,
    parseGithubPullRequestUrl,
    workerReportAttentionSchema,
} from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    serverMembershipsTable,
    tasksTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { readTasks } from '../tasks/task-read.ts';
import { pullRequestKey, readPullRequestReadings } from './pull-request-readings.ts';
import { workerPlaceOf } from './worker-row-place.ts';

export async function readWorkerReportAttentions(
    db: HausDatabase,
    serverId: string,
    turnIds: string[]
) {
    if (turnIds.length === 0) {
        return new Map<string, WorkerReportAttention>();
    }
    const rows = await db
        .select({
            carrierComputerId: workersTable.carrierComputerId,
            outcome: workerTurnsTable.outcome,
            place: workersTable.place,
            taskId: workersTable.taskId,
            title: workersTable.title,
            turnId: workerTurnsTable.id,
            turnNumber: sql<number>`(
                select count(*)::int from worker_turns earlier
                where earlier.server_id = ${workerTurnsTable.serverId}
                    and earlier.worker_id = ${workerTurnsTable.workerId}
                    and (earlier.created_at, earlier.id)
                        <= (${workerTurnsTable.createdAt}, ${workerTurnsTable.id})
            )`,
            workerId: workersTable.id,
        })
        .from(workerTurnsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerTurnsTable.serverId),
                eq(workersTable.id, workerTurnsTable.workerId)
            )
        )
        .where(and(eq(workerTurnsTable.serverId, serverId), inArray(workerTurnsTable.id, turnIds)));
    const tasks = await readTasks(db, {
        serverId,
        where: inArray(
            tasksTable.id,
            rows.flatMap((row) => (row.taskId ? [row.taskId] : []))
        ),
    });
    const keyByTask = new Map(tasks.map((task) => [task.id, task.key]));
    const reports = rows.flatMap((row) =>
        row.outcome?.kind === 'report' ? [row.outcome.report] : []
    );
    const people = await readPeople(
        db,
        serverId,
        reports.flatMap((report) => report.personId ?? [])
    );
    const readings = await readPullRequestReadings(
        db,
        serverId,
        reports.flatMap((report) => report.pullRequestUrls.map(parseGithubPullRequestUrl))
    );
    return new Map<string, WorkerReportAttention>(
        rows.map((row) => {
            const report = row.outcome?.kind === 'report' ? row.outcome.report : null;
            const personId = report?.personId ?? null;
            const handle = personId ? people.get(personId) : undefined;
            return [
                row.turnId,
                workerReportAttentionSchema.parse({
                    citedFiles: [],
                    outcome: row.outcome,
                    person: personId && handle ? { handle, id: personId } : null,
                    place: workerPlaceOf(row),
                    pullRequests: (report?.pullRequestUrls ?? []).flatMap((url) => {
                        const key = parseGithubPullRequestUrl(url);
                        const reading = key ? readings.get(pullRequestKey(key)) : undefined;
                        return reading ? [reading] : [];
                    }),
                    taskKey: row.taskId ? keyByTask.get(row.taskId) : undefined,
                    title: row.title,
                    turnId: row.turnId,
                    turnNumber: row.turnNumber,
                    workerId: row.workerId,
                }),
            ];
        })
    );
}

async function readPeople(db: HausDatabase, serverId: string, userIds: string[]) {
    if (userIds.length === 0) {
        return new Map<string, string>();
    }
    const rows = await db
        .select({ handle: serverMembershipsTable.handle, id: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                inArray(serverMembershipsTable.userId, userIds)
            )
        );
    return new Map(rows.flatMap(({ handle, id }) => (handle ? [[id, handle] as const] : [])));
}
