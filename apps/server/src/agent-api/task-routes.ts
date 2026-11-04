import {
    type AgentTaskListQuery,
    agentTaskAssignInputSchema,
    agentTaskCreateInputSchema,
    agentTaskListQuerySchema,
    agentTaskMoveInputSchema,
    agentTaskShowQuerySchema,
    agentTaskUpdateInputSchema,
    openColumnCategories,
    type Task,
    type TaskListAssigneeFilter,
    taskPriorities,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { assignTask } from '../tasks/task-assign.ts';
import type { TaskWriteResult } from '../tasks/task-assignment.ts';
import { createTask } from '../tasks/task-create.ts';
import { countAgentTaskQueue, findTask, getTask, listTasks } from '../tasks/task-list.ts';
import { moveTask } from '../tasks/task-move.ts';
import { updateTask } from '../tasks/task-update.ts';
import {
    agentActor,
    readAgentBoards,
    requireBoardById,
    requireBoardByKey,
    resolveBoardColumn,
    resolveTaskAssignee,
    resolveTaskLabels,
} from './task-refs.ts';
import { agentTaskRead, agentTaskWrite, withImplicitVersion } from './task-route-shell.ts';
import { toAgentTaskRefs, toAgentTaskRows } from './task-view.ts';

const listLimit = 50;
/** Most urgent first; `taskPriorities` lists `none` first for the App's picker. */
const priorityRank = new Map(
    [...taskPriorities.filter((priority) => priority !== 'none'), 'none'].map(
        (priority, rank) => [priority, rank] as const
    )
);

/** The Tasks surface behind `haus task`: every route addresses a Task by its key. */
export function registerAgentTaskRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    const { agentDelivery, db, postCommitWork } = options;

    /** After a write commits: publish, wake, and shape the receipt. */
    const commit = async (runner: ResolvedRunner, result: TaskWriteResult) => {
        publishRealtime(result.events);
        await postCommitWork.wakeAgents(agentDelivery, result.wakes);
        return await taskRow(db, runner, result.task);
    };

    agentTaskRead(
        app,
        db,
        { path: '/api/agent/tasks', query: agentTaskListQuerySchema },
        (runner, query) => listAgentTasks(db, runner, query)
    );

    agentTaskRead(
        app,
        db,
        { path: '/api/agent/tasks/show', query: agentTaskShowQuerySchema },
        async (runner, { key }) => {
            const detail = await getTask(db, agentActor(runner), {
                key,
                serverId: runner.serverId,
            });
            return {
                description: detail.description,
                ...(await toAgentTaskRefs(db, detail)),
                task: await taskRow(db, runner, detail),
            };
        }
    );

    agentTaskWrite(
        app,
        db,
        { body: agentTaskCreateInputSchema, path: '/api/agent/tasks/create' },
        async (runner, input) => {
            const { serverId } = runner;
            const board = requireBoardByKey(await readAgentBoards(db, runner), input.board);
            const result = await createTask(db, agentActor(runner), agentDelivery, {
                ...(input.assignee
                    ? { assignee: await resolveTaskAssignee(db, runner, input.assignee) }
                    : {}),
                boardId: board.id,
                ...(input.column ? { columnId: resolveBoardColumn(board, input.column).id } : {}),
                ...(input.description === undefined ? {} : { description: input.description }),
                ...(input.dueOn === undefined ? {} : { dueOn: input.dueOn }),
                ...(input.labels
                    ? { labelIds: await resolveTaskLabels(db, serverId, input.labels) }
                    : {}),
                ...(input.priority === undefined ? {} : { priority: input.priority }),
                serverId,
                title: input.title,
            });
            return { task: await commit(runner, result) };
        }
    );

    agentTaskWrite(
        app,
        db,
        { body: agentTaskMoveInputSchema, path: '/api/agent/tasks/move' },
        async (runner, input) => {
            const { agentId, serverId } = runner;
            const task = await findTask(db, { key: input.key, serverId });
            const board = requireBoardById(await readAgentBoards(db, runner), task.boardId);
            const columnId = resolveBoardColumn(board, input.column).id;
            const result = await withImplicitVersion(
                input.expectedVersion,
                taskVersion(input.key, serverId),
                (expectedVersion) =>
                    moveTask(db, agentActor(runner), {
                        columnId,
                        expectedVersion,
                        serverId,
                        taskId: task.id,
                    })
            );
            return {
                queue: await countAgentTaskQueue(db, { agentId, serverId }),
                task: await commit(runner, result),
            };
        }
    );

    agentTaskWrite(
        app,
        db,
        { body: agentTaskUpdateInputSchema, path: '/api/agent/tasks/update' },
        async (runner, input) => {
            const { serverId } = runner;
            const task = await findTask(db, { key: input.key, serverId });
            const { description, dueOn, labels, priority, title } = input;
            const patch = {
                ...(description === undefined ? {} : { description }),
                ...(dueOn === undefined ? {} : { dueOn }),
                ...(labels ? { labelIds: await resolveTaskLabels(db, serverId, labels) } : {}),
                ...(priority === undefined ? {} : { priority }),
                ...(title === undefined ? {} : { title }),
            };
            const result = await withImplicitVersion(
                input.expectedVersion,
                taskVersion(input.key, serverId),
                (expectedVersion) =>
                    updateTask(db, agentActor(runner), {
                        expectedVersion,
                        patch,
                        serverId,
                        taskId: task.id,
                    })
            );
            return { task: await commit(runner, result) };
        }
    );

    agentTaskWrite(
        app,
        db,
        { body: agentTaskAssignInputSchema, path: '/api/agent/tasks/assign' },
        async (runner, input) => {
            const { serverId } = runner;
            const task = await findTask(db, { key: input.key, serverId });
            const assignee = input.assignee
                ? await resolveTaskAssignee(db, runner, input.assignee)
                : null;
            const result = await withImplicitVersion(
                input.expectedVersion,
                taskVersion(input.key, serverId),
                (expectedVersion) =>
                    assignTask(db, agentActor(runner), agentDelivery, {
                        assignee,
                        expectedVersion,
                        serverId,
                        taskId: task.id,
                    })
            );
            return { task: await commit(runner, result) };
        }
    );

    /** Reads a Task's version as of now, for a write that named none. */
    function taskVersion(key: string, serverId: string) {
        return async () => (await findTask(db, { key, serverId })).version;
    }
}

/** Matching Tasks by priority then age, the order an Agent works them, limited to one page. */
async function listAgentTasks(db: HausDatabase, runner: ResolvedRunner, query: AgentTaskListQuery) {
    const boards = await readAgentBoards(db, runner);
    const assignee = await assigneeFilter(db, runner, query.assignee);
    const tasks = await listTasks(db, agentActor(runner), {
        ...(assignee ? { assignee } : {}),
        ...(query.board ? { boardId: requireBoardByKey(boards, query.board).id } : {}),
        categories: query.category ?? [...openColumnCategories],
        serverId: runner.serverId,
    });
    const page = [...tasks].sort(byPriority).slice(0, listLimit);
    return {
        omitted: tasks.length - page.length,
        tasks: await toAgentTaskRows(db, runner.serverId, page, boards),
    };
}

async function assigneeFilter(
    db: HausDatabase,
    runner: ResolvedRunner,
    value: string | undefined
): Promise<TaskListAssigneeFilter | undefined> {
    if (value === undefined || value === 'none') {
        return value;
    }
    const assignee = await resolveTaskAssignee(db, runner, value);
    return assignee.kind === 'agent' ? { agentId: assignee.agentId } : { userId: assignee.userId };
}

/** `readTasks` lists oldest first, and the sort is stable, so equal priorities keep that age. */
function byPriority(left: Task, right: Task): number {
    return (priorityRank.get(left.priority) ?? 0) - (priorityRank.get(right.priority) ?? 0);
}

async function taskRow(db: HausDatabase, runner: ResolvedRunner, task: Task) {
    const boards = await readAgentBoards(db, runner);
    const [row] = await toAgentTaskRows(db, runner.serverId, [task], boards);
    if (!row) {
        throw new Error(`Task ${task.key} did not shape into a row.`);
    }
    return row;
}
