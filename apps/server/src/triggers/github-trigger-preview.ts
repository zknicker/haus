import type { GithubTriggerPreviewInput, Trigger } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { field } from '../github/event-projection/payload.ts';
import { matchesGithubGroup, repositoryInScope } from '../github/trigger-matching.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable, githubTriggerConfigsTable } from '../postgres/schema.ts';
import { requireGithubTrigger } from './github-trigger-writes.ts';

/** Selection preview only: never records a delivery, spends budget, or wakes an Agent. */
export async function previewGithubTrigger(
    db: HausDatabase,
    serverId: string,
    trigger: Trigger,
    input: GithubTriggerPreviewInput
) {
    const github = requireGithubTrigger(trigger).github;
    const [scope] = await db
        .select({
            accessibleRepositoryIds: githubInstallationsTable.accessibleRepositoryIds,
            repositoryIds: githubTriggerConfigsTable.repositoryIds,
            repositoryScope: githubTriggerConfigsTable.repositoryScope,
        })
        .from(githubTriggerConfigsTable)
        .innerJoin(
            githubInstallationsTable,
            and(
                eq(githubInstallationsTable.serverId, githubTriggerConfigsTable.serverId),
                eq(githubInstallationsTable.id, githubTriggerConfigsTable.installationRowId)
            )
        )
        .where(
            and(
                eq(githubTriggerConfigsTable.serverId, serverId),
                eq(githubTriggerConfigsTable.triggerId, trigger.id)
            )
        )
        .limit(1);
    const repositoryId = field(field(input.payload, 'repository'), 'id');
    const inScope =
        scope !== undefined &&
        typeof repositoryId === 'number' &&
        repositoryInScope({
            accessibleRepositoryIds: scope.accessibleRepositoryIds,
            repositoryId,
            scope,
        });
    const groups = github.events.map((entry, index) => ({
        index,
        matches: matchesGithubGroup(entry, input.event, input.payload),
    }));
    return {
        groups,
        matches: inScope && groups.some((group) => group.matches),
        repositoryInScope: inScope,
    };
}
