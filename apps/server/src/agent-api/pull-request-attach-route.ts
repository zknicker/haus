import { taskKeySchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';

import type { GithubApp } from '../github/github-app.ts';
import { attachPullRequestToTask } from '../github/task-pull-request-attach.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { prepareTaskUpdatedEvent } from '../tasks/task-events.ts';
import { findTask } from '../tasks/task-list.ts';
import { agentTaskWrite } from './task-route-shell.ts';
import { toAgentTaskRows } from './task-view.ts';

const attachInputSchema = z
    .object({
        key: taskKeySchema,
        url: z
            .string()
            .max(2000)
            .regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[1-9][0-9]*\/?$/u, {
                message: 'A GitHub pull request URL, like https://github.com/owner/repo/pull/12.',
            }),
    })
    .strict();

export function registerAgentPullRequestAttachRoute(
    app: FastifyInstance,
    options: { db: HausDatabase; githubApp: GithubApp | null }
) {
    const { db } = options;
    agentTaskWrite(
        app,
        db,
        { body: attachInputSchema, path: '/api/agent/tasks/attach-pr' },
        async (runner, input) => {
            const task = await findTask(db, { key: input.key, serverId: runner.serverId });
            const attached = await attachPullRequestToTask(
                { app: options.githubApp, db },
                { serverId: runner.serverId, taskId: task.id, url: input.url }
            );
            publishRealtime([prepareTaskUpdatedEvent(task)]);
            const [row] = await toAgentTaskRows(db, runner.serverId, [task]);
            if (!row) {
                throw new Error(`Task ${task.key} did not shape into a row.`);
            }
            return {
                pullRequest: {
                    number: attached.number,
                    repository: attached.repository,
                    url: attached.url,
                },
                task: row,
            };
        }
    );
}
