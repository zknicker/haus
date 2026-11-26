import {
    type AgentIssueListQuery,
    type AgentIssueUpdateInput,
    agentIssueCommentInputSchema,
    agentIssueCreateInputSchema,
    agentIssueLinkInputSchema,
    agentIssueListQuerySchema,
    agentIssueShowQuerySchema,
    agentIssueUpdateInputSchema,
    type Issue,
    type IssuePatch,
    openIssueStates,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import { nameIssueActors } from '../issues/issue-actor-names.ts';
import { addIssueComment } from '../issues/issue-comments.ts';
import { createIssue } from '../issues/issue-create.ts';
import { linkIssueTask, unlinkIssueTask } from '../issues/issue-links.ts';
import { getIssueDetail, listIssues } from '../issues/issue-list.ts';
import { findIssueByCode } from '../issues/issue-read.ts';
import { updateIssue } from '../issues/issue-update.ts';
import type { IssueTx, IssueWriteResult } from '../issues/issue-write.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import {
    agentIssueActor,
    requireAgentHomeProject,
    requireIssueWriter,
    resolveIssueActorRef,
    resolveIssueLabels,
    resolveProjectKey,
    taskIdOfRef,
} from './issue-refs.ts';
import { agentIssueRead, agentIssueWrite, withImplicitIssueVersion } from './issue-route-shell.ts';
import {
    toAgentComment,
    toAgentIssueRow,
    toAgentIssueRows,
    toAgentIssueShow,
} from './issue-view.ts';

const listLimit = 50;

export function registerAgentIssueRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        db: HausDatabase;
        postCommitWork: ServerPostCommitWork;
    }
) {
    const { agentDelivery, db, postCommitWork } = options;
    const publish = async (result: Pick<IssueWriteResult, 'agentWakes' | 'events'>) => {
        publishRealtime(result.events);
        await postCommitWork.wakeAgents(agentDelivery, result.agentWakes);
    };
    const commit = async (runner: ResolvedRunner, result: IssueWriteResult) => {
        await publish(result);
        return { issue: await toAgentIssueRow(db, runner.serverId, result.issue) };
    };

    agentIssueRead(
        app,
        db,
        { path: '/api/agent/issues', query: agentIssueListQuerySchema },
        (runner, query) => listAgentIssues(db, runner, query)
    );

    agentIssueRead(
        app,
        db,
        { path: '/api/agent/issues/show', query: agentIssueShowQuerySchema },
        async (runner, { code }) =>
            toAgentIssueShow(
                db,
                await getIssueDetail(db, await agentIssueActor(db, runner), {
                    code,
                    serverId: runner.serverId,
                })
            )
    );

    agentIssueWrite(
        app,
        db,
        { body: agentIssueCreateInputSchema, path: '/api/agent/issues/create' },
        async (runner, input) => {
            const { serverId } = runner;
            const projectId = await requireAgentHomeProject(db, runner);
            const patch = await resolvePatch(db, runner, input);
            const result = await createIssue(db, await agentIssueActor(db, runner), {
                ...patch,
                projectId,
                serverId,
                title: input.title,
            });
            return await commit(runner, result);
        }
    );

    agentIssueWrite(
        app,
        db,
        { body: agentIssueUpdateInputSchema, path: '/api/agent/issues/update' },
        async (runner, input) => {
            const { serverId } = runner;
            const issue = await findIssueByCode(db, serverId, input.code);
            const patch = await resolvePatch(db, runner, input);
            const expectAssignee = await resolveExpected(db, runner, input.expectAssignee);
            const actor = await agentIssueActor(db, runner);
            const result = await withImplicitIssueVersion(
                input.expectedVersion,
                issueVersion(serverId, input.code),
                (expectedVersion) =>
                    updateIssue(
                        db,
                        actor,
                        {
                            ...(expectAssignee === undefined ? {} : { expectAssignee }),
                            expectedVersion,
                            issueId: issue.id,
                            patch,
                            serverId,
                        },
                        writerGuard(runner)
                    )
            );
            return await commit(runner, result);
        }
    );

    agentIssueWrite(
        app,
        db,
        { body: agentIssueCommentInputSchema, path: '/api/agent/issues/comment' },
        async (runner, input) => {
            const { serverId } = runner;
            const issue = await findIssueByCode(db, serverId, input.code);
            const actor = await agentIssueActor(db, runner);
            const result = await addIssueComment(
                db,
                actor,
                {
                    body: input.body,
                    issueId: issue.id,
                    ...(input.replyTo ? { replyToCommentId: input.replyTo } : {}),
                    serverId,
                },
                writerGuard(runner)
            );
            await publish(result);
            const name = await nameIssueActors(db, serverId, [actor]);
            return { comment: toAgentComment(result.comment, name) };
        }
    );

    for (const [path, write] of [
        ['/api/agent/issues/link', linkIssueTask],
        ['/api/agent/issues/unlink', unlinkIssueTask],
    ] as const) {
        agentIssueWrite(
            app,
            db,
            { body: agentIssueLinkInputSchema, path },
            async (runner, input) => {
                const { serverId } = runner;
                const issue = await findIssueByCode(db, serverId, input.code);
                const taskId = await taskIdOfRef(db, serverId, input.taskId);
                const actor = await agentIssueActor(db, runner);
                const result = await withImplicitIssueVersion(
                    undefined,
                    issueVersion(serverId, input.code),
                    (expectedVersion) =>
                        write(
                            db,
                            actor,
                            {
                                expectedVersion,
                                issueId: issue.id,
                                serverId,
                                taskId,
                            },
                            writerGuard(runner)
                        )
                );
                return await commit(runner, result);
            }
        );
    }

    function writerGuard(runner: ResolvedRunner) {
        return (tx: IssueTx, issue: Issue) => requireIssueWriter(tx, runner, issue);
    }

    function issueVersion(serverId: string, code: string) {
        return async () => (await findIssueByCode(db, serverId, code)).version;
    }
}

async function listAgentIssues(
    db: HausDatabase,
    runner: ResolvedRunner,
    query: AgentIssueListQuery
) {
    const { serverId } = runner;
    const assignee =
        query.assignee === undefined || query.assignee === 'none'
            ? query.assignee
            : await resolveIssueActorRef(db, runner, query.assignee);
    const issues = await listIssues(db, await agentIssueActor(db, runner), {
        ...(assignee ? { assignee } : {}),
        ...(query.parent
            ? { parentId: (await findIssueByCode(db, serverId, query.parent)).id }
            : {}),
        ...(query.project
            ? { projectId: await resolveProjectKey(db, serverId, query.project) }
            : {}),
        ...(query.query ? { query: query.query } : {}),
        serverId,
        states: query.state ?? [...openIssueStates],
    });
    const page = issues.slice(0, listLimit);
    return {
        issues: await toAgentIssueRows(db, serverId, page),
        omitted: issues.length - page.length,
    };
}

async function resolvePatch(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: Omit<AgentIssueUpdateInput, 'code' | 'expectAssignee' | 'expectedVersion'>
) {
    const { serverId } = runner;
    const { assignee, description, dueOn, labels, parent, priority, state, title } = input;
    const patch: IssuePatch = {
        ...(assignee === undefined
            ? {}
            : {
                  assignee:
                      assignee === null ? null : await resolveIssueActorRef(db, runner, assignee),
              }),
        ...(description === undefined ? {} : { description }),
        ...(dueOn === undefined ? {} : { dueOn }),
        ...(labels === undefined
            ? {}
            : { labelIds: await resolveIssueLabels(db, serverId, labels) }),
        ...(parent === undefined
            ? {}
            : {
                  parentId:
                      parent === null ? null : (await findIssueByCode(db, serverId, parent)).id,
              }),
        ...(priority === undefined ? {} : { priority }),
        ...(state === undefined ? {} : { state }),
        ...(title === undefined ? {} : { title }),
    };
    return patch;
}

async function resolveExpected(
    db: HausDatabase,
    runner: ResolvedRunner,
    expected: string | null | undefined
) {
    if (expected === undefined || expected === null) {
        return expected;
    }
    return await resolveIssueActorRef(db, runner, expected);
}
