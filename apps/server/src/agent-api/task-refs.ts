import type { Board, BoardColumn, TaskActor } from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { BoardNotFoundError } from '../boards/board-errors.ts';
import { listBoards } from '../boards/board-read.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serverMembershipsTable, taskLabelsTable } from '../postgres/schema.ts';
import { stripAt } from './claim-row.ts';
import { AgentTaskInputError } from './task-route-shell.ts';

type Reader = Pick<HausDatabase, 'select'>;

/** The calling Agent as a Task actor. */
export function agentActor(runner: Pick<ResolvedRunner, 'agentId'>): TaskActor {
    return { agentId: runner.agentId, kind: 'agent' };
}

/** Every board on the Server, archived ones included: an Agent may address them by key. */
export async function readAgentBoards(db: Reader, runner: ResolvedRunner): Promise<Board[]> {
    return await listBoards(db, agentActor(runner), {
        includeArchived: true,
        serverId: runner.serverId,
    });
}

export function requireBoardByKey(boards: readonly Board[], key: string): Board {
    const board = boards.find((candidate) => candidate.key === key);
    if (!board) {
        throw new BoardNotFoundError();
    }
    return board;
}

export function requireBoardById(boards: readonly Board[], id: string): Board {
    const board = boards.find((candidate) => candidate.id === id);
    if (!board) {
        throw new BoardNotFoundError();
    }
    return board;
}

/** A column by id, or by name in any case: column names are unique that way on a board. */
export function resolveBoardColumn(board: Board, value: string): BoardColumn {
    const wanted = value.toLowerCase();
    const column = board.columns.find(
        (candidate) => candidate.id === value || candidate.name.toLowerCase() === wanted
    );
    if (!column) {
        const names = board.columns.map((candidate) => candidate.name).join(', ');
        throw new AgentTaskInputError(
            `Board ${board.key} has no column "${value}". It has: ${names}.`
        );
    }
    return column;
}

/**
 * `me`, or the handle of an active person or Agent of the Server (with or without
 * the `@`). Every member and Agent can hold a Task, so there is no Chat to check.
 */
export async function resolveTaskAssignee(
    db: Reader,
    runner: ResolvedRunner,
    value: string
): Promise<TaskActor> {
    if (value === 'me') {
        return agentActor(runner);
    }
    const handle = stripAt(value);
    const agents = await db
        .select({ agentId: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                sql`lower(${agentsTable.handle}) = lower(${handle})`,
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    const humans = await db
        .select({ userId: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, runner.serverId),
                sql`lower(${serverMembershipsTable.handle}) = lower(${handle})`,
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    const [agent] = agents;
    const [human] = humans;
    if (agent && human) {
        throw new AgentTaskInputError(`@${handle} names both a person and an Agent.`);
    }
    if (agent) {
        return { agentId: agent.agentId, kind: 'agent' };
    }
    if (human) {
        return { kind: 'user', userId: human.userId };
    }
    throw new AgentTaskInputError(`Nobody on this Server has the handle @${handle}.`);
}

/** Label ids for names from the Server's task label catalog, in any case. */
export async function resolveTaskLabels(
    db: Reader,
    serverId: string,
    names: readonly string[]
): Promise<string[]> {
    if (names.length === 0) {
        return [];
    }
    const wanted = [...new Set(names.map((name) => name.toLowerCase()))];
    const labels = await db
        .select({ id: taskLabelsTable.id, name: sql<string>`lower(${taskLabelsTable.name})` })
        .from(taskLabelsTable)
        .where(
            and(
                eq(taskLabelsTable.serverId, serverId),
                inArray(sql`lower(${taskLabelsTable.name})`, wanted)
            )
        );
    const byName = new Map(labels.map((label) => [label.name, label.id]));
    const missing = wanted.filter((name) => !byName.has(name));
    if (missing.length > 0) {
        throw new AgentTaskInputError(`No task label is named: ${missing.join(', ')}.`);
    }
    return wanted.flatMap((name) => byName.get(name) ?? []);
}
