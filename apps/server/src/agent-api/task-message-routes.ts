import { agentTaskReportInputSchema, agentTaskSendInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { GithubApp } from '../github/github-app.ts';
import { attachPullRequestToTask } from '../github/task-pull-request-attach.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { findTaskByRef } from '../tasks/task-list.ts';
import { readTaskIdOfAgent } from '../tasks/task-of-agent.ts';
import { reportTaskTurn } from '../tasks/task-report.ts';
import { sendToTask } from '../tasks/task-send.ts';
import { publishTaskSessionResets } from '../tasks/task-session.ts';
import { agentTaskWrite } from './task-route-shell.ts';
import { toAgentTaskRows } from './task-view.ts';

export function registerAgentTaskMessageRoutes(
    app: FastifyInstance,
    options: {
        agentDelivery: AgentDelivery;
        db: HausDatabase;
        githubApp: GithubApp | null;
        postCommitWork: ServerPostCommitWork;
    }
) {
    const { agentDelivery, db, postCommitWork } = options;

    agentTaskWrite(
        app,
        db,
        { body: agentTaskSendInputSchema, path: '/api/agent/tasks/send' },
        async (runner, input) => {
            const { serverId } = runner;
            const target = await findTaskByRef(db, { ref: input.task, serverId });
            const sent = await sendToTask(db, agentDelivery, {
                body: input.body,
                delivery: input.delivery,
                runId: runner.runId,
                senderAgentId: runner.agentId,
                serverId,
                taskId: target.id,
            });
            publishTaskSessionResets(sent.sessions);
            for (const activity of sent.activities) {
                publishCommittedAgentActivity(activity);
            }
            publishRealtime(sent.events);
            void postCommitWork.wakeRecipients(agentDelivery, sent);
            const [task] = await toAgentTaskRows(db, serverId, [sent.task]);
            return { message: sent.message, task };
        }
    );

    agentTaskWrite(
        app,
        db,
        { body: agentTaskReportInputSchema, path: '/api/agent/tasks/report' },
        async (runner, input) => {
            const { serverId } = runner;
            const taskId = await readTaskIdOfAgent(db, runner);
            for (const url of input.pullRequestUrls) {
                await attachPullRequestToTask(
                    { app: options.githubApp, db },
                    { serverId, taskId, url }
                );
            }
            const reported = await reportTaskTurn(db, agentDelivery, {
                ...input,
                agentId: runner.agentId,
                runId: runner.runId,
                serverId,
            });
            for (const activity of reported.activities) {
                publishCommittedAgentActivity(activity);
            }
            publishRealtime(reported.events);
            void postCommitWork.wakeAgents(agentDelivery, reported.wakes);
            const [task] = await toAgentTaskRows(db, serverId, [reported.task]);
            return { message: reported.message, reachesCaptain: reported.reachesCaptain, task };
        }
    );
}
