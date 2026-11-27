import {
    type AgentTaskListQuery,
    agentTaskListQuerySchema,
    agentTaskShowQuerySchema,
    type Task,
    taskReplayQuerySchema,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { GithubApp } from '../github/github-app.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { AgentModelCatalog } from '../server-agents/agent-model-catalog.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { registerTaskCredentialScope } from '../tasks/task-credential-scope.ts';
import { TaskInvariantError } from '../tasks/task-errors.ts';
import { findTaskByRef, getTask, listTasks } from '../tasks/task-list.ts';
import { readProjectByKey } from '../tasks/task-project.ts';
import { readTaskReplay } from '../tasks/task-replay.ts';
import { announceTaskSessions, type TaskSessionWire } from '../tasks/task-session.ts';
import type { TaskWriteResult } from '../tasks/task-write-result.ts';
import { registerAgentTaskMessageRoutes } from './task-message-routes.ts';
import { registerAgentTaskPlaceRoutes } from './task-place-routes.ts';
import { agentActor } from './task-refs.ts';
import { agentTaskRead } from './task-route-shell.ts';
import { toAgentTaskRefs, toAgentTaskRows } from './task-view.ts';

const listLimit = 50;

/** The Tasks surface behind `haus task`: every route addresses a Task by short id or id. */
export function registerAgentTaskRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        catalog: AgentModelCatalog;
        db: HausDatabase;
        githubApp: GithubApp | null;
        postCommitWork: ServerPostCommitWork;
        sessions: TaskSessionWire;
    }
) {
    const { agentDelivery, db, postCommitWork } = options;

    /** After a write commits: publish, free archived sessions, wake. */
    const commit = async (runner: ResolvedRunner, result: TaskWriteResult) => {
        publishRealtime(result.events);
        announceTaskSessions(options.sessions, result.sessions ?? []);
        await postCommitWork.wakeAgents(agentDelivery, result.wakes);
        return await taskRow(db, runner, result.task);
    };
    registerTaskCredentialScope(app, db);
    registerAgentTaskPlaceRoutes(app, { agentDelivery, catalog: options.catalog, commit, db });
    registerAgentTaskMessageRoutes(app, options);

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
        async (runner, { task: ref }) => {
            const { serverId } = runner;
            const found = await findTaskByRef(db, { ref, serverId });
            const detail = await getTask(db, agentActor(runner), { serverId, taskId: found.id });
            return {
                description: detail.description,
                ...(await toAgentTaskRefs(db, detail)),
                task: await taskRow(db, runner, detail),
            };
        }
    );

    agentTaskRead(
        app,
        db,
        { path: '/api/agent/tasks/replay', query: taskReplayQuerySchema },
        async (runner, { before }) => {
            const replay = await readTaskReplay(db, { ...runner, before });
            if (!replay) {
                throw new TaskInvariantError('Only a Task agent rereads its own chat.');
            }
            return replay;
        }
    );
}

/** Matching Tasks, newest first, limited to one page. */
async function listAgentTasks(db: HausDatabase, runner: ResolvedRunner, query: AgentTaskListQuery) {
    const { serverId } = runner;
    const project = query.project
        ? await readProjectByKey(db, { key: query.project, serverId })
        : null;
    const tasks = await listTasks(db, agentActor(runner), {
        ...(query.archived ? { archived: true } : {}),
        ...(query.all ? {} : { createdBy: agentActor(runner) }),
        ...(project ? { projectId: project.projectId } : {}),
        serverId,
    });
    const page = [...tasks].reverse().slice(0, listLimit);
    return {
        omitted: tasks.length - page.length,
        tasks: await toAgentTaskRows(db, serverId, page),
    };
}

async function taskRow(db: HausDatabase, runner: ResolvedRunner, task: Task) {
    const [row] = await toAgentTaskRows(db, runner.serverId, [task]);
    if (!row) {
        throw new Error(`Task ${task.shortId} did not shape into a row.`);
    }
    return row;
}
