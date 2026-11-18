import { type CloudAgentPullRequestReading, parseGithubPullRequestUrl } from '@haus/api';
import { and, eq } from 'drizzle-orm';

import { toPullRequestReading } from '../cloud-agents/pull-request-readings.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentPullRequestsTable, taskPullRequestsTable } from '../postgres/schema.ts';
import { GithubApiError } from './github-api.ts';
import type { GithubApp } from './github-app.ts';
import { createInstallationTokens } from './github-bot.ts';
import { type GithubPullRequestFacts, readGithubPullRequest } from './pull-request-read.ts';
import { findPullRequestInstallation } from './pull-request-refresh.ts';

export class PullRequestUrlError extends Error {
    constructor() {
        super('That is not a GitHub pull request URL, like https://github.com/owner/repo/pull/12.');
        this.name = 'PullRequestUrlError';
    }
}

export interface AttachedTaskPullRequest {
    number: number;
    reading: CloudAgentPullRequestReading | null;
    repository: string;
    url: string;
}

export async function attachPullRequestToTask(
    dependencies: { app: GithubApp | null; db: HausDatabase },
    input: { serverId: string; taskId: string; url: string }
): Promise<AttachedTaskPullRequest> {
    const key = parseGithubPullRequestUrl(input.url);
    if (!key) {
        throw new PullRequestUrlError();
    }
    const pull = { ...key, serverId: input.serverId };
    const existing = await readStoredReading(dependencies.db, pull);
    const facts = existing ? null : await readOnce(dependencies, pull);
    const url = `https://github.com/${key.repository}/pull/${key.number}`;
    const reading = await dependencies.db.transaction(async (tx) => {
        await tx
            .insert(taskPullRequestsTable)
            .values({ ...pull, taskId: input.taskId })
            .onConflictDoNothing();
        if (facts) {
            await tx
                .insert(cloudAgentPullRequestsTable)
                .values({ ...pull, ...facts, observedAt: new Date(), source: 'github', url })
                .onConflictDoNothing();
        }
        return await readStoredReading(tx, pull);
    });
    return { ...key, reading: reading ? toPullRequestReading(reading) : null, url };
}

async function readStoredReading(
    db: Pick<HausDatabase, 'select'>,
    pull: { number: number; repository: string; serverId: string }
) {
    const [row] = await db
        .select()
        .from(cloudAgentPullRequestsTable)
        .where(
            and(
                eq(cloudAgentPullRequestsTable.serverId, pull.serverId),
                eq(cloudAgentPullRequestsTable.repository, pull.repository),
                eq(cloudAgentPullRequestsTable.number, pull.number)
            )
        )
        .limit(1);
    return row ?? null;
}

async function readOnce(
    dependencies: { app: GithubApp | null; db: HausDatabase },
    pull: { number: number; repository: string; serverId: string }
): Promise<GithubPullRequestFacts | null> {
    const { app } = dependencies;
    const installationId = app ? await findPullRequestInstallation(dependencies.db, pull) : null;
    if (!(app && installationId !== null)) {
        return null;
    }
    try {
        const token = await createInstallationTokens(app).read(installationId);
        return await readGithubPullRequest({ ...pull, token }, app.transport);
    } catch (error) {
        if (error instanceof GithubApiError) {
            return null;
        }
        throw error;
    }
}
