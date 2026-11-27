import { captainWarmIdleMs, type RunnerSessionPolicy, taskWarmIdleMs } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { taskDriveFolders } from '../drive/task-folders.ts';
import { readIssues } from '../issues/issue-read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    issuesTable,
    issueTaskLinksTable,
    projectsTable,
    taskKeysTable,
    tasksTable,
} from '../postgres/schema.ts';
import { readAgentHomeKey } from '../projects/agent-home.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function readRunnerSessionPolicy(
    db: Reader,
    input: { agentId: string; serverId: string }
) {
    const captain = alias(agentsTable, 'captain');
    const [agent] = await db
        .select({
            captainHandle: captain.handle,
            handle: agentsTable.handle,
            kind: agentsTable.kind,
            repo: tasksTable.repo,
            repoRef: tasksTable.repoRef,
            shortId: tasksTable.shortId,
            taskId: tasksTable.id,
            taskProjectKey: taskKeysTable.key,
            title: tasksTable.title,
        })
        .from(agentsTable)
        .leftJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, agentsTable.serverId),
                eq(tasksTable.agentId, agentsTable.id)
            )
        )
        .leftJoin(
            captain,
            and(eq(captain.serverId, tasksTable.serverId), eq(captain.id, tasksTable.captainId))
        )
        .leftJoin(
            projectsTable,
            and(
                eq(projectsTable.serverId, tasksTable.serverId),
                eq(projectsTable.chatId, tasksTable.projectId)
            )
        )
        .leftJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (!agent) {
        throw new Error(`Agent ${input.agentId} is gone, so it has no session policy.`);
    }
    if (agent.kind === 'task') {
        if (!(agent.taskProjectKey && agent.taskId && agent.shortId && agent.title)) {
            throw new Error(`Task agent ${input.agentId} has no Task in a Project.`);
        }
        const task: RunnerSessionPolicy = {
            idleCompaction: false,
            kind: 'task',
            memoryPath: null,
            rulePaths: [
                hausRules,
                `projects/${agent.taskProjectKey}/AGENTS.md`,
                ...(agent.captainHandle ? [`agents/${agent.captainHandle}/WORKER.md`] : []),
            ],
            task: {
                captainHandle: agent.captainHandle,
                driveFolders: taskDriveFolders({
                    captainHandle: agent.captainHandle,
                    projectKey: agent.taskProjectKey,
                    shortId: agent.shortId,
                }),
                issues: await readTaskIssues(db, { ...input, taskId: agent.taskId }),
                repo: agent.repo ? { name: agent.repo, ref: agent.repoRef } : null,
                shortId: agent.shortId,
                title: agent.title,
            },
            warmIdleMs: taskWarmIdleMs,
        };
        return task;
    }
    const projectKey = await readAgentHomeKey(db, input);
    const captainPolicy: RunnerSessionPolicy = {
        idleCompaction: true,
        kind: 'captain',
        memoryPath: `agents/${agent.handle}/MEMORY.md`,
        rulePaths: [
            hausRules,
            `projects/${projectKey}/AGENTS.md`,
            `agents/${agent.handle}/AGENTS.md`,
        ],
        task: null,
        warmIdleMs: captainWarmIdleMs,
    };
    return captainPolicy;
}

const hausRules = 'haus/AGENTS.md';

async function readTaskIssues(db: Reader, input: { serverId: string; taskId: string }) {
    const links = await db
        .select({ issueId: issueTaskLinksTable.issueId })
        .from(issueTaskLinksTable)
        .where(
            and(
                eq(issueTaskLinksTable.serverId, input.serverId),
                eq(issueTaskLinksTable.taskId, input.taskId)
            )
        )
        .limit(10);
    if (links.length === 0) {
        return [];
    }
    const issues = await readIssues(
        db,
        input.serverId,
        inArray(
            issuesTable.id,
            links.map((link) => link.issueId)
        )
    );
    return issues.map((issue) => ({
        code: issue.code,
        description: issue.description,
        title: issue.title,
    }));
}
